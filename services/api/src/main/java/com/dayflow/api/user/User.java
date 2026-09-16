package com.dayflow.api.user;

import com.dayflow.api.common.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * A DayFlow user (AUTH-002). Profile fields are copied from the sign-in provider and refreshed on every
 * login; how the user signs in is stored separately in {@link UserIdentity}.
 */
@Entity
@Table(name = "users")
public class User extends VersionedEntity {

    static final int MAX_EMAIL_LENGTH = 320;
    static final int MAX_DISPLAY_NAME_LENGTH = 200;
    static final int MAX_AVATAR_URL_LENGTH = 2000;

    @Column(name = "email", nullable = false)
    private String email;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "avatar_url")
    private String avatarUrl;

    protected User() {
    }

    public User(String email, String displayName, String avatarUrl) {
        updateProfile(email, displayName, avatarUrl);
    }

    /** Keeps the stored profile in line with the provider; values that do not fit are cut or dropped. */
    public void updateProfile(String email, String displayName, String avatarUrl) {
        this.email = truncate(email, MAX_EMAIL_LENGTH);
        this.displayName = truncate(displayName, MAX_DISPLAY_NAME_LENGTH);
        this.avatarUrl = avatarUrl == null || avatarUrl.length() > MAX_AVATAR_URL_LENGTH ? null : avatarUrl;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    private static String truncate(String value, int maxLength) {
        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }
}
