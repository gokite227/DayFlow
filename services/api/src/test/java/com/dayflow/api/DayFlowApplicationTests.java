package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class DayFlowApplicationTests {

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void contextLoads() {
        // Hibernate ddl-auto=validate also fails here if entities and migrations disagree.
    }

    @Test
    void flywayMigrationCreatesTables() {
        Integer applied = jdbc.queryForObject(
                "select count(*) from flyway_schema_history where version = '1' and success", Integer.class);
        assertThat(applied).isEqualTo(1);

        assertThat(jdbc.queryForList(
                "select table_name from information_schema.tables where table_schema = 'public'", String.class))
                .contains("goals", "days", "day_schedules");
    }

    /** The empty test database is migrated V1 → V9 in order; V8 does not need earlier rows. */
    @Test
    void freshDatabaseAppliesEveryMigrationThroughUserOwnership() {
        assertThat(jdbc.queryForList(
                "select version from flyway_schema_history where success order by installed_rank", String.class))
                .containsExactly("1", "2", "3", "4", "5", "6", "7", "8", "9");
        assertThat(jdbc.queryForList(
                "select table_name from information_schema.tables where table_schema = 'public'", String.class))
                .contains("users", "user_identities", "auth_exchange_codes", "auth_refresh_tokens");
        for (String table : new String[] {"goals", "days", "day_tags", "event_categories", "events", "reviews",
                "recovery_days", "recovery_events"}) {
            assertThat(jdbc.queryForObject("""
                    select is_nullable from information_schema.columns
                    where table_schema = 'public' and table_name = ? and column_name = 'user_id'
                    """, String.class, table)).as(table + ".user_id").isEqualTo("NO");
        }
    }
}
