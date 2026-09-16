package com.dayflow.api.auth;

import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.DayFlowProperties;
import com.dayflow.api.common.ErrorCode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** AUTH-004: opaque refresh tokens with rotation, family revocation and reuse detection. */
@Service
public class RefreshTokenService {

    public record IssuedRefreshToken(String value, Instant expiresAt, Duration ttl) {
    }

    /** The result of a successful refresh: whose token it was and its replacement. */
    public record Rotation(UUID userId, AuthPlatform platform, IssuedRefreshToken token) {
    }

    private final RefreshTokenRepository tokens;
    private final Clock clock;
    private final Duration ttl;
    private final Duration reuseGrace;

    public RefreshTokenService(RefreshTokenRepository tokens, Clock clock, DayFlowProperties properties) {
        this.tokens = tokens;
        this.clock = clock;
        this.ttl = properties.auth().refreshTokenTtl();
        this.reuseGrace = properties.auth().refreshReuseGrace();
    }

    /** A new token; {@code familyId} is a new id for a fresh login and the old family for a rotation. */
    @Transactional
    public IssuedRefreshToken issue(UUID userId, AuthPlatform platform, UUID familyId) {
        return save(userId, platform, familyId).token();
    }

    /**
     * Exchanges a valid token for a new one of the same family. {@code transport} is how the token arrived
     * (cookie = WEB, body = MOBILE) and must match the platform it was issued for.
     *
     * <p>A token that was already rotated is rejected. Shortly after its rotation that is treated as a
     * harmless race (two tabs refreshing together); later it means the token leaked, so the whole family
     * is revoked and every session of that login has to sign in again. ApiException does not roll back, so
     * that revocation is kept.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public Rotation rotate(String rawToken, AuthPlatform transport) {
        Instant now = clock.instant();
        RefreshToken current = tokens.findByTokenHash(SecureTokens.sha256Hex(rawToken))
                .orElseThrow(RefreshTokenService::invalid);
        if (current.getPlatform() != transport) {
            throw invalid();
        }
        if (current.getRevokedAt() != null) {
            if (current.wasRotated() && current.getRevokedAt().plus(reuseGrace).isBefore(now)) {
                tokens.revokeFamily(current.getFamilyId(), now);
            }
            throw invalid();
        }
        if (!current.getExpiresAt().isAfter(now)) {
            throw invalid();
        }

        Saved next = save(current.getUserId(), current.getPlatform(), current.getFamilyId());
        current.markRotated(next.id(), now);
        tokens.saveAndFlush(current);
        return new Rotation(current.getUserId(), current.getPlatform(), next.token());
    }

    /** Logout: the token's whole family is revoked. Unknown or already revoked tokens are ignored. */
    @Transactional
    public void revokeFamilyOf(String rawToken) {
        tokens.findByTokenHash(SecureTokens.sha256Hex(rawToken))
                .ifPresent(token -> tokens.revokeFamily(token.getFamilyId(), clock.instant()));
    }

    private record Saved(UUID id, IssuedRefreshToken token) {
    }

    private Saved save(UUID userId, AuthPlatform platform, UUID familyId) {
        String raw = SecureTokens.randomToken();
        Instant expiresAt = clock.instant().plus(ttl);
        RefreshToken token = tokens.saveAndFlush(
                new RefreshToken(userId, familyId, SecureTokens.sha256Hex(raw), platform, expiresAt));
        return new Saved(token.getId(), new IssuedRefreshToken(raw, expiresAt, ttl));
    }

    private static ApiException invalid() {
        return new ApiException(ErrorCode.INVALID_REFRESH_TOKEN, "The refresh token is not valid. Sign in again.");
    }
}
