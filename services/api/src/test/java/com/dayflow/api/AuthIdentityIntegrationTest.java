package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.dayflow.api.user.AuthProvider;
import com.dayflow.api.user.ExternalIdentity;
import com.dayflow.api.user.User;
import com.dayflow.api.user.UserAccountService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** AUTH-002: provider identities resolve to DayFlow users by the stable subject, never by email. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AuthIdentityIntegrationTest {

    @Autowired
    private UserAccountService accounts;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void firstGoogleSubjectCreatesAUserWithTheDefaultCategories() {
        String subject = uniqueSubject();
        User user = accounts.signIn(google(subject, "first@example.com", "First"));

        assertThat(user.getId()).isNotNull();
        assertThat(user.getEmail()).isEqualTo("first@example.com");
        assertThat(user.getDisplayName()).isEqualTo("First");
        assertThat(jdbc.queryForObject("select count(*) from user_identities where provider = 'GOOGLE' and provider_subject = ?",
                Integer.class, subject)).isEqualTo(1);
        assertThat(jdbc.queryForList("select name from event_categories where user_id = ? order by sort_order",
                String.class, user.getId())).containsExactly("일정", "생일", "면접", "시험", "마감", "약속");
        assertThat(jdbc.queryForObject("select count(*) from day_tags where user_id = ?", Integer.class, user.getId())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from goals where user_id = ?", Integer.class, user.getId())).isZero();
    }

    @Test
    void sameSubjectIsAlwaysTheSameUserEvenWhenTheEmailChanges() {
        String subject = uniqueSubject();
        User first = accounts.signIn(google(subject, "old@example.com", "Old name"));
        User again = accounts.signIn(google(subject, "old@example.com", "Old name"));
        User renamed = accounts.signIn(google(subject, "new@example.com", "New name"));

        assertThat(again.getId()).isEqualTo(first.getId());
        assertThat(renamed.getId()).isEqualTo(first.getId());
        assertThat(renamed.getEmail()).isEqualTo("new@example.com");
        assertThat(renamed.getDisplayName()).isEqualTo("New name");
        // Signing in again never adds identities or a second set of default Categories.
        assertThat(jdbc.queryForObject("select count(*) from user_identities where user_id = ?", Integer.class, first.getId()))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from event_categories where user_id = ?", Integer.class, first.getId()))
                .isEqualTo(6);
    }

    @Test
    void differentSubjectIsADifferentUserEvenWithTheSameEmail() {
        User one = accounts.signIn(google(uniqueSubject(), "shared@example.com", "One"));
        User other = accounts.signIn(google(uniqueSubject(), "shared@example.com", "Other"));

        assertThat(other.getId()).isNotEqualTo(one.getId());
        List<UUID> owners = jdbc.queryForList("select id from users where email = 'shared@example.com'", UUID.class);
        assertThat(owners).contains(one.getId(), other.getId());
    }

    private static ExternalIdentity google(String subject, String email, String name) {
        return new ExternalIdentity(AuthProvider.GOOGLE, subject, email, name, null);
    }

    private static String uniqueSubject() {
        return "google-" + UUID.randomUUID();
    }
}
