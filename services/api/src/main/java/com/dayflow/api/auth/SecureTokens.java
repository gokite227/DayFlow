package com.dayflow.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Pattern;

/** Random tokens, SHA-256 hashes and PKCE (RFC 7636, S256 only). */
public final class SecureTokens {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder BASE64_URL = Base64.getUrlEncoder().withoutPadding();
    /** RFC 7636 §4.1: 43..128 unreserved characters. */
    private static final Pattern CODE_VERIFIER = Pattern.compile("^[A-Za-z0-9\\-._~]{43,128}$");
    /** base64url(SHA-256) without padding is always 43 characters. */
    private static final Pattern S256_CHALLENGE = Pattern.compile("^[A-Za-z0-9_-]{43}$");

    private SecureTokens() {
    }

    /** 32 random bytes, base64url: exchange codes and refresh tokens. */
    public static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return BASE64_URL.encodeToString(bytes);
    }

    /** Only this hash is stored, never the raw code or token. */
    public static String sha256Hex(String value) {
        return HexFormat.of().formatHex(sha256(value.getBytes(StandardCharsets.UTF_8)));
    }

    public static String s256Challenge(String codeVerifier) {
        return BASE64_URL.encodeToString(sha256(codeVerifier.getBytes(StandardCharsets.US_ASCII)));
    }

    public static boolean isCodeVerifier(String value) {
        return value != null && CODE_VERIFIER.matcher(value).matches();
    }

    public static boolean isS256Challenge(String value) {
        return value != null && S256_CHALLENGE.matcher(value).matches();
    }

    /** Comparison time does not depend on where the values differ. */
    public static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] sha256(byte[] input) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(input);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by every Java runtime.", e);
        }
    }
}
