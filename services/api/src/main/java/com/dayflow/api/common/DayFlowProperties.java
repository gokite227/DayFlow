package com.dayflow.api.common;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code dayflow.*} settings (application.yml). Values that every profile needs are checked here so a
 * misconfigured server stops at startup instead of failing on the first login.
 */
@ConfigurationProperties("dayflow")
public record DayFlowProperties(String publicBaseUrl, Web web, Mobile mobile, Google google, Auth auth) {

    /** HMAC-SHA256 needs a key of at least 256 bits. */
    public static final int MIN_JWT_SECRET_BYTES = 32;

    public DayFlowProperties {
        publicBaseUrl = stripTrailingSlash(require(publicBaseUrl, "dayflow.public-base-url (DAYFLOW_PUBLIC_BASE_URL)"));
        web = web == null ? new Web(null, null) : web;
        mobile = mobile == null ? new Mobile(null) : mobile;
        google = google == null ? new Google(null, null) : google;
        if (auth == null || auth.jwtSecret() == null
                || auth.jwtSecret().getBytes(StandardCharsets.UTF_8).length < MIN_JWT_SECRET_BYTES) {
            throw new IllegalStateException("dayflow.auth.jwt-secret (DAYFLOW_JWT_SECRET) must be at least "
                    + MIN_JWT_SECRET_BYTES + " bytes.");
        }
    }

    public record Web(String url, List<String> allowedOrigins) {

        public Web {
            url = url == null || url.isBlank() ? null : stripTrailingSlash(url.strip());
            // Browsers send Origin without a trailing slash, so "https://dayflow.vercel.app/" is normalized.
            allowedOrigins = allowedOrigins == null ? List.of()
                    : allowedOrigins.stream().map(String::strip).filter(origin -> !origin.isEmpty())
                            .map(DayFlowProperties::stripTrailingSlash).toList();
        }
    }

    public record Mobile(String redirectUri) {

        public Mobile {
            redirectUri = redirectUri == null || redirectUri.isBlank() ? "dayflow://auth/callback" : redirectUri.strip();
        }
    }

    public record Google(String clientId, String clientSecret) {

        /** Google login is only offered when both values are set (tests and local runs may leave them empty). */
        public boolean configured() {
            return clientId != null && !clientId.isBlank() && clientSecret != null && !clientSecret.isBlank();
        }
    }

    public record Auth(
            String jwtSecret,
            Duration accessTokenTtl,
            Duration refreshTokenTtl,
            Duration exchangeCodeTtl,
            Duration refreshReuseGrace,
            RefreshCookie refreshCookie,
            boolean devLoginEnabled) {

        public Auth {
            accessTokenTtl = accessTokenTtl == null ? Duration.ofMinutes(15) : accessTokenTtl;
            refreshTokenTtl = refreshTokenTtl == null ? Duration.ofDays(30) : refreshTokenTtl;
            exchangeCodeTtl = exchangeCodeTtl == null ? Duration.ofMinutes(3) : exchangeCodeTtl;
            refreshReuseGrace = refreshReuseGrace == null ? Duration.ofSeconds(20) : refreshReuseGrace;
            refreshCookie = refreshCookie == null ? new RefreshCookie(true, "Lax") : refreshCookie;
        }
    }

    /** The Web refresh token cookie. SameSite=None is only needed when Web and API are different sites. */
    public record RefreshCookie(boolean secure, String sameSite) {

        public RefreshCookie {
            sameSite = sameSite == null || sameSite.isBlank() ? "Lax" : sameSite.strip();
        }
    }

    private static String require(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + " must be set.");
        }
        return value.strip();
    }

    private static String stripTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
