package com.dayflow.api.auth;

import com.dayflow.api.user.AuthProvider;
import com.dayflow.api.user.ExternalIdentity;
import java.util.Map;

/** Maps Google's OpenID Connect claims to an {@link ExternalIdentity}. */
public final class GoogleIdentities {

    private GoogleIdentities() {
    }

    /**
     * Google's {@code sub} is the stable account id and becomes the identity; the email only fills the
     * profile. An account without a verified email is refused.
     */
    public static ExternalIdentity fromClaims(Map<String, Object> claims) {
        Object subject = claims.get("sub");
        Object email = claims.get("email");
        if (!(subject instanceof String sub) || sub.isBlank()
                || !(email instanceof String address) || address.isBlank()
                || !isTrue(claims.get("email_verified"))) {
            throw new IllegalArgumentException("Google did not return a verified account.");
        }
        return new ExternalIdentity(AuthProvider.GOOGLE, sub, address,
                claims.get("name") instanceof String name ? name : null,
                claims.get("picture") instanceof String picture ? picture : null);
    }

    private static boolean isTrue(Object value) {
        return Boolean.TRUE.equals(value) || "true".equals(value);
    }
}
