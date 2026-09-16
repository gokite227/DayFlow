package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dayflow.api.auth.AccessTokenService;
import com.dayflow.api.auth.AuthPlatform;
import com.dayflow.api.auth.GoogleLoginHandler;
import com.dayflow.api.auth.LoginCompletionService;
import com.dayflow.api.auth.PendingLogin;
import com.dayflow.api.auth.RefreshCookies;
import com.dayflow.api.auth.SecureTokens;
import com.dayflow.api.user.AuthProvider;
import com.dayflow.api.user.ExternalIdentity;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * AUTH-001 / AUTH-004 end to end on the real filter chain and PostgreSQL. Google itself is never called: the
 * Google step is replaced by {@link LoginCompletionService} (the same code the Google success handler runs)
 * or by driving {@link GoogleLoginHandler} with a Google-shaped principal.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AuthFlowIntegrationTest {

    private static final String WEB_ORIGIN = "http://localhost:3000";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private LoginCompletionService completion;

    @Autowired
    private GoogleLoginHandler googleLoginHandler;

    @Autowired
    private AccessTokenService accessTokens;

    @Autowired
    private JdbcTemplate jdbc;

    // ----- Google login start and callback -----

    @Test
    void googleStartKeepsThePkceLoginInASessionAndContinuesToGoogle() throws Exception {
        Pkce pkce = Pkce.create();
        MvcResult start = mvc.perform(get("/api/v1/auth/google/start")
                        .param("platform", "WEB").param("codeChallenge", pkce.challenge())
                        .param("codeChallengeMethod", "S256").param("returnTo", "/goals"))
                .andExpect(status().isFound())
                .andExpect(header().string(HttpHeaders.LOCATION, "/oauth2/authorization/google"))
                .andReturn();
        MockHttpSession session = (MockHttpSession) start.getRequest().getSession(false);
        assertThat(session.getAttribute(PendingLogin.SESSION_ATTRIBUTE))
                .isEqualTo(new PendingLogin(AuthPlatform.WEB, pkce.challenge(), "/goals"));

        String google = mvc.perform(get("/oauth2/authorization/google").session(session))
                .andExpect(status().isFound())
                .andReturn().getResponse().getHeader(HttpHeaders.LOCATION);
        assertThat(google).startsWith("https://accounts.google.com/o/oauth2/v2/auth")
                .contains("client_id=test-google-client-id")
                .contains("redirect_uri=http://localhost:8080/login/oauth2/code/google")
                .contains("scope=openid%20email%20profile");

        mvc.perform(get("/api/v1/auth/google/start").param("platform", "WEB").param("codeChallenge", "short")
                        .param("codeChallengeMethod", "S256"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_AUTH_REQUEST"));
        mvc.perform(get("/api/v1/auth/google/start").param("platform", "WEB").param("codeChallenge", pkce.challenge())
                        .param("codeChallengeMethod", "S256").param("returnTo", "https://evil.example"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_AUTH_REQUEST"));
    }

    @Test
    void googleCallbackRedirectsWithOnlyAOneTimeCodeAndDropsTheSession() throws Exception {
        Pkce pkce = Pkce.create();
        String subject = "google-" + UUID.randomUUID();
        MockHttpServletResponse response = googleCallback(new PendingLogin(AuthPlatform.MOBILE, pkce.challenge(), null),
                Map.of("sub", subject, "email", "callback@example.com", "email_verified", true, "name", "Callback"));

        String location = response.getRedirectedUrl();
        assertThat(location).startsWith("dayflow://auth/callback?code=").doesNotContain("token");
        String body = exchange(codeOf(location), pkce.verifier(), "MOBILE").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        me(JsonPath.read(body, "$.accessToken"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("callback@example.com"))
                .andExpect(jsonPath("$.displayName").value("Callback"));

        MockHttpServletResponse unverified = googleCallback(new PendingLogin(AuthPlatform.WEB, pkce.challenge(), null),
                Map.of("sub", "google-" + UUID.randomUUID(), "email", "x@example.com", "email_verified", false));
        assertThat(unverified.getRedirectedUrl()).isEqualTo("http://localhost:3000/auth/callback?error=account_not_verified");
    }

    @Test
    void devLoginReachesTheWebCallbackWithACode() throws Exception {
        Pkce pkce = Pkce.create();
        String location = mvc.perform(get("/api/v1/auth/dev/login").param("platform", "WEB")
                        .param("codeChallenge", pkce.challenge()).param("codeChallengeMethod", "S256")
                        .param("returnTo", "/calendar").param("subject", "flow-" + Math.abs(UUID.randomUUID().hashCode()))
                        .param("email", "dev@example.com"))
                .andExpect(status().isFound())
                .andReturn().getResponse().getHeader(HttpHeaders.LOCATION);
        assertThat(location).startsWith("http://localhost:3000/auth/callback?code=");

        exchange(codeOf(location), pkce.verifier(), "WEB")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.returnTo").value("/calendar"));
    }

    // ----- Exchange -----

    @Test
    void mobileExchangeReturnsBothTokensInTheBody() throws Exception {
        Pkce pkce = Pkce.create();
        String code = loginCode(AuthPlatform.MOBILE, pkce, "/today");

        exchange(code, pkce.verifier(), "MOBILE")
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(900))
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.returnTo").value("/today"));
    }

    @Test
    void webExchangeSetsAnHttpOnlyCookieAndNeverReturnsTheRefreshToken() throws Exception {
        Pkce pkce = Pkce.create();
        MockHttpServletResponse response = exchange(loginCode(AuthPlatform.WEB, pkce, null), pkce.verifier(), "WEB")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refreshToken").value(nullValue()))
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andReturn().getResponse();

        String setCookie = response.getHeader(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).startsWith(RefreshCookies.NAME + "=")
                .contains("Path=/api/v1/auth", "HttpOnly", "SameSite=Lax", "Max-Age=2592000")
                .doesNotContain("Secure");
        String cookieToken = response.getCookie(RefreshCookies.NAME).getValue();
        assertThat(response.getContentAsString()).doesNotContain(cookieToken);
        // Only the hash is stored.
        assertThat(jdbc.queryForObject("select count(*) from auth_refresh_tokens where token_hash = ?", Integer.class,
                SecureTokens.sha256Hex(cookieToken))).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from auth_refresh_tokens where token_hash = ?", Integer.class,
                cookieToken)).isZero();
    }

    @Test
    void exchangeRejectsExpiredReusedWrongVerifierAndOtherPlatformCodes() throws Exception {
        Pkce pkce = Pkce.create();

        String valid = loginCode(AuthPlatform.MOBILE, pkce, null);
        exchange(valid, pkce.verifier(), "MOBILE").andExpect(status().isOk());
        exchange(valid, pkce.verifier(), "MOBILE")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_AUTH_CODE"));

        String expired = loginCode(AuthPlatform.MOBILE, pkce, null);
        jdbc.update("update auth_exchange_codes set expires_at = now() - interval '1 second' where code_hash = ?",
                SecureTokens.sha256Hex(expired));
        exchange(expired, pkce.verifier(), "MOBILE")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_AUTH_CODE"));

        String wrongVerifier = loginCode(AuthPlatform.MOBILE, pkce, null);
        exchange(wrongVerifier, Pkce.create().verifier(), "MOBILE")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_AUTH_CODE"));
        // The failed attempt burned the code.
        exchange(wrongVerifier, pkce.verifier(), "MOBILE").andExpect(status().isBadRequest());

        // A WEB login cannot be turned into a MOBILE session (refresh token in the body).
        String webCode = loginCode(AuthPlatform.WEB, pkce, null);
        exchange(webCode, pkce.verifier(), "MOBILE")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_AUTH_CODE"));

        exchange("unknown-code", pkce.verifier(), "WEB").andExpect(status().isBadRequest());
        // Only the hash of a code is ever stored.
        assertThat(jdbc.queryForObject("select count(*) from auth_exchange_codes where code_hash = ?", Integer.class, valid))
                .isZero();
    }

    // ----- Access token -----

    @Test
    void protectedApiRequiresAValidUnexpiredUntamperedAccessToken() throws Exception {
        UUID userId = signIn("jwt");
        String valid = accessTokens.issue(userId).value();

        me(valid).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.providerSubject").doesNotExist())
                .andExpect(jsonPath("$.*", org.hamcrest.Matchers.hasSize(4)));

        for (String path : List.of("/api/v1/me", "/api/v1/goals", "/api/v1/days", "/api/v1/day-tags", "/api/v1/events",
                "/api/v1/event-categories", "/api/v1/recovery/events")) {
            mvc.perform(get(path))
                    .andExpect(status().isUnauthorized())
                    .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer"))
                    .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        }

        String expired = accessTokens.issue(userId, Instant.now().minus(1, ChronoUnit.HOURS)).value();
        me(expired).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        String[] parts = valid.split("\\.");
        String otherUserClaims = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8)
                .replace(userId.toString(), UUID.randomUUID().toString());
        String tampered = parts[0] + "." + Base64.getUrlEncoder().withoutPadding()
                .encodeToString(otherUserClaims.getBytes(StandardCharsets.UTF_8)) + "." + parts[2];
        me(tampered).andExpect(status().isUnauthorized());
        me(parts[0] + "." + parts[1] + "." + parts[2].substring(0, parts[2].length() - 2) + "xx")
                .andExpect(status().isUnauthorized());
        me("not-a-jwt").andExpect(status().isUnauthorized());
    }

    // ----- Refresh and logout -----

    @Test
    void mobileRefreshRotatesTheTokenAndDetectsReuse() throws Exception {
        Session first = mobileSession("rotate");

        String rotatedBody = refreshMobile(first.refreshToken())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.returnTo").value(nullValue()))
                .andReturn().getResponse().getContentAsString();
        Session second = Session.of(rotatedBody);
        assertThat(second.refreshToken()).isNotEqualTo(first.refreshToken());
        me(second.accessToken()).andExpect(status().isOk());

        // Right after the rotation (another tab/request racing): rejected, but the new token keeps working.
        refreshMobile(first.refreshToken()).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));
        Session third = Session.of(refreshMobile(second.refreshToken()).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        // Later reuse of a rotated token means it leaked: the whole family is revoked.
        jdbc.update("update auth_refresh_tokens set revoked_at = now() - interval '1 minute' where token_hash = ?",
                SecureTokens.sha256Hex(second.refreshToken()));
        refreshMobile(second.refreshToken()).andExpect(status().isUnauthorized());
        refreshMobile(third.refreshToken()).andExpect(status().isUnauthorized());
    }

    @Test
    void refreshRejectsExpiredRevokedAndLoggedOutTokens() throws Exception {
        Session expired = mobileSession("expired");
        jdbc.update("update auth_refresh_tokens set expires_at = now() - interval '1 second' where token_hash = ?",
                SecureTokens.sha256Hex(expired.refreshToken()));
        refreshMobile(expired.refreshToken()).andExpect(status().isUnauthorized());

        Session revoked = mobileSession("revoked");
        jdbc.update("update auth_refresh_tokens set revoked_at = now() where token_hash = ?",
                SecureTokens.sha256Hex(revoked.refreshToken()));
        refreshMobile(revoked.refreshToken()).andExpect(status().isUnauthorized());

        Session loggedOut = mobileSession("logout");
        mvc.perform(post("/api/v1/auth/logout").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\": \"" + loggedOut.refreshToken() + "\"}"))
                .andExpect(status().isNoContent());
        refreshMobile(loggedOut.refreshToken()).andExpect(status().isUnauthorized());
        // Logging out twice or with an unknown token is harmless.
        mvc.perform(post("/api/v1/auth/logout").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\": \"unknown\"}"))
                .andExpect(status().isNoContent());

        refreshMobile("never-issued").andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/refresh")).andExpect(status().isUnauthorized());
    }

    @Test
    void webRefreshUsesOnlyTheCookieFromAnAllowedOriginAndLogoutClearsIt() throws Exception {
        Pkce pkce = Pkce.create();
        MockHttpServletResponse login = exchange(loginCode(AuthPlatform.WEB, pkce, null), pkce.verifier(), "WEB")
                .andReturn().getResponse();
        Cookie cookie = login.getCookie(RefreshCookies.NAME);

        // Without the Web origin the cookie is not accepted (CSRF), and nothing is rotated.
        mvc.perform(post("/api/v1/auth/refresh").cookie(cookie))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_AUTH_REQUEST"));
        // Another site is already stopped by CORS before the endpoint runs.
        mvc.perform(post("/api/v1/auth/refresh").cookie(cookie).header(HttpHeaders.ORIGIN, "https://evil.example"))
                .andExpect(status().isForbidden());
        // A WEB token sent in the body (as MOBILE would) is refused.
        refreshMobile(cookie.getValue()).andExpect(status().isUnauthorized());

        MockHttpServletResponse refreshed = mvc.perform(post("/api/v1/auth/refresh").cookie(cookie)
                        .header(HttpHeaders.ORIGIN, WEB_ORIGIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refreshToken").value(nullValue()))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, startsWith(RefreshCookies.NAME + "=")))
                .andReturn().getResponse();
        Cookie rotated = refreshed.getCookie(RefreshCookies.NAME);
        assertThat(rotated.getValue()).isNotEqualTo(cookie.getValue());
        me(JsonPath.read(refreshed.getContentAsString(), "$.accessToken")).andExpect(status().isOk());

        mvc.perform(post("/api/v1/auth/logout").cookie(rotated).header(HttpHeaders.ORIGIN, WEB_ORIGIN))
                .andExpect(status().isNoContent())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=0")))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, not(containsString(rotated.getValue()))));
        mvc.perform(post("/api/v1/auth/refresh").cookie(rotated).header(HttpHeaders.ORIGIN, WEB_ORIGIN))
                .andExpect(status().isUnauthorized());
    }

    // ----- helpers -----

    private record Pkce(String verifier, String challenge) {

        static Pkce create() {
            String verifier = SecureTokens.randomToken();
            return new Pkce(verifier, SecureTokens.s256Challenge(verifier));
        }
    }

    private record Session(String accessToken, String refreshToken) {

        static Session of(String body) {
            return new Session(JsonPath.read(body, "$.accessToken"), JsonPath.read(body, "$.refreshToken"));
        }
    }

    private MockHttpServletResponse googleCallback(PendingLogin login, Map<String, Object> claims) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(PendingLogin.SESSION_ATTRIBUTE, login);
        request.setSession(session);
        MockHttpServletResponse response = new MockHttpServletResponse();
        DefaultOAuth2User principal = new DefaultOAuth2User(AuthorityUtils.createAuthorityList("OIDC_USER"), claims, "sub");
        googleLoginHandler.onAuthenticationSuccess(request, response,
                new OAuth2AuthenticationToken(principal, principal.getAuthorities(), "google"));
        assertThat(session.isInvalid()).isTrue();
        return response;
    }

    private String loginCode(AuthPlatform platform, Pkce pkce, String returnTo) {
        URI callback = completion.complete(identity("flow-" + UUID.randomUUID()),
                PendingLogin.of(platform, pkce.challenge(), "S256", returnTo));
        return codeOf(callback.toString());
    }

    private UUID signIn(String label) throws Exception {
        Session session = mobileSession(label);
        return UUID.fromString(JsonPath.read(me(session.accessToken()).andReturn().getResponse().getContentAsString(), "$.id"));
    }

    private Session mobileSession(String label) throws Exception {
        Pkce pkce = Pkce.create();
        String code = codeOf(completion.complete(identity(label + "-" + UUID.randomUUID()),
                PendingLogin.of(AuthPlatform.MOBILE, pkce.challenge(), "S256", null)).toString());
        return Session.of(exchange(code, pkce.verifier(), "MOBILE").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private static ExternalIdentity identity(String subject) {
        return new ExternalIdentity(AuthProvider.GOOGLE, subject, subject + "@example.com", subject, null);
    }

    private static String codeOf(String callback) {
        return UriComponentsBuilder.fromUriString(callback).build().getQueryParams().getFirst("code");
    }

    private ResultActions exchange(String code, String verifier, String platform) throws Exception {
        return mvc.perform(post("/api/v1/auth/exchange").contentType(MediaType.APPLICATION_JSON).content("""
                {"code": "%s", "codeVerifier": "%s", "platform": "%s"}
                """.formatted(code, verifier, platform)));
    }

    private ResultActions refreshMobile(String refreshToken) throws Exception {
        return mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\": \"" + refreshToken + "\"}"));
    }

    private ResultActions me(String accessToken) throws Exception {
        return mvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken));
    }
}
