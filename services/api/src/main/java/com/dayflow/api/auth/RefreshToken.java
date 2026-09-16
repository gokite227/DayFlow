package com.dayflow.api.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;

/**
 * AUTH-004 refresh token record. The raw token is only ever in the client; this row holds its SHA-256 hash.
 * All tokens created from one login share a family: rotation continues the family, logout and reuse
 * detection revoke it.
 */
@Entity
@Table(name = "auth_refresh_tokens")
public class RefreshToken {

    @Id
    private UUID id = UUID.randomUUID();

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "family_id", nullable = false, updatable = false)
    private UUID familyId;

    @Column(name = "token_hash", nullable = false, updatable = false)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "platform", nullable = false, updatable = false)
    private AuthPlatform platform;

    @Column(name = "expires_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant expiresAt;

    @Column(name = "revoked_at", columnDefinition = "timestamptz")
    private Instant revokedAt;

    /** Set when this token was rotated; a revoked token with a successor that is used again means reuse. */
    @Column(name = "replaced_by_token_id")
    private UUID replacedByTokenId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant createdAt;

    @Column(name = "last_used_at", columnDefinition = "timestamptz")
    private Instant lastUsedAt;

    protected RefreshToken() {
    }

    public RefreshToken(UUID userId, UUID familyId, String tokenHash, AuthPlatform platform, Instant expiresAt) {
        this.userId = userId;
        this.familyId = familyId;
        this.tokenHash = tokenHash;
        this.platform = platform;
        this.expiresAt = expiresAt;
    }

    public void markRotated(UUID successorId, Instant now) {
        this.lastUsedAt = now;
        this.revokedAt = now;
        this.replacedByTokenId = successorId;
    }

    public boolean wasRotated() {
        return replacedByTokenId != null;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getFamilyId() {
        return familyId;
    }

    public AuthPlatform getPlatform() {
        return platform;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }
}
