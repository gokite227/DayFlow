package com.dayflow.api.user;

/**
 * Sign-in providers. Only Google exists today; Apple is added as another value (plus the migration of the
 * user_identities check) with its own login entry point, while users, tokens and ownership stay the same.
 */
public enum AuthProvider {
    GOOGLE
}
