package com.dayflow.api.auth;

import com.dayflow.api.common.DayFlowProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/** AUTH-004: short-lived access tokens. Minimal claims: iss, sub (DayFlow user id), aud, iat, exp. */
@Service
public class AccessTokenService {

    public record IssuedAccessToken(String value, Instant expiresAt, long expiresInSeconds) {
    }

    private final JwtEncoder encoder;
    private final Clock clock;
    private final String issuer;
    private final Duration ttl;

    public AccessTokenService(JwtEncoder encoder, Clock clock, DayFlowProperties properties) {
        this.encoder = encoder;
        this.clock = clock;
        this.issuer = properties.publicBaseUrl();
        this.ttl = properties.auth().accessTokenTtl();
    }

    public IssuedAccessToken issue(UUID userId) {
        return issue(userId, clock.instant());
    }

    /** With an explicit issue time, so tests can create already expired tokens. */
    public IssuedAccessToken issue(UUID userId, Instant issuedAt) {
        Instant expiresAt = issuedAt.plus(ttl);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .subject(userId.toString())
                .audience(List.of(JwtConfig.AUDIENCE))
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).type("JWT").build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new IssuedAccessToken(token, expiresAt, ttl.toSeconds());
    }
}
