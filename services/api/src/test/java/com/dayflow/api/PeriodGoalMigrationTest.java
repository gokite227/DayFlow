package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** Verifies both supported production-safe migration paths using a throwaway PostgreSQL. */
class PeriodGoalMigrationTest {

    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(DockerImageName.parse("postgres:18"));

    @BeforeAll
    static void startPostgres() {
        POSTGRES.start();
    }

    @AfterAll
    static void stopPostgres() {
        POSTGRES.stop();
    }

    @Test
    void migratesFreshDatabaseThroughV9() throws Exception {
        String schema = "fresh_v9";
        Flyway flyway = flyway(schema, null);

        flyway.migrate();
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("9");
        try (Connection connection = connection(schema); Statement statement = connection.createStatement()) {
            try (ResultSet result = statement.executeQuery("""
                    select is_nullable from information_schema.columns
                    where table_schema = 'fresh_v9' and table_name = 'goals' and column_name = 'type'
                    """)) {
                assertThat(result.next()).isTrue();
                assertThat(result.getString(1)).isEqualTo("YES");
            }
        }
    }

    @Test
    void upgradesV8DataWithoutChangingCalendarGoalIdentityHierarchyOrRelations() throws Exception {
        String schema = "upgrade_v8_v9";
        flyway(schema, MigrationVersion.fromVersion("8")).migrate();

        String user = "00000000-0000-4000-8000-000000000001";
        String year = "00000000-0000-4000-8000-000000000002";
        String quarter = "00000000-0000-4000-8000-000000000003";
        String day = "00000000-0000-4000-8000-000000000004";
        try (Connection connection = connection(schema); Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                    insert into users (id,email,display_name,avatar_url,created_at,updated_at,version)
                    values ('%s','migration@example.test','Migration',null,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z',3)
                    """.formatted(user));
            statement.executeUpdate(calendarGoal(year, null, "YEAR", "2026-01-01", "2026-12-31", user, 4));
            statement.executeUpdate(calendarGoal(quarter, year, "QUARTER", "2026-07-01", "2026-09-30", user, 5));
            statement.executeUpdate("""
                    insert into days (id,goal_id,title,status,priority,estimated_minutes,planned_date,planning_mode,
                                      core_day,created_at,updated_at,version,user_id)
                    values ('%s','%s','Keep relation','NOT_STARTED',1,30,'2026-09-15','ANYTIME',false,
                            '2026-01-01T00:00:00Z','2026-01-02T00:00:00Z',6,'%s')
                    """.formatted(day, quarter, user));
        }

        Flyway latest = flyway(schema, null);
        latest.migrate();
        assertThat(latest.info().current().getVersion().getVersion()).isEqualTo("9");

        try (Connection connection = connection(schema); Statement statement = connection.createStatement()) {
            try (ResultSet result = statement.executeQuery("""
                    select kind,type,parent_goal_id,version,created_at,updated_at
                    from goals where id = '%s'
                    """.formatted(quarter))) {
                assertThat(result.next()).isTrue();
                assertThat(result.getString("kind")).isEqualTo("CALENDAR");
                assertThat(result.getString("type")).isEqualTo("QUARTER");
                assertThat(result.getString("parent_goal_id")).isEqualTo(year);
                assertThat(result.getLong("version")).isEqualTo(5);
                assertThat(result.getTimestamp("created_at").toInstant().toString()).isEqualTo("2026-01-01T00:00:00Z");
                assertThat(result.getTimestamp("updated_at").toInstant().toString()).isEqualTo("2026-01-02T00:00:00Z");
            }
            try (ResultSet result = statement.executeQuery("select goal_id,version from days where id = '" + day + "'")) {
                assertThat(result.next()).isTrue();
                assertThat(result.getString("goal_id")).isEqualTo(quarter);
                assertThat(result.getLong("version")).isEqualTo(6);
            }
        }
    }

    private static Flyway flyway(String schema, MigrationVersion target) {
        var configuration = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas(schema)
                .createSchemas(true)
                .locations("classpath:db/migration");
        if (target != null) {
            configuration.target(target);
        }
        return configuration.load();
    }

    private static Connection connection(String schema) throws Exception {
        Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        connection.createStatement().execute("set search_path to " + schema);
        return connection;
    }

    private static String calendarGoal(String id, String parentId, String type, String start, String end,
            String userId, long version) {
        String parent = parentId == null ? "null" : "'" + parentId + "'";
        return """
                insert into goals (id,parent_goal_id,type,title,why,start_date,end_date,priority,progress_policy,
                                   created_at,updated_at,version,user_id)
                values ('%s',%s,'%s','Existing %s','',date '%s',date '%s',1,'AUTO',
                        '2026-01-01T00:00:00Z','2026-01-02T00:00:00Z',%d,'%s')
                """.formatted(id, parent, type, type, start, end, version, userId);
    }
}
