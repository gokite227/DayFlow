package com.dayflow.api.auth;

import com.dayflow.api.auth.AuthDtos.AuthTokenResponse;
import com.dayflow.api.auth.AuthDtos.ExchangeCodeRequest;
import com.dayflow.api.auth.AuthDtos.LogoutRequest;
import com.dayflow.api.auth.AuthDtos.RefreshTokenRequest;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.DayFlowProperties;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.common.ProblemResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * AUTH-001 / AUTH-004. The browser-facing start redirect and the JSON endpoints that exchange, refresh and
 * revoke DayFlow sessions. None of them needs an access token.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final RefreshCookies refreshCookies;
    private final DayFlowProperties properties;

    public AuthController(AuthService authService, RefreshCookies refreshCookies, DayFlowProperties properties) {
        this.authService = authService;
        this.refreshCookies = refreshCookies;
        this.properties = properties;
    }

    /**
     * Opened by the browser (Web page or the Mobile system browser), not by fetch. Remembers the client's PKCE
     * challenge in the short login session and continues to Google.
     */
    @GetMapping("/google/start")
    @ResponseStatus(HttpStatus.FOUND)
    @Operation(operationId = "startGoogleLogin", summary = "Start Google login (browser redirect)")
    @ApiResponse(responseCode = "302", description = "Redirect to Google; afterwards to the client callback with ?code=")
    @ApiResponse(responseCode = "400", description = "Invalid platform, PKCE challenge or returnTo (INVALID_AUTH_REQUEST)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "503", description = "Google login is not configured on this server",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public ResponseEntity<Void> startGoogleLogin(
            @RequestParam AuthPlatform platform,
            @Parameter(description = "base64url(SHA-256(codeVerifier))") @RequestParam String codeChallenge,
            @Parameter(description = "Always S256") @RequestParam String codeChallengeMethod,
            @Parameter(description = "App route to return to after login, e.g. /goals") @RequestParam(required = false) String returnTo,
            HttpServletRequest request) {
        if (!properties.google().configured()) {
            throw new ApiException(ErrorCode.GOOGLE_LOGIN_NOT_CONFIGURED,
                    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the API server to enable Google login.");
        }
        PendingLogin login = PendingLogin.of(platform, codeChallenge, codeChallengeMethod, returnTo);
        // A fresh session per login attempt; it only holds this pending login and Spring's OAuth state.
        var existing = request.getSession(false);
        if (existing != null) {
            existing.invalidate();
        }
        request.getSession(true).setAttribute(PendingLogin.SESSION_ATTRIBUTE, login);
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(GoogleOAuthConfig.AUTHORIZATION_PATH)).build();
    }

    @PostMapping("/exchange")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "exchangeLoginCode")
    @ApiResponse(responseCode = "400", description = "Unknown, used or expired code, wrong verifier or platform (INVALID_AUTH_CODE)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public ResponseEntity<AuthTokenResponse> exchange(@Valid @RequestBody ExchangeCodeRequest request) {
        return session(authService.exchange(request));
    }

    /** MOBILE: refresh token in the body. WEB: no body, the HttpOnly cookie; the Origin must be an allowed Web origin. */
    @PostMapping("/refresh")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "refreshSession")
    @ApiResponse(responseCode = "400", description = "Cookie refresh from an origin that is not allowed (INVALID_AUTH_REQUEST)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "401", description = "Missing, expired, revoked or reused refresh token (INVALID_REFRESH_TOKEN)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public ResponseEntity<AuthTokenResponse> refresh(
            @Valid @RequestBody(required = false) RefreshTokenRequest body,
            @Parameter(hidden = true) @CookieValue(name = RefreshCookies.NAME, required = false) String cookie,
            HttpServletRequest request) {
        if (body != null && body.refreshToken() != null) {
            return session(authService.refresh(body.refreshToken(), AuthPlatform.MOBILE));
        }
        if (cookie != null && !cookie.isEmpty()) {
            requireAllowedOrigin(request);
            return session(authService.refresh(cookie, AuthPlatform.WEB));
        }
        throw new ApiException(ErrorCode.INVALID_REFRESH_TOKEN, "No refresh token. Sign in again.");
    }

    /** Revokes the session's refresh token family and clears the Web cookie. Always 204. */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "logout")
    @ApiResponse(responseCode = "400", description = "Cookie logout from an origin that is not allowed (INVALID_AUTH_REQUEST)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public ResponseEntity<Void> logout(
            @Valid @RequestBody(required = false) LogoutRequest body,
            @Parameter(hidden = true) @CookieValue(name = RefreshCookies.NAME, required = false) String cookie,
            HttpServletRequest request) {
        ResponseEntity.HeadersBuilder<?> response = ResponseEntity.noContent();
        if (body != null && body.refreshToken() != null) {
            authService.logout(body.refreshToken());
        }
        if (cookie != null) {
            requireAllowedOrigin(request);
            if (!cookie.isEmpty()) {
                authService.logout(cookie);
            }
            response.header(HttpHeaders.SET_COOKIE, refreshCookies.clear().toString());
        }
        return response.build();
    }

    private ResponseEntity<AuthTokenResponse> session(AuthService.Session session) {
        boolean web = session.platform() == AuthPlatform.WEB;
        AuthTokenResponse body = new AuthTokenResponse(session.accessToken().value(), "Bearer",
                session.accessToken().expiresInSeconds(), web ? null : session.refreshToken().value(),
                session.returnTo());
        ResponseEntity.BodyBuilder response = ResponseEntity.ok().cacheControl(CacheControl.noStore());
        if (web) {
            response.header(HttpHeaders.SET_COOKIE, refreshCookies.issue(session.refreshToken()).toString());
        }
        return response.body(body);
    }

    /**
     * A cookie is sent by the browser on its own, so a cookie-based call must come from the DayFlow Web app
     * (CSRF protection). Browsers always send Origin on fetch POST requests.
     */
    private void requireAllowedOrigin(HttpServletRequest request) {
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        if (origin == null || !properties.web().allowedOrigins().contains(origin)) {
            throw new ApiException(ErrorCode.INVALID_AUTH_REQUEST, "This origin cannot use the DayFlow session cookie.");
        }
    }
}
