package com.dayflow.api.auth;

import com.dayflow.api.auth.RefreshTokenService.IssuedRefreshToken;
import com.dayflow.api.common.DayFlowProperties;
import com.dayflow.api.common.DayFlowProperties.RefreshCookie;
import java.time.Duration;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * The Web refresh token cookie: HttpOnly (scripts cannot read it), Secure in production, SameSite from the
 * configuration, and sent only to /api/v1/auth so ordinary API calls never carry it.
 */
@Component
public class RefreshCookies {

    public static final String NAME = "dayflow_refresh";
    static final String PATH = "/api/v1/auth";

    private final RefreshCookie settings;

    public RefreshCookies(DayFlowProperties properties) {
        this.settings = properties.auth().refreshCookie();
    }

    public ResponseCookie issue(IssuedRefreshToken token) {
        return base(token.value()).maxAge(token.ttl()).build();
    }

    public ResponseCookie clear() {
        return base("").maxAge(Duration.ZERO).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(NAME, value)
                .httpOnly(true)
                .secure(settings.secure())
                .sameSite(settings.sameSite())
                .path(PATH);
    }
}
