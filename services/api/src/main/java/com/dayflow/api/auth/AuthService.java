package com.dayflow.api.auth;

import com.dayflow.api.auth.AccessTokenService.IssuedAccessToken;
import com.dayflow.api.auth.AuthDtos.ExchangeCodeRequest;
import com.dayflow.api.auth.RefreshTokenService.IssuedRefreshToken;
import com.dayflow.api.auth.RefreshTokenService.Rotation;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Turns an exchange code or a refresh token into a DayFlow session (access token + refresh token). */
@Service
public class AuthService {

    /** A session to hand to the client, for the platform the login was started on. */
    public record Session(AuthPlatform platform, IssuedAccessToken accessToken, IssuedRefreshToken refreshToken,
            String returnTo) {
    }

    private final ExchangeCodeService exchangeCodes;
    private final AccessTokenService accessTokens;
    private final RefreshTokenService refreshTokens;

    public AuthService(ExchangeCodeService exchangeCodes, AccessTokenService accessTokens,
            RefreshTokenService refreshTokens) {
        this.exchangeCodes = exchangeCodes;
        this.accessTokens = accessTokens;
        this.refreshTokens = refreshTokens;
    }

    /** A successful exchange starts a new refresh token family. */
    public Session exchange(ExchangeCodeRequest request) {
        ExchangeCode code = exchangeCodes.redeem(request.code(), request.codeVerifier(), request.platform());
        return new Session(code.getPlatform(), accessTokens.issue(code.getUserId()),
                refreshTokens.issue(code.getUserId(), code.getPlatform(), UUID.randomUUID()), code.getReturnTo());
    }

    public Session refresh(String refreshToken, AuthPlatform transport) {
        Rotation rotation = refreshTokens.rotate(refreshToken, transport);
        return new Session(rotation.platform(), accessTokens.issue(rotation.userId()), rotation.token(), null);
    }

    /** The access token simply expires (≈15 minutes); the refresh token family is revoked now. */
    public void logout(String refreshToken) {
        refreshTokens.revokeFamilyOf(refreshToken);
    }
}
