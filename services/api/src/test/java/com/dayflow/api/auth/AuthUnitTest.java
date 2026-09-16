package com.dayflow.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.DayFlowProperties;
import com.dayflow.api.common.DayFlowProperties.Auth;
import com.dayflow.api.common.DayFlowProperties.Google;
import com.dayflow.api.common.DayFlowProperties.Mobile;
import com.dayflow.api.common.DayFlowProperties.RefreshCookie;
import com.dayflow.api.common.DayFlowProperties.Web;
import com.dayflow.api.user.AuthProvider;
import com.dayflow.api.user.ExternalIdentity;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** AUTH-001 PKCE and token helpers, Google claim mapping and production configuration checks (no Spring). */
class AuthUnitTest {

    @Test
    void pkceS256MatchesTheRfc7636Example() {
        // RFC 7636 Appendix B.
        assertThat(SecureTokens.s256Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
                .isEqualTo("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        assertThat(SecureTokens.isS256Challenge("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).isTrue();
        assertThat(SecureTokens.isS256Challenge("too-short")).isFalse();
    }

    @Test
    void randomTokensAreUrlSafeUniqueAndStoredOnlyAsHashes() {
        String first = SecureTokens.randomToken();
        String second = SecureTokens.randomToken();
        assertThat(first).hasSize(43).matches("^[A-Za-z0-9_-]+$").isNotEqualTo(second);
        // A random token is also a valid PKCE verifier.
        assertThat(SecureTokens.isCodeVerifier(first)).isTrue();
        assertThat(SecureTokens.sha256Hex(first)).hasSize(64).doesNotContain(first).isEqualTo(SecureTokens.sha256Hex(first));
        assertThat(SecureTokens.isCodeVerifier("short")).isFalse();
        assertThat(SecureTokens.isCodeVerifier("a".repeat(129))).isFalse();
    }

    @Test
    void pendingLoginAcceptsOnlyS256AndAppRoutes() {
        String challenge = SecureTokens.s256Challenge(SecureTokens.randomToken());
        assertThat(PendingLogin.of(AuthPlatform.WEB, challenge, "S256", "/goals/1?tab=week").returnTo())
                .isEqualTo("/goals/1?tab=week");
        assertThat(PendingLogin.of(AuthPlatform.MOBILE, challenge, "S256", "  ").returnTo()).isNull();

        for (String unsafe : List.of("https://evil.example", "//evil.example", "/\\evil.example", "goals", "/a b")) {
            assertThatThrownBy(() -> PendingLogin.of(AuthPlatform.WEB, challenge, "S256", unsafe))
                    .as(unsafe).isInstanceOf(ApiException.class);
        }
        assertThatThrownBy(() -> PendingLogin.of(AuthPlatform.WEB, challenge, "plain", null)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> PendingLogin.of(AuthPlatform.WEB, "not-a-challenge", "S256", null))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> PendingLogin.of(null, challenge, "S256", null)).isInstanceOf(ApiException.class);
    }

    @Test
    void googleIdentityUsesTheStableSubjectAndRequiresAVerifiedEmail() {
        ExternalIdentity identity = GoogleIdentities.fromClaims(Map.of(
                "sub", "10987654321", "email", "a@example.com", "email_verified", true,
                "name", "Ada", "picture", "https://lh3.googleusercontent.com/a"));
        assertThat(identity).isEqualTo(new ExternalIdentity(AuthProvider.GOOGLE, "10987654321", "a@example.com", "Ada",
                "https://lh3.googleusercontent.com/a"));

        // Without a name the email is the display name.
        assertThat(GoogleIdentities.fromClaims(Map.of("sub", "1", "email", "b@example.com", "email_verified", "true"))
                .displayName()).isEqualTo("b@example.com");
        assertThatThrownBy(() -> GoogleIdentities.fromClaims(Map.of("sub", "1", "email", "c@example.com", "email_verified", false)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> GoogleIdentities.fromClaims(Map.of("email", "c@example.com", "email_verified", true)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void productionConfigurationRejectsDevelopmentValues() {
        DayFlowProperties local = properties("http://localhost:8080", "http://localhost:3000",
                List.of("http://localhost:3000"), new Google("", ""), ProductionConfigValidator.LOCAL_JWT_SECRET,
                new RefreshCookie(false, "Lax"), true);
        assertThat(ProductionConfigValidator.problems(local)).hasSize(7);

        DayFlowProperties production = properties("https://api.dayflow.app", "https://dayflow.app",
                List.of("https://dayflow.app"), new Google("client-id", "client-secret"),
                "a-real-server-secret-of-at-least-32-bytes!", new RefreshCookie(true, "Lax"), false);
        assertThat(ProductionConfigValidator.problems(production)).isEmpty();

        // Values pasted from a browser address bar keep working: trailing slashes are removed.
        DayFlowProperties pasted = properties("https://dayflow-api.up.railway.app/", "https://dayflow.vercel.app/",
                List.of(" https://dayflow.vercel.app/ "), new Google("client-id", "client-secret"),
                "a-real-server-secret-of-at-least-32-bytes!", new RefreshCookie(true, "Lax"), false);
        assertThat(pasted.publicBaseUrl()).isEqualTo("https://dayflow-api.up.railway.app");
        assertThat(pasted.web().url()).isEqualTo("https://dayflow.vercel.app");
        assertThat(pasted.web().allowedOrigins()).containsExactly("https://dayflow.vercel.app");
        assertThat(ProductionConfigValidator.problems(pasted)).isEmpty();

        assertThatThrownBy(() -> properties("https://api.dayflow.app", "https://dayflow.app", List.of(),
                new Google(null, null), "short", new RefreshCookie(true, "Lax"), false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("DAYFLOW_JWT_SECRET");
    }

    private static DayFlowProperties properties(String publicBaseUrl, String webUrl, List<String> origins, Google google,
            String jwtSecret, RefreshCookie cookie, boolean devLogin) {
        return new DayFlowProperties(publicBaseUrl, new Web(webUrl, origins), new Mobile(null), google,
                new Auth(jwtSecret, null, null, null, null, cookie, devLogin));
    }
}
