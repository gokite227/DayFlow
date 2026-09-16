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
 * AUTH-001 one-time login code. The callback URL carries only the raw code; the row keeps its hash together
 * with everything the exchange must match: the user, the PKCE challenge, the platform and the return route.
 */
@Entity
@Table(name = "auth_exchange_codes")
public class ExchangeCode {

    @Id
    private UUID id = UUID.randomUUID();

    @Column(name = "code_hash", nullable = false, updatable = false)
    private String codeHash;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "code_challenge", nullable = false, updatable = false)
    private String codeChallenge;

    @Enumerated(EnumType.STRING)
    @Column(name = "platform", nullable = false, updatable = false)
    private AuthPlatform platform;

    @Column(name = "return_to", updatable = false)
    private String returnTo;

    @Column(name = "expires_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant expiresAt;

    @Column(name = "used_at", columnDefinition = "timestamptz")
    private Instant usedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant createdAt;

    protected ExchangeCode() {
    }

    public ExchangeCode(String codeHash, UUID userId, PendingLogin login, Instant expiresAt) {
        this.codeHash = codeHash;
        this.userId = userId;
        this.codeChallenge = login.codeChallenge();
        this.platform = login.platform();
        this.returnTo = login.returnTo();
        this.expiresAt = expiresAt;
    }

    public void markUsed(Instant now) {
        this.usedAt = now;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getCodeChallenge() {
        return codeChallenge;
    }

    public AuthPlatform getPlatform() {
        return platform;
    }

    public String getReturnTo() {
        return returnTo;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getUsedAt() {
        return usedAt;
    }
}
