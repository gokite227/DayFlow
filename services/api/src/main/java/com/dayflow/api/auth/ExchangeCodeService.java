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

/** AUTH-001: creates and redeems the one-time code of the OAuth exchange (PKCE S256). */
@Service
public class ExchangeCodeService {

    private final ExchangeCodeRepository codes;
    private final Clock clock;
    private final Duration ttl;

    public ExchangeCodeService(ExchangeCodeRepository codes, Clock clock, DayFlowProperties properties) {
        this.codes = codes;
        this.clock = clock;
        this.ttl = properties.auth().exchangeCodeTtl();
    }

    /** Returns the raw code for the callback URL; only its hash is stored. */
    @Transactional
    public String create(UUID userId, PendingLogin login) {
        String raw = SecureTokens.randomToken();
        codes.saveAndFlush(new ExchangeCode(SecureTokens.sha256Hex(raw), userId, login, clock.instant().plus(ttl)));
        return raw;
    }

    /**
     * Redeems a code once. Any attempt burns it, so a failed attempt cannot be retried. Every failure reports
     * the same INVALID_AUTH_CODE (unknown, used, expired, other platform, wrong verifier), and the burn is
     * committed because ApiException does not roll back.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public ExchangeCode redeem(String rawCode, String codeVerifier, AuthPlatform platform) {
        Instant now = clock.instant();
        ExchangeCode code = codes.findByCodeHash(SecureTokens.sha256Hex(rawCode)).orElseThrow(ExchangeCodeService::invalid);
        if (code.getUsedAt() != null) {
            throw invalid();
        }
        code.markUsed(now);
        codes.saveAndFlush(code);
        if (!code.getExpiresAt().isAfter(now)
                || code.getPlatform() != platform
                || !SecureTokens.constantTimeEquals(SecureTokens.s256Challenge(codeVerifier), code.getCodeChallenge())) {
            throw invalid();
        }
        return code;
    }

    private static ApiException invalid() {
        return new ApiException(ErrorCode.INVALID_AUTH_CODE, "The login code is invalid or expired. Sign in again.");
    }
}
