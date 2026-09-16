package com.dayflow.api.auth;

import com.dayflow.api.common.DayFlowProperties;
import com.dayflow.api.user.ExternalIdentity;
import com.dayflow.api.user.User;
import com.dayflow.api.user.UserAccountService;
import java.net.URI;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * The step after a provider verified the user (AUTH-001): find or create the DayFlow user, create a one-time
 * exchange code and send the browser back to the client callback with only that code. Tokens are never put
 * in a URL. Provider handlers (Google today) call this; tests call it directly instead of Google.
 */
@Service
public class LoginCompletionService {

    private final UserAccountService accounts;
    private final ExchangeCodeService exchangeCodes;
    private final DayFlowProperties properties;

    public LoginCompletionService(UserAccountService accounts, ExchangeCodeService exchangeCodes,
            DayFlowProperties properties) {
        this.accounts = accounts;
        this.exchangeCodes = exchangeCodes;
        this.properties = properties;
    }

    public URI complete(ExternalIdentity identity, PendingLogin login) {
        User user = accounts.signIn(identity);
        String code = exchangeCodes.create(user.getId(), login);
        return UriComponentsBuilder.fromUriString(callback(login.platform()))
                .queryParam("code", code)
                .build()
                .encode()
                .toUri();
    }

    /** The client callback with a short error key; WEB when the login in progress is unknown. */
    public URI failure(AuthPlatform platform, String error) {
        return UriComponentsBuilder.fromUriString(callback(platform == null ? AuthPlatform.WEB : platform))
                .queryParam("error", error)
                .build()
                .encode()
                .toUri();
    }

    private String callback(AuthPlatform platform) {
        return platform == AuthPlatform.MOBILE
                ? properties.mobile().redirectUri()
                : properties.web().url() + "/auth/callback";
    }
}
