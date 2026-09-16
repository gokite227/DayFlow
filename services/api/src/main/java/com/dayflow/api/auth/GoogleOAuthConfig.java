package com.dayflow.api.auth;

import com.dayflow.api.common.DayFlowProperties;
import org.springframework.boot.autoconfigure.condition.ConditionOutcome;
import org.springframework.boot.autoconfigure.condition.SpringBootCondition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

/**
 * The Google OAuth Web client, registered only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 * Google calls back to {@code <DAYFLOW_PUBLIC_BASE_URL>/login/oauth2/code/google}; that exact URI must be
 * registered in Google Cloud (infra/README.md).
 */
@Configuration(proxyBeanMethods = false)
public class GoogleOAuthConfig {

    public static final String REGISTRATION_ID = "google";
    public static final String AUTHORIZATION_PATH = "/oauth2/authorization/" + REGISTRATION_ID;

    @Bean
    @Conditional(GoogleConfigured.class)
    ClientRegistrationRepository clientRegistrationRepository(DayFlowProperties properties) {
        ClientRegistration google = CommonOAuth2Provider.GOOGLE.getBuilder(REGISTRATION_ID)
                .clientId(properties.google().clientId())
                .clientSecret(properties.google().clientSecret())
                .redirectUri(properties.publicBaseUrl() + "/login/oauth2/code/{registrationId}")
                .scope("openid", "email", "profile")
                .build();
        return new InMemoryClientRegistrationRepository(google);
    }

    static class GoogleConfigured extends SpringBootCondition {

        @Override
        public ConditionOutcome getMatchOutcome(ConditionContext context, AnnotatedTypeMetadata metadata) {
            String clientId = context.getEnvironment().getProperty("dayflow.google.client-id", "");
            String clientSecret = context.getEnvironment().getProperty("dayflow.google.client-secret", "");
            return clientId.isBlank() || clientSecret.isBlank()
                    ? ConditionOutcome.noMatch("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set")
                    : ConditionOutcome.match("Google OAuth client configured");
        }
    }
}
