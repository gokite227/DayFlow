package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyIterable;
import static org.mockito.Mockito.doThrow;

import com.dayflow.api.event.EventCategoryRepository;
import com.dayflow.api.user.AuthProvider;
import com.dayflow.api.user.ExternalIdentity;
import com.dayflow.api.user.UserAccountService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/** AUTH-002: creating the user and its default Categories is one transaction. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UserCreationRollbackIntegrationTest {

    @Autowired
    private UserAccountService accounts;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoSpyBean
    private EventCategoryRepository categories;

    @Test
    void failingDefaultCategoriesLeaveNoUserOrIdentityBehind() {
        doThrow(new IllegalStateException("simulated failure")).when(categories).saveAllAndFlush(anyIterable());
        String subject = "rollback-" + UUID.randomUUID();

        assertThatThrownBy(() -> accounts.signIn(
                new ExternalIdentity(AuthProvider.GOOGLE, subject, "rollback@example.com", "Rollback", null)))
                .hasMessageContaining("simulated failure");

        assertThat(jdbc.queryForObject("select count(*) from user_identities where provider_subject = ?", Integer.class,
                subject)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from users where email = 'rollback@example.com'", Integer.class))
                .isZero();
    }
}
