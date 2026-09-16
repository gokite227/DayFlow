package com.dayflow.api.user;

/**
 * A verified sign-in from a provider, already reduced to what DayFlow keeps. This is the boundary between
 * the provider login (Spring OAuth2 Login for Google) and DayFlow users, so tests can sign in without the
 * provider's network.
 */
public record ExternalIdentity(
        AuthProvider provider,
        String subject,
        String email,
        String displayName,
        String avatarUrl) {

    public ExternalIdentity {
        if (provider == null || subject == null || subject.isBlank() || email == null || email.isBlank()) {
            throw new IllegalArgumentException("A provider identity needs a provider, a subject and an email.");
        }
        displayName = displayName == null || displayName.isBlank() ? email : displayName.strip();
        avatarUrl = avatarUrl == null || avatarUrl.isBlank() ? null : avatarUrl;
    }
}
