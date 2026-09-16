package com.dayflow.api.user;

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
 * One way a user signs in: a provider and the provider's stable subject (Google "sub"). (provider, subject)
 * is unique, so the same subject always resolves to the same user. The email is only recorded as it was
 * when linking; users are never matched or merged by email.
 */
@Entity
@Table(name = "user_identities")
public class UserIdentity {

    @Id
    private UUID id = UUID.randomUUID();

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, updatable = false)
    private AuthProvider provider;

    @Column(name = "provider_subject", nullable = false, updatable = false)
    private String providerSubject;

    @Column(name = "email_at_link_time", updatable = false)
    private String emailAtLinkTime;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant createdAt;

    protected UserIdentity() {
    }

    public UserIdentity(UUID userId, AuthProvider provider, String providerSubject, String emailAtLinkTime) {
        this.userId = userId;
        this.provider = provider;
        this.providerSubject = providerSubject;
        this.emailAtLinkTime = emailAtLinkTime == null || emailAtLinkTime.length() > User.MAX_EMAIL_LENGTH
                ? null
                : emailAtLinkTime;
    }

    public UUID getUserId() {
        return userId;
    }

    public AuthProvider getProvider() {
        return provider;
    }

    public String getProviderSubject() {
        return providerSubject;
    }
}
