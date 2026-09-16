package com.dayflow.api;

import com.dayflow.api.auth.AccessTokenService;
import com.dayflow.api.user.AuthProvider;
import com.dayflow.api.user.ExternalIdentity;
import com.dayflow.api.user.User;
import com.dayflow.api.user.UserAccountService;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Creates DayFlow users the same way a Google login does (without Google) and calls the API as them.
 * Integration tests run every request in an explicit user context: {@code auth.as(mockMvc, auth.newUser("x"))}.
 */
@Component
public class AuthTestSupport {

    private final UserAccountService accounts;
    private final AccessTokenService accessTokens;

    public AuthTestSupport(UserAccountService accounts, AccessTokenService accessTokens) {
        this.accounts = accounts;
        this.accessTokens = accessTokens;
    }

    public record TestUser(UUID id, String email, String accessToken) {
    }

    /** A new user with its own Google subject (so also its own default Event Categories). */
    public TestUser newUser(String label) {
        String subject = "test-" + label + "-" + UUID.randomUUID();
        String email = label + "@example.test";
        User user = accounts.signIn(new ExternalIdentity(AuthProvider.GOOGLE, subject, email, label, null));
        return new TestUser(user.getId(), email, accessTokens.issue(user.getId()).value());
    }

    public UserMvc as(MockMvc mvc, TestUser user) {
        return new UserMvc(mvc, user);
    }

    /** MockMvc that sends the user's access token with every request. */
    public static final class UserMvc {

        private final MockMvc mvc;
        private final TestUser user;

        UserMvc(MockMvc mvc, TestUser user) {
            this.mvc = mvc;
            this.user = user;
        }

        public ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
            return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, "Bearer " + user.accessToken()));
        }

        public TestUser user() {
            return user;
        }
    }
}
