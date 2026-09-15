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
}
