package com.dayflow.api.auth;

/**
 * Where a login happens. It is fixed when the login starts and stored with the exchange code and the refresh
 * token, so a client cannot switch it later: WEB keeps the refresh token in an HttpOnly cookie and never
 * receives it in a body, MOBILE receives it in the body and keeps it in the device's secure storage.
 */
public enum AuthPlatform {
    WEB,
    MOBILE
}
