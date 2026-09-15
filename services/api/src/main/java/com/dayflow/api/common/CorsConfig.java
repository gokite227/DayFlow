package com.dayflow.api.common;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Browser access to /api/** from explicitly configured origins only
 * ({@code dayflow.cors.allowed-origins}). No origin is allowed unless configured, and
 * credentials stay disabled because the API has no authentication yet.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CorsConfig.CorsProperties.class)
public class CorsConfig implements WebMvcConfigurer {

    @ConfigurationProperties("dayflow.cors")
    public record CorsProperties(List<String> allowedOrigins) {

        public CorsProperties {
            allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins);
        }
    }

    private final CorsProperties properties;

    public CorsConfig(CorsProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (properties.allowedOrigins().isEmpty()) {
            return;
        }
        registry.addMapping("/api/**")
                .allowedOrigins(properties.allowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE")
                .allowedHeaders("Content-Type")
                // Lets the web client read the Location of created resources.
                .exposedHeaders("Location");
    }
}
