package com.dayflow.api.auth;

import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * The signed-in DayFlow user of the current request (AUTH-003). Services scope every read and write with
 * {@link #id()}; no API request ever carries an owner id, so a client cannot act for another user.
 */
@Component
public class CurrentUser {

    /** The {@code sub} of the verified access token. Fails loudly when used outside an authenticated request. */
    public UUID id() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken token) {
            return UUID.fromString(token.getToken().getSubject());
        }
        throw new IllegalStateException("No authenticated DayFlow user in this request.");
    }
}
