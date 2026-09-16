package com.dayflow.api.auth;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request/response bodies of /api/v1/auth (AUTH-001, AUTH-004). */
public final class AuthDtos {

    private AuthDtos() {
    }

    /** The code from the callback URL, the PKCE verifier the client kept, and the platform it started with. */
    public record ExchangeCodeRequest(
            @NotBlank @Size(max = 100) String code,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9\\-._~]{43,128}$", message = "must be a PKCE code verifier")
            String codeVerifier,
            @NotNull AuthPlatform platform) {
    }

    /** MOBILE sends its refresh token here; WEB sends no body, its token is the HttpOnly cookie. */
    public record RefreshTokenRequest(
            @Schema(types = {"string", "null"}, description = "MOBILE only; WEB uses the refresh cookie")
            @Size(max = 100) String refreshToken) {
    }

    public record LogoutRequest(
            @Schema(types = {"string", "null"}, description = "MOBILE only; WEB uses the refresh cookie")
            @Size(max = 100) String refreshToken) {
    }

    /**
     * A new DayFlow session. The access token goes to memory only. WEB never gets the refresh token in the body
     * (it is set as an HttpOnly cookie); MOBILE gets it here and stores it in secure storage.
     */
    public record AuthTokenResponse(
            @Schema(requiredMode = REQUIRED) String accessToken,
            @Schema(requiredMode = REQUIRED, allowableValues = "Bearer") String tokenType,
            @Schema(requiredMode = REQUIRED, description = "Access token lifetime in seconds") long expiresIn,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"},
                    description = "MOBILE: the new refresh token; always null for WEB")
            String refreshToken,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"},
                    description = "Exchange only: the app route the login started from, or null")
            String returnTo) {
    }
}
