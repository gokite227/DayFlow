package com.dayflow.api.auth;

import com.dayflow.api.common.DayFlowProperties;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Stops a server (prod profile) from starting with development or unsafe auth settings. The problems are
 * listed together so a deploy can be fixed in one pass.
 */
@Component
@Profile("prod")
public class ProductionConfigValidator implements InitializingBean {

    /** The default of application-local.yml. */
    static final String LOCAL_JWT_SECRET = "local-development-only-jwt-secret-change-me";

    private final DayFlowProperties properties;

    public ProductionConfigValidator(DayFlowProperties properties) {
        this.properties = properties;
    }

    @Override
    public void afterPropertiesSet() {
        List<String> problems = problems(properties);
        if (!problems.isEmpty()) {
            throw new IllegalStateException("Unsafe production configuration:\n - " + String.join("\n - ", problems));
        }
    }

    public static List<String> problems(DayFlowProperties properties) {
        List<String> problems = new ArrayList<>();
        if (!properties.publicBaseUrl().startsWith("https://")) {
            problems.add("DAYFLOW_PUBLIC_BASE_URL must be an https:// URL.");
        }
        String webUrl = properties.web().url();
        if (webUrl == null || !webUrl.startsWith("https://")) {
            problems.add("DAYFLOW_WEB_URL must be an https:// URL.");
        }
        List<String> origins = properties.web().allowedOrigins();
        if (origins.isEmpty() || origins.stream().anyMatch(origin -> !origin.startsWith("https://"))) {
            problems.add("DAYFLOW_ALLOWED_WEB_ORIGINS must list the https:// Web origins.");
        } else if (webUrl != null && webUrl.startsWith("https://") && !origins.contains(webUrl)) {
            // The Web calls the API from DAYFLOW_WEB_URL; without it in CORS every Bearer call fails after login.
            problems.add("DAYFLOW_ALLOWED_WEB_ORIGINS must contain DAYFLOW_WEB_URL.");
        }
        if (!properties.google().configured()) {
            problems.add("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.");
        }
        if (LOCAL_JWT_SECRET.equals(properties.auth().jwtSecret())) {
            problems.add("DAYFLOW_JWT_SECRET must be a server secret, not the local development value.");
        }
        if (!properties.auth().refreshCookie().secure()) {
            problems.add("DAYFLOW_REFRESH_COOKIE_SECURE must be true.");
        }
        if ("None".equalsIgnoreCase(properties.auth().refreshCookie().sameSite()) && !properties.auth().refreshCookie().secure()) {
            problems.add("SameSite=None requires a Secure cookie.");
        }
        if (properties.auth().devLoginEnabled()) {
            problems.add("DAYFLOW_DEV_LOGIN_ENABLED must be false.");
        }
        return problems;
    }
}
