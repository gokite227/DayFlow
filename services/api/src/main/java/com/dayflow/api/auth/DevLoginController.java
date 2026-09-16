package com.dayflow.api.auth;

import com.dayflow.api.user.AuthProvider;
import com.dayflow.api.user.ExternalIdentity;
import io.swagger.v3.oas.annotations.Hidden;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * DEVELOPMENT ONLY (DAYFLOW_DEV_LOGIN_ENABLED=true, refused by the prod profile). Stands in for Google so the
 * real callback → exchange → refresh → logout flow can be tested locally without Google credentials. It
 * signs in a fake Google identity whose subject starts with "dev-", which a real Google subject never does.
 */
@Hidden
@RestController
@RequestMapping("/api/v1/auth/dev")
@ConditionalOnProperty(name = "dayflow.auth.dev-login-enabled", havingValue = "true")
public class DevLoginController {

    private static final Logger log = LoggerFactory.getLogger(DevLoginController.class);

    private final LoginCompletionService completion;

    public DevLoginController(LoginCompletionService completion) {
        this.completion = completion;
        log.warn("DayFlow dev login is ENABLED (/api/v1/auth/dev/login). Never enable it on a server.");
    }

    @GetMapping("/login")
    public ResponseEntity<Void> login(
            @RequestParam AuthPlatform platform,
            @RequestParam String codeChallenge,
            @RequestParam String codeChallengeMethod,
            @RequestParam(required = false) String returnTo,
            @RequestParam String subject,
            @RequestParam String email,
            @RequestParam(required = false) String name) {
        PendingLogin login = PendingLogin.of(platform, codeChallenge, codeChallengeMethod, returnTo);
        if (!subject.matches("^[a-z0-9-]{1,40}$") || !email.matches("^[^@\\s]{1,64}@[^@\\s]{1,200}$")) {
            return ResponseEntity.badRequest().build();
        }
        ExternalIdentity identity = new ExternalIdentity(AuthProvider.GOOGLE, "dev-" + subject, email, name, null);
        return ResponseEntity.status(HttpStatus.FOUND).location(completion.complete(identity, login)).build();
    }
}
