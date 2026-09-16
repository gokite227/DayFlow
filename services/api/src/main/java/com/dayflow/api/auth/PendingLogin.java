package com.dayflow.api.auth;

import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import java.io.Serializable;
import java.util.regex.Pattern;

/**
 * What a client asked for when it started a login: its platform, its PKCE challenge and the route to return
 * to. It waits in the short-lived login session while the user is at Google, and is then bound to the
 * exchange code.
 *
 * @param returnTo an app-relative route such as {@code /goals/123}, or null
 */
public record PendingLogin(AuthPlatform platform, String codeChallenge, String returnTo) implements Serializable {

    /** Session attribute of the login in progress. */
    public static final String SESSION_ATTRIBUTE = PendingLogin.class.getName();

    /** Only same-app paths: "/..." but not "//host" or "/\host", no whitespace. */
    private static final Pattern RETURN_TO = Pattern.compile("^/(?![/\\\\])[^\\s\\\\]{0,499}$");

    /** Validates the start parameters; the platform-specific callback is chosen on the server, never passed in. */
    public static PendingLogin of(AuthPlatform platform, String codeChallenge, String codeChallengeMethod,
            String returnTo) {
        if (platform == null) {
            throw invalid("platform", "platform must be WEB or MOBILE.");
        }
        if (!"S256".equals(codeChallengeMethod)) {
            throw invalid("codeChallengeMethod", "Only the S256 PKCE method is supported.");
        }
        if (!SecureTokens.isS256Challenge(codeChallenge)) {
            throw invalid("codeChallenge", "codeChallenge must be base64url(SHA-256(codeVerifier)).");
        }
        String route = returnTo == null || returnTo.isBlank() ? null : returnTo.strip();
        if (route != null && !RETURN_TO.matcher(route).matches()) {
            throw invalid("returnTo", "returnTo must be a path inside the app, e.g. /today.");
        }
        return new PendingLogin(platform, codeChallenge, route);
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(ErrorCode.INVALID_AUTH_REQUEST, message, field);
    }
}
