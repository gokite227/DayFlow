package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * REC-001..005 against PostgreSQL: missed-Day candidates and re-surfacing, MOVE limits, Carry Over with
 * Goal continuation, Recovery Day with core Days, and history. Each test uses its own YEAR Goal of 2032 so
 * target Goal lookups do not see other tests' Goals.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class RecoveryCarryOverApiIntegrationTest {


    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AuthTestSupport auth;

    /** Every request of this class runs as one freshly signed-in user. */
    private AuthTestSupport.UserMvc mvc;

    @BeforeEach
    void signIn() {
        mvc = auth.as(mockMvc, auth.newUser("carry-over"));
    }

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void rec001OffersPastAndTimePassedDaysAndHidesHandledStates() throws Exception {
        String week = createPath("2032-09-13", "2032-09-19").week();
        String past = createDay(null, "rec001 past without goal", "2032-09-14", 60);
        String pastLinked = createDay(week, "rec001 past with goal", "2032-09-14", 60);
        String pastDone = createDay(null, "rec001 past done", "2032-09-14", 60);
        patchDay(pastDone, "{\"status\": \"DONE\", \"version\": 0}");
        String expired = createDay(null, "rec001 today 14-15", "2032-09-15", 60);
        schedule(expired, "2032-09-15T14:00:00+09:00", "2032-09-15T15:00:00+09:00");
        String later = createDay(null, "rec001 today 20-21", "2032-09-15", 60);
        schedule(later, "2032-09-15T20:00:00+09:00", "2032-09-15T21:00:00+09:00");
        String dateOnly = createDay(null, "rec001 today date only", "2032-09-15", 60);

        mvc.perform(candidates())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.day.id == '" + past + "')].reason").value("PAST_DATE"))
                .andExpect(jsonPath("$[?(@.day.id == '" + pastLinked + "')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.day.id == '" + expired + "')].reason").value("TIME_PASSED"))
                .andExpect(jsonPath("$[?(@.day.id == '" + pastDone + "')]").isEmpty())
                .andExpect(jsonPath("$[?(@.day.id == '" + later + "')]").isEmpty())
                .andExpect(jsonPath("$[?(@.day.id == '" + dateOnly + "')]").isEmpty());

        // KEEP records the decision; the same planning state is not offered again.
        send(post("/api/v1/recovery/apply"), """
                {"localDate": "2032-09-15", "decisions": [{"dayId": "%s", "version": 0, "action": "KEEP"}]}
                """.formatted(past)).andExpect(status().isOk());
        mvc.perform(candidates()).andExpect(jsonPath("$[?(@.day.id == '" + past + "')]").isEmpty());

        // A rename is not a planning change…
        patchDay(past, "{\"title\": \"rec001 renamed\", \"version\": 0}");
        mvc.perform(candidates()).andExpect(jsonPath("$[?(@.day.id == '" + past + "')]").isEmpty());
        // …but a new estimate is, so the Day comes back with its last decision.
        patchDay(past, "{\"estimatedMinutes\": 30, \"version\": 1}");
        mvc.perform(candidates())
                .andExpect(jsonPath("$[?(@.day.id == '" + past + "')].lastAction").value("KEEP"));
    }

    @Test
    void rec001ADayLeftOutOfTheApplyIsNotChangedNotRecordedAndOfferedAgain() throws Exception {
        String skipped = createDay(null, "skip this time", "2032-09-14", 60);
        String dropped = createDay(null, "drop in the same batch", "2032-09-14", 60);
        String reduced = createDay(null, "reduce in the same batch", "2032-09-14", 60);
        String before = mvc.perform(get("/api/v1/days/" + skipped)).andReturn().getResponse().getContentAsString();

        // "이번엔 건너뛰기" is the Web leaving the Day out of the payload; the others are applied as usual.
        send(post("/api/v1/recovery/apply"), """
                {"localDate": "2032-09-15", "decisions": [
                  {"dayId": "%s", "version": 0, "action": "DROP"},
                  {"dayId": "%s", "version": 0, "action": "REDUCE", "estimatedMinutes": 30}]}
                """.formatted(dropped, reduced))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days", hasSize(2)))
                .andExpect(jsonPath("$.days[0].status").value("SKIPPED"))
                .andExpect(jsonPath("$.days[1].estimatedMinutes").value(30));

        assertThat(count("select count(*) from recovery_event_items where day_id = '%s'::uuid".formatted(skipped))).isZero();
        assertThat(mvc.perform(get("/api/v1/days/" + skipped)).andReturn().getResponse().getContentAsString()).isEqualTo(before);
        mvc.perform(candidates())
                .andExpect(jsonPath("$[?(@.day.id == '" + skipped + "')].reason").value("PAST_DATE"))
                .andExpect(jsonPath("$[?(@.day.id == '" + skipped + "' && @.lastAction == null)]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.day.id == '" + dropped + "')]").isEmpty())
                .andExpect(jsonPath("$[?(@.day.id == '" + reduced + "')]").isEmpty());
    }

    @Test
    void rec001MoveStaysInTheWeekForGoalDaysAndGoesForwardForOthers() throws Exception {
        String week = createPath("2032-09-13", "2032-09-19").week();
        String linked = createDay(week, "move linked", "2032-09-14", 60);
        String linkedOut = createDay(week, "move linked out", "2032-09-14", 60);
        String free = createDay(null, "move free", "2032-09-14", 60);
        String freePast = createDay(null, "move free past", "2032-09-14", 60);

        send(post("/api/v1/recovery/apply"), decision(linked, "MOVE", "2032-09-17"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days[0].plannedDate").value("2032-09-17"));
        send(post("/api/v1/recovery/apply"), decision(linkedOut, "MOVE", "2032-09-21"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DATE_OUTSIDE_WEEK_GOAL_PERIOD"));
        send(post("/api/v1/recovery/apply"), decision(free, "MOVE", "2032-11-20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days[0].plannedDate").value("2032-11-20"));
        send(post("/api/v1/recovery/apply"), decision(freePast, "MOVE", "2032-09-14"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECOVERY_DECISION"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("decisions[0].plannedDate"));
        send(post("/api/v1/recovery/apply"), decision(freePast, "CARRY_OVER", "2032-10-14"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECOVERY_DECISION"));
    }

    @Test
    void rec003CarriesADayOnlyUnderTheWeekGoalOfTheTargetDateWithoutTouchingTheSource() throws Exception {
        Path path = createPath("2032-09-13", "2032-09-19");
        String q4 = createGoal(path.year(), "QUARTER", "2032-10-01", "2032-12-31");
        String november = createGoal(q4, "MONTH", "2032-11-01", "2032-11-30");
        String targetWeek = createGoal(november, "WEEK", "2032-11-08", "2032-11-14");
        String tag = JsonPath.read(send(post("/api/v1/day-tags"), """
                {"name": "carry-tag-day-only", "color": "#ee749d", "sortOrder": null}
                """).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        String source = idOf(send(post("/api/v1/days"), """
                {"goalId": "%s", "title": "Portfolio fix", "status": "IN_PROGRESS", "priority": "HIGH",
                 "estimatedMinutes": 90, "plannedDate": "2032-09-14", "planningMode": "FIXED", "coreDay": true,
                 "tagIds": ["%s"]}
                """.formatted(path.week(), tag)).andExpect(status().isCreated()));
        schedule(source, "2032-09-14T10:00:00+09:00", "2032-09-14T11:30:00+09:00");
        int sourceVersion = version(source);
        int daysBefore = count("select count(*) from days");

        send(post("/api/v1/recovery/carry-over/preview"), preview(source, "2032-11-10", "DAY_ONLY", List.of()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.targetWeekGoalId").value(targetWeek))
                .andExpect(jsonPath("$.ready").value(true))
                .andExpect(jsonPath("$.days", hasSize(1)));
        assertThat(count("select count(*) from days")).isEqualTo(daysBefore);

        String body = apply(source, "2032-11-10", "DAY_ONLY", "", Map.of(source, sourceVersion), Map.of());
        String applied = send(post("/api/v1/recovery/carry-over/apply"), body)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.createdGoals").isEmpty())
                .andExpect(jsonPath("$.days[0].source.plannedDate").value("2032-09-14"))
                .andExpect(jsonPath("$.days[0].source.status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.days[0].source.goalId").value(path.week()))
                .andExpect(jsonPath("$.days[0].source.version").value(sourceVersion))
                .andExpect(jsonPath("$.days[0].source.schedule").isNotEmpty())
                .andExpect(jsonPath("$.days[0].destination.goalId").value(targetWeek))
                .andExpect(jsonPath("$.days[0].destination.plannedDate").value("2032-11-10"))
                .andExpect(jsonPath("$.days[0].destination.status").value("NOT_STARTED"))
                .andExpect(jsonPath("$.days[0].destination.schedule").value(nullValue()))
                .andExpect(jsonPath("$.days[0].destination.coreDay").value(false))
                .andExpect(jsonPath("$.days[0].destination.priority").value("HIGH"))
                .andExpect(jsonPath("$.days[0].destination.estimatedMinutes").value(90))
                .andExpect(jsonPath("$.days[0].destination.planningMode").value("FIXED"))
                .andExpect(jsonPath("$.days[0].destination.tags[0].id").value(tag))
                .andExpect(jsonPath("$.days[0].destination.carriedFromDayId").value(source))
                .andReturn().getResponse().getContentAsString();
        String destination = JsonPath.read(applied, "$.days[0].destination.id");
        String eventId = JsonPath.read(applied, "$.eventId");

        mvc.perform(get("/api/v1/recovery/events"))
                .andExpect(jsonPath("$[?(@.id == '" + eventId + "')].items[0].action").value("CARRY_OVER"))
                .andExpect(jsonPath("$[?(@.id == '" + eventId + "')].items[0].dayTitle").value("Portfolio fix"))
                .andExpect(jsonPath("$[?(@.id == '" + eventId + "')].items[0].destinationDayId").value(destination))
                .andExpect(jsonPath("$[?(@.id == '" + eventId + "')].items[0].destinationPlannedDate").value("2032-11-10"))
                .andExpect(jsonPath("$[?(@.id == '" + eventId + "')].items[0].previousPlannedDate").value("2032-09-14"));
        // Handled: not offered again, and a second Carry Over is refused.
        mvc.perform(candidates()).andExpect(jsonPath("$[?(@.day.id == '" + source + "')]").isEmpty());
        send(post("/api/v1/recovery/carry-over/apply"), body)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_CARRIED_OVER"));

        // Deleting the source keeps the new Day.
        mvc.perform(delete("/api/v1/days/" + source)).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/days/" + destination))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.carriedFromDayId").value(nullValue()));
    }

    @Test
    void rec004ContinuesTheMonthAndWeekWhenTheMonthChangesInsideTheQuarter() throws Exception {
        Path path = createPath("2032-08-23", "2032-08-29");
        String source = createDay(path.week(), "August task", "2032-08-24", 45);
        int goalsBefore = count("select count(*) from goals");

        send(post("/api/v1/recovery/carry-over/preview"), preview(source, "2032-09-08", "WITH_PLAN", List.of()).replace("2032-09-15", "2032-08-25"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ready").value(true))
                .andExpect(jsonPath("$.levels[0].action").value("KEEP_SOURCE"))
                .andExpect(jsonPath("$.levels[1].action").value("KEEP_SOURCE"))
                .andExpect(jsonPath("$.levels[2].action").value("CREATE"))
                .andExpect(jsonPath("$.levels[2].startDate").value("2032-09-01"))
                .andExpect(jsonPath("$.levels[2].endDate").value("2032-09-30"))
                .andExpect(jsonPath("$.levels[2].newTitle").value("MONTH plan"))
                .andExpect(jsonPath("$.levels[3].action").value("CREATE"))
                .andExpect(jsonPath("$.levels[3].startDate").value("2032-09-06"))
                .andExpect(jsonPath("$.levels[3].endDate").value("2032-09-12"));
        assertThat(count("select count(*) from goals")).isEqualTo(goalsBefore);

        String applied = send(post("/api/v1/recovery/carry-over/apply"),
                applyAt("2032-08-25", source, "2032-09-08", "", Map.of(source, 0), path.versions()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.createdGoals", hasSize(2)))
                .andExpect(jsonPath("$.createdGoals[0].type").value("MONTH"))
                .andExpect(jsonPath("$.createdGoals[0].parentGoalId").value(path.quarter()))
                .andExpect(jsonPath("$.createdGoals[0].continuedFromGoalId").value(path.month()))
                .andExpect(jsonPath("$.createdGoals[1].type").value("WEEK"))
                .andExpect(jsonPath("$.createdGoals[1].continuedFromGoalId").value(path.week()))
                .andReturn().getResponse().getContentAsString();
        String newWeek = JsonPath.read(applied, "$.createdGoals[1].id");
        assertThat((String) JsonPath.read(applied, "$.days[0].destination.goalId")).isEqualTo(newWeek);
        assertThat(count("select count(*) from goals")).isEqualTo(goalsBefore + 2);
    }

    @Test
    void rec004ContinuesIntoTheNextQuarterReusingItAndCarriesOnlySelectedDays() throws Exception {
        Path path = createPath("2032-09-27", "2032-09-30");
        String q4 = createGoal(path.year(), "QUARTER", "2032-10-01", "2032-12-31");
        String source = createDay(path.week(), "Interview prep", "2032-09-27", 60);
        String second = createDay(path.week(), "Java 3 problems", "2032-09-28", 30);
        String third = createDay(path.week(), "Resume", "2032-09-28", 30);
        String done = createDay(path.week(), "Done one", "2032-09-27", 30);
        patchDay(done, "{\"status\": \"DONE\", \"version\": 0}");
        String skipped = createDay(path.week(), "Skipped one", "2032-09-27", 30);
        patchDay(skipped, "{\"status\": \"SKIPPED\", \"version\": 0}");

        send(post("/api/v1/recovery/carry-over/preview"), preview(source, "2032-10-06", "WITH_PLAN", List.of(second)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.levels[0].action").value("KEEP_SOURCE"))
                .andExpect(jsonPath("$.levels[1].action").value("REUSE"))
                .andExpect(jsonPath("$.levels[1].goal.id").value(q4))
                .andExpect(jsonPath("$.levels[2].action").value("CREATE"))
                .andExpect(jsonPath("$.levels[3].startDate").value("2032-10-04"))
                .andExpect(jsonPath("$.days[?(@.day.id == '" + second + "')].selected").value(true))
                .andExpect(jsonPath("$.days[?(@.day.id == '" + third + "')].selected").value(false))
                .andExpect(jsonPath("$.days[?(@.day.id == '" + done + "')].exclusion").value("FINISHED"))
                .andExpect(jsonPath("$.days[?(@.day.id == '" + skipped + "')].selectable").value(false));

        send(post("/api/v1/recovery/carry-over/preview"), preview(source, "2032-10-06", "WITH_PLAN", List.of(done)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECOVERY_DECISION"));

        String applied = send(post("/api/v1/recovery/carry-over/apply"),
                apply(source, "2032-10-06", "WITH_PLAN", "", Map.of(source, 0, second, 0), path.versions()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.createdGoals", hasSize(2)))
                .andExpect(jsonPath("$.createdGoals[0].parentGoalId").value(q4))
                .andExpect(jsonPath("$.createdGoals[0].startDate").value("2032-10-01"))
                .andExpect(jsonPath("$.days", hasSize(2)))
                .andReturn().getResponse().getContentAsString();
        String newWeek = JsonPath.read(applied, "$.createdGoals[1].id");
        assertThat(count("select count(*) from days where carried_from_day_id in ('%s'::uuid, '%s'::uuid) and goal_id = '%s'::uuid"
                .formatted(source, second, newWeek))).isEqualTo(2);
        assertThat(count("select count(*) from days where carried_from_day_id = '%s'::uuid".formatted(third))).isZero();
    }

    @Test
    void rec004CreatesTheQuarterTooWhenNoGoalOfTheNextQuarterExists() throws Exception {
        Path path = createPath("2032-06-28", "2032-06-30");
        String source = createDay(path.week(), "June task", "2032-06-29", 30);

        send(post("/api/v1/recovery/carry-over/apply"),
                applyAt("2032-06-30", source, "2032-07-07", "", Map.of(source, 0), path.versions()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.createdGoals", hasSize(3)))
                .andExpect(jsonPath("$.createdGoals[0].type").value("QUARTER"))
                .andExpect(jsonPath("$.createdGoals[0].startDate").value("2032-07-01"))
                .andExpect(jsonPath("$.createdGoals[0].endDate").value("2032-09-30"))
                .andExpect(jsonPath("$.createdGoals[0].parentGoalId").value(path.year()))
                .andExpect(jsonPath("$.createdGoals[0].continuedFromGoalId").value(path.quarter()))
                .andExpect(jsonPath("$.createdGoals[1].type").value("MONTH"))
                .andExpect(jsonPath("$.createdGoals[2].type").value("WEEK"))
                .andExpect(jsonPath("$.createdGoals[2].startDate").value("2032-07-05"))
                .andExpect(jsonPath("$.createdGoals[2].endDate").value("2032-07-11"));
    }

    @Test
    void rec004ReusesTheContinuingWeekAndAsksWhenSeveralGoalsFit() throws Exception {
        Path path = createPath("2032-05-03", "2032-05-09");
        String first = createDay(path.week(), "First", "2032-05-04", 30);
        String second = createDay(path.week(), "Second", "2032-05-04", 30);

        // Same month, next week: only the WEEK is new.
        String applied = send(post("/api/v1/recovery/carry-over/apply"),
                applyAt("2032-05-05", first, "2032-05-12", "", Map.of(first, 0), path.versions()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.createdGoals", hasSize(1)))
                .andExpect(jsonPath("$.createdGoals[0].startDate").value("2032-05-10"))
                .andExpect(jsonPath("$.createdGoals[0].parentGoalId").value(path.month()))
                .andReturn().getResponse().getContentAsString();
        String continuingWeek = JsonPath.read(applied, "$.createdGoals[0].id");

        // A second Day of the same week reuses the Goal that already continues it.
        send(post("/api/v1/recovery/carry-over/apply"),
                applyAt("2032-05-05", second, "2032-05-13", "", Map.of(second, 0), path.versions()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.createdGoals").isEmpty())
                .andExpect(jsonPath("$.days[0].destination.goalId").value(continuingWeek));

        // Two fitting Goals without a continuation link: the user has to choose; titles never decide.
        String third = createDay(path.week(), "Third", "2032-05-04", 30);
        createGoal(path.month(), "WEEK", "2032-05-17", "2032-05-23");
        String otherWeek = createGoal(path.month(), "WEEK", "2032-05-17", "2032-05-23");
        send(post("/api/v1/recovery/carry-over/preview"), """
                {"localDate": "2032-05-05", "sourceDayId": "%s", "targetDate": "2032-05-18", "mode": "WITH_PLAN",
                 "targetWeekGoalId": null, "levels": [], "dayIds": []}
                """.formatted(third))
                .andExpect(jsonPath("$.ready").value(false))
                .andExpect(jsonPath("$.levels[3].action").value("CHOOSE"))
                .andExpect(jsonPath("$.levels[3].candidates", hasSize(2)));
        send(post("/api/v1/recovery/carry-over/apply"),
                applyAt("2032-05-05", third, "2032-05-18", "", Map.of(third, 0), path.versions()))
                .andExpect(status().isBadRequest());
        send(post("/api/v1/recovery/carry-over/apply"), applyAt("2032-05-05", third, "2032-05-18",
                "{\"type\": \"WEEK\", \"goalId\": \"" + otherWeek + "\", \"create\": false}", Map.of(third, 0),
                path.versions()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.createdGoals").isEmpty())
                .andExpect(jsonPath("$.days[0].destination.goalId").value(otherWeek));
    }

    @Test
    void rec003RefusesInvalidTargetsAndAppliesNothingWhenThePreviewIsStale() throws Exception {
        Path path = createPath("2032-09-13", "2032-09-19");
        String source = createDay(path.week(), "Stale source", "2032-09-14", 30);
        String free = createDay(null, "Free source", "2032-09-14", 30);

        send(post("/api/v1/recovery/carry-over/preview"), preview(free, "2032-10-14", "WITHOUT_GOAL", List.of()))
                .andExpect(status().isBadRequest());
        send(post("/api/v1/recovery/carry-over/preview"), preview(source, "2032-09-18", "WITHOUT_GOAL", List.of()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].field").value("targetDate"));
        send(post("/api/v1/recovery/carry-over/preview"), preview(source, "2032-09-10", "WITHOUT_GOAL", List.of()))
                .andExpect(status().isBadRequest());

        // The source changes after the preview: 409 and no Goal or Day is created.
        patchDay(source, "{\"title\": \"Stale source renamed\", \"version\": 0}");
        send(post("/api/v1/recovery/carry-over/apply"),
                apply(source, "2032-10-14", "WITH_PLAN", "", Map.of(source, 0), path.versions()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
        // A Goal of the source path changed after the preview: also 409.
        send(patch("/api/v1/goals/" + path.month()), "{\"title\": \"changed\", \"version\": 0}").andExpect(status().isOk());
        send(post("/api/v1/recovery/carry-over/apply"),
                apply(source, "2032-10-14", "WITH_PLAN", "", Map.of(source, 1), path.versions()))
                .andExpect(status().isConflict());
        assertThat(count("select count(*) from goals where continued_from_goal_id in ('%s'::uuid, '%s'::uuid, '%s'::uuid)"
                .formatted(path.week(), path.month(), path.quarter()))).isZero();
        assertThat(count("select count(*) from days where carried_from_day_id = '%s'::uuid".formatted(source))).isZero();

        // Without a Goal the new Day has none.
        send(post("/api/v1/recovery/carry-over/apply"),
                apply(source, "2032-10-14", "WITHOUT_GOAL", "", Map.of(source, 1), Map.of()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days[0].destination.goalId").value(nullValue()))
                .andExpect(jsonPath("$.days[0].destination.title").value("Stale source renamed"));
    }
    @Test
    void rec002SetsAFutureRecoveryDayAndReleasesCoreDaysInTheSameTransaction() throws Exception {
        String keep = createDay(null, "Core kept", "2032-12-06", 30);
        patchDay(keep, "{\"coreDay\": true, \"version\": 0}");
        String release = createDay(null, "Core released", "2032-12-06", 30);
        patchDay(release, "{\"coreDay\": true, \"version\": 0}");
        String url = "/api/v1/recovery-days/2032-12-06";

        send(put(url), """
                {"returnDate": "2032-12-07", "note": "after the trip", "expectedVersion": null,
                 "releaseCoreDays": [{"id": "%s", "version": 0}]}
                """.formatted(release))
                .andExpect(status().isConflict());
        mvc.perform(get("/api/v1/recovery-days?from=2032-12-06&to=2032-12-06")).andExpect(jsonPath("$").isEmpty());

        send(put(url), """
                {"returnDate": "2032-12-07", "note": "after the trip", "expectedVersion": null,
                 "releaseCoreDays": [{"id": "%s", "version": 1}]}
                """.formatted(release))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.note").value("after the trip"));
        mvc.perform(get("/api/v1/days/" + release)).andExpect(jsonPath("$.coreDay").value(false));
        mvc.perform(get("/api/v1/days/" + keep)).andExpect(jsonPath("$.coreDay").value(true));

        send(put(url), """
                {"returnDate": "2032-12-08", "note": "two days", "expectedVersion": 0}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.returnDate").value("2032-12-08"))
                .andExpect(jsonPath("$.version").value(1));
        mvc.perform(delete(url)).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/recovery-days?from=2032-12-06&to=2032-12-06")).andExpect(jsonPath("$").isEmpty());
    }

    private record Path(String year, String quarter, String month, String week) {

        Map<String, Integer> versions() {
            return Map.of(year, 0, quarter, 0, month, 0, week, 0);
        }
    }

    /** A fresh YEAR → QUARTER → MONTH → WEEK chain of 2032 for the given week. */
    private Path createPath(String weekStart, String weekEnd) throws Exception {
        int month = Integer.parseInt(weekStart.substring(5, 7));
        int firstMonth = (month - 1) / 3 * 3 + 1;
        String quarterStart = "2032-%02d-01".formatted(firstMonth);
        String quarterEnd = java.time.YearMonth.of(2032, firstMonth + 2).atEndOfMonth().toString();
        String year = createGoal(null, "YEAR", "2032-01-01", "2032-12-31");
        String quarter = createGoal(year, "QUARTER", quarterStart, quarterEnd);
        String monthGoal = createGoal(quarter, "MONTH", "2032-%02d-01".formatted(month),
                java.time.YearMonth.of(2032, month).atEndOfMonth().toString());
        return new Path(year, quarter, monthGoal, createGoal(monthGoal, "WEEK", weekStart, weekEnd));
    }

    private String createGoal(String parentId, String type, String startDate, String endDate) throws Exception {
        String json = """
                {"parentGoalId": %s, "type": "%s", "title": "%s plan", "why": "keep going",
                 "startDate": "%s", "endDate": "%s", "priority": 1, "progressPolicy": "AUTO"}
                """.formatted(parentId == null ? "null" : "\"" + parentId + "\"", type, type, startDate, endDate);
        return idOf(send(post("/api/v1/goals"), json).andExpect(status().isCreated()));
    }

    private String createDay(String goalId, String title, String plannedDate, int minutes) throws Exception {
        return idOf(send(post("/api/v1/days"), """
                {"goalId": %s, "title": "%s", "status": "NOT_STARTED", "priority": "LOW",
                 "estimatedMinutes": %d, "plannedDate": "%s", "planningMode": "ANYTIME", "coreDay": false}
                """.formatted(goalId == null ? "null" : "\"" + goalId + "\"", title, minutes, plannedDate))
                .andExpect(status().isCreated()));
    }

    private void patchDay(String dayId, String json) throws Exception {
        send(patch("/api/v1/days/" + dayId), json).andExpect(status().isOk());
    }

    private void schedule(String dayId, String startAt, String endAt) throws Exception {
        send(put("/api/v1/days/" + dayId + "/schedule"), """
                {"startAt": "%s", "endAt": "%s", "timezone": "Asia/Seoul", "expectedVersion": null}
                """.formatted(startAt, endAt)).andExpect(status().isOk());
    }

    private static String decision(String dayId, String action, String plannedDate) {
        return """
                {"localDate": "2032-09-15", "decisions": [
                  {"dayId": "%s", "version": 0, "action": "%s", "plannedDate": "%s"}]}
                """.formatted(dayId, action, plannedDate);
    }

    /** POST /recovery/carry-over/preview body. */
    private static String preview(String sourceDayId, String targetDate, String mode, List<String> extraDayIds) {
        String dayIds = extraDayIds.stream().map(id -> "\"" + id + "\"").reduce((a, b) -> a + ", " + b).orElse("");
        return """
                {"localDate": "2032-09-15", "sourceDayId": "%s", "targetDate": "%s", "mode": "%s",
                 "targetWeekGoalId": null, "levels": [], "dayIds": [%s]}
                """.formatted(sourceDayId, targetDate, mode, dayIds);
    }

    /** POST /recovery/carry-over/apply body with the versions "seen in the preview". */
    private static String apply(String sourceDayId, String targetDate, String mode, String levels,
            Map<String, Integer> dayVersions, Map<String, Integer> goalVersions) {
        return """
                {"localDate": "2032-09-15", "sourceDayId": "%s", "targetDate": "%s", "mode": "%s",
                 "targetWeekGoalId": null, "levels": [%s], "days": [%s], "goals": [%s]}
                """.formatted(sourceDayId, targetDate, mode, levels, refs(dayVersions), refs(goalVersions));
    }

    private static MockHttpServletRequestBuilder candidates() {
        return get("/api/v1/recovery/candidates").param("today", "2032-09-15").param("now", "2032-09-15T18:00:00+09:00");
    }

    private static String applyAt(String localDate, String sourceDayId, String targetDate, String levels,
            Map<String, Integer> dayVersions, Map<String, Integer> goalVersions) {
        return apply(sourceDayId, targetDate, "WITH_PLAN", levels, dayVersions, goalVersions)
                .replace("\"localDate\": \"2032-09-15\"", "\"localDate\": \"" + localDate + "\"");
    }

    private static String refs(Map<String, Integer> versions) {
        return versions.entrySet().stream()
                .map(entry -> "{\"id\": \"%s\", \"version\": %d}".formatted(entry.getKey(), entry.getValue()))
                .reduce((a, b) -> a + ", " + b).orElse("");
    }

    private int version(String dayId) throws Exception {
        return JsonPath.read(mvc.perform(get("/api/v1/days/" + dayId)).andReturn().getResponse().getContentAsString(),
                "$.version");
    }
    private int count(String sql) {
        return jdbc.queryForObject(sql, Integer.class);
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String json) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private static String idOf(ResultActions result) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id");
    }
}
