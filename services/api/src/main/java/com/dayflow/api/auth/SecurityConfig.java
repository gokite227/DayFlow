package com.dayflow.api.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;

/**
 * Two filter chains (AUTH-001, AUTH-003):
 *
 * <ol>
 *   <li><b>Google login</b> — {@code /api/v1/auth/google/start}, {@code /oauth2/authorization/google} and
 *       Google's callback {@code /login/oauth2/code/google}. Spring OAuth2 Login needs a short session while
 *       the browser is at Google; {@link GoogleLoginHandler} ends it right after the callback.</li>
 *   <li><b>API</b> — everything else. Stateless: every /api request needs a DayFlow access token
 *       ({@code Authorization: Bearer}) except the public auth endpoints, the health check and the
 *       development OpenAPI document.</li>
 * </ol>
 */
@Configuration(proxyBeanMethods = false)
public class SecurityConfig {

    /** Public JSON auth endpoints. They never read an access token, even an expired one sent by mistake. */
    static final Set<String> PUBLIC_AUTH_ENDPOINTS = Set.of(
            "/api/v1/auth/exchange", "/api/v1/auth/refresh", "/api/v1/auth/logout");

    @Bean
    @Order(1)
    SecurityFilterChain googleLoginChain(HttpSecurity http, ObjectProvider<ClientRegistrationRepository> registrations,
            GoogleLoginHandler googleLoginHandler) throws Exception {
        http.securityMatcher("/api/v1/auth/google/**", "/oauth2/authorization/**", "/login/oauth2/code/**")
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
                // Only top-level GET redirects, no state-changing form posts.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                // The Google login result is never kept as a server-side login: it only becomes an exchange code.
                .securityContext(context -> context.securityContextRepository(new RequestAttributeSecurityContextRepository()))
                .requestCache(cache -> cache.disable());
        if (registrations.getIfAvailable() != null) {
            http.oauth2Login(login -> login
                    .successHandler(googleLoginHandler)
                    .failureHandler(googleLoginHandler)
                    // Google's tokens stay in the login session, which is dropped after the callback.
                    .authorizedClientRepository(new HttpSessionOAuth2AuthorizedClientRepository()));
        }
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain apiChain(HttpSecurity http, JwtDecoder jwtDecoder,
            ProblemAuthenticationEntryPoint authenticationEntryPoint) throws Exception {
        http.cors(Customizer.withDefaults())
                // Bearer tokens are not sent automatically by browsers; the refresh cookie endpoints check Origin.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.disable())
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .logout(logout -> logout.disable())
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.POST, PUBLIC_AUTH_ENDPOINTS.toArray(String[]::new)).permitAll()
                        .requestMatchers("/api/v1/auth/dev/**").permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        // Development API document; disabled by the prod profile.
                        .requestMatchers("/v3/api-docs", "/v3/api-docs/**", "/swagger-ui.html", "/swagger-ui/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .bearerTokenResolver(bearerTokenResolver())
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .jwt(jwt -> jwt.decoder(jwtDecoder)))
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(authenticationEntryPoint));
        return http.build();
    }

    private static BearerTokenResolver bearerTokenResolver() {
        DefaultBearerTokenResolver standard = new DefaultBearerTokenResolver();
        return (HttpServletRequest request) -> isPublicAuthEndpoint(request) ? null : standard.resolve(request);
    }

    private static boolean isPublicAuthEndpoint(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return PUBLIC_AUTH_ENDPOINTS.contains(path) || path.startsWith("/api/v1/auth/dev/");
    }
}
