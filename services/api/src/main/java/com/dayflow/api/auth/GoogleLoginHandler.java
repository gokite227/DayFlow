package com.dayflow.api.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.net.URI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

/**
 * End of Spring's Google OAuth2 Login. Google already verified the user; this turns the result into a
 * DayFlow exchange code for the client that started the login and then drops the login session, so no
 * server session outlives the redirect.
 */
@Component
public class GoogleLoginHandler implements AuthenticationSuccessHandler, AuthenticationFailureHandler {

    private static final Logger log = LoggerFactory.getLogger(GoogleLoginHandler.class);

    private final LoginCompletionService completion;

    public GoogleLoginHandler(LoginCompletionService completion) {
        this.completion = completion;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException {
        PendingLogin login = takePendingLogin(request);
        if (login == null) {
            // The login was not started through /api/v1/auth/google/start (or the session expired).
            response.sendRedirect(completion.failure(null, "login_expired").toString());
            return;
        }
        URI target;
        try {
            OAuth2User user = (OAuth2User) authentication.getPrincipal();
            target = completion.complete(GoogleIdentities.fromClaims(user.getAttributes()), login);
        } catch (IllegalArgumentException e) {
            log.warn("Google login refused: {}", e.getMessage());
            target = completion.failure(login.platform(), "account_not_verified");
        }
        response.sendRedirect(target.toString());
    }

    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException exception) throws IOException {
        log.info("Google login failed: {}", exception.getMessage());
        PendingLogin login = takePendingLogin(request);
        response.sendRedirect(completion.failure(login == null ? null : login.platform(), "google_login_failed")
                .toString());
    }

    private static PendingLogin takePendingLogin(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return null;
        }
        Object login = session.getAttribute(PendingLogin.SESSION_ATTRIBUTE);
        session.invalidate();
        return login instanceof PendingLogin pending ? pending : null;
    }
}
