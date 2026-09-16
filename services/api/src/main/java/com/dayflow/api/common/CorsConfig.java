package com.dayflow.api.common;

import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Browser access to /api/** from explicitly configured origins only ({@code DAYFLOW_ALLOWED_WEB_ORIGINS}).
 * Spring Security applies it (SecurityConfig), so preflight requests are answered before authentication.
 * Only /api/v1/auth/** allows credentials: that is where the Web refresh token cookie is sent. Every other
 * API call carries the access token in the Authorization header instead of a cookie.
 */
@Configuration(proxyBeanMethods = false)
public class CorsConfig {

    @Bean
    CorsConfigurationSource corsConfigurationSource(DayFlowProperties properties) {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        List<String> origins = properties.web().allowedOrigins();
        if (origins.isEmpty()) {
            return source;
        }
        // The first matching pattern wins, so the narrower auth mapping is registered first.
        CorsConfiguration auth = apiCors(origins);
        auth.setAllowCredentials(true);
        source.registerCorsConfiguration("/api/v1/auth/**", auth);
        source.registerCorsConfiguration("/api/**", apiCors(origins));
        return source;
    }

    private static CorsConfiguration apiCors(List<String> origins) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(origins);
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE"));
        cors.setAllowedHeaders(List.of("Content-Type", "Authorization"));
        // Lets the web client read the Location of created resources.
        cors.setExposedHeaders(List.of("Location"));
        return cors;
    }
}
