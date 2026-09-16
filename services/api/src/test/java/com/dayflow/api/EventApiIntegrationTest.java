package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Event API (EVT-001..004, NOTI-001, CAL-003) on PostgreSQL. Each test uses its own years. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class EventApiIntegrationTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void evt001CreatesTimedAndAllDayEventsWithSeparateTimeFields() throws Exception {
        String timed = send(post("/api/v1/events"), """
                {"title": "Interview", "allDay": false,
                 "startAt": "2041-09-16T14:00:00+09:00", "endAt": "2041-09-16T15:00:00+09:00",
                 "timezone": "Asia/Seoul", "location": "Gangnam", "notes": null, "recurrence": "NONE",
                 "reminders": [60, 0, 1440], "linkedGoalId": null}
                """)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.startAt").value("2041-09-16T14:00:00+09:00"))
                .andExpect(jsonPath("$.startDate").value(nullValue()))
                .andExpect(jsonPath("$.endDateExclusive").value(nullValue()))
                .andExpect(jsonPath("$.notes").value(nullValue()))
                .andExpect(jsonPath("$.reminders").value(org.hamcrest.Matchers.contains(0, 60, 1440)))
                .andExpect(jsonPath("$.version").value(0))
                .andReturn().getResponse().getContentAsString();
        assertThat((String) JsonPath.read(timed, "$.location")).isEqualTo("Gangnam");

        String allDay = send(post("/api/v1/events"), """
                {"title": "Exam week", "allDay": true,
                 "startDate": "2041-09-20", "endDateExclusive": "2041-09-23",
                 "timezone": "Asia/Seoul", "recurrence": "NONE", "reminders": []}
                """)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.startAt").value(nullValue()))
                .andExpect(jsonPath("$.endAt").value(nullValue()))
                .andExpect(jsonPath("$.startDate").value("2041-09-20"))
                .andExpect(jsonPath("$.location").value(nullValue()))
                .andExpect(jsonPath("$.linkedGoalId").value(nullValue()))
                .andReturn().getResponse().getContentAsString();

        // Stored as dates, not as UTC midnight instants.
        Map<String, Object> row = jdbc.queryForMap(
                "select start_at, start_date::text as start_date from events where id = ?::uuid",
                (String) JsonPath.read(allDay, "$.id"));
        assertThat(row.get("start_at")).isNull();
        assertThat(row.get("start_date")).isEqualTo("2041-09-20");
    }

    @Test
    void evt001RejectsMixedOrMissingTimeFields() throws Exception {
        send(post("/api/v1/events"), """
                {"title": "Mixed", "allDay": true, "startAt": "2041-01-01T10:00:00+09:00",
                 "startDate": "2041-01-01", "timezone": "Asia/Seoul", "recurrence": "NONE", "reminders": []}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_EVENT_TIME"))
                .andExpect(jsonPath("$.fieldErrors[*].field", containsInAnyOrder("startAt", "endDateExclusive")));

        send(post("/api/v1/events"), """
                {"title": "Backwards", "allDay": false, "startAt": "2041-01-01T10:00:00+09:00",
                 "endAt": "2041-01-01T09:00:00+09:00", "timezone": "Asia/Seoul", "recurrence": "NONE", "reminders": []}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].field").value("endAt"));

        send(post("/api/v1/events"), """
                {"title": "Bad zone", "allDay": true, "startDate": "2041-01-01",
                 "endDateExclusive": "2041-01-02", "timezone": "+09:00", "recurrence": "NONE", "reminders": []}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].field").value("timezone"));
    }

    @Test
    void evt001DatabaseRejectsMixedTimeShape() {
        assertThatThrownBy(() -> jdbc.update("""
                insert into events (id, title, all_day, start_at, end_at, start_date, end_date_exclusive,
                    timezone, recurrence, created_at, updated_at, version)
                values (gen_random_uuid(), 'Broken', true, now(), now(), current_date, current_date + 1,
                    'Asia/Seoul', 'NONE', now(), now(), 0)
                """)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void noti001StoresAtMostFiveDistinctRemindersAndReplacesThem() throws Exception {
        send(post("/api/v1/events"), timedJson("Too many", "2042-01-01", "[0, 10, 30, 60, 120, 1440]"))
                .andExpect(status().isBadRequest());
        send(post("/api/v1/events"), timedJson("Duplicate", "2042-01-01", "[10, 10]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_EVENT_REMINDERS"));

        String id = createEvent(timedJson("Reminders", "2042-01-01", "[0, 10, 30]"));
        send(patch("/api/v1/events/" + id), """
                {"reminders": [10, 60], "version": 0}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reminders").value(org.hamcrest.Matchers.contains(10, 60)))
                .andExpect(jsonPath("$.version").value(1));
        assertThat(jdbc.queryForList("select offset_minutes from event_reminders where event_id = ?::uuid "
                + "order by offset_minutes", Integer.class, id)).containsExactly(10, 60);
    }

    @Test
    void evt001PatchSwitchesKindAndChecksVersionOnUpdateAndDelete() throws Exception {
        String id = createEvent(timedJson("Switch", "2043-03-10", "[]"));

        send(patch("/api/v1/events/" + id), """
                {"allDay": true, "version": 0}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_EVENT_TIME"));

        send(patch("/api/v1/events/" + id), """
                {"allDay": true, "startDate": "2043-03-10", "endDateExclusive": "2043-03-11",
                 "location": "Home", "version": 0}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.startAt").value(nullValue()))
                .andExpect(jsonPath("$.startDate").value("2043-03-10"))
                .andExpect(jsonPath("$.location").value("Home"))
                .andExpect(jsonPath("$.version").value(1));

        send(patch("/api/v1/events/" + id), """
                {"title": "Stale", "version": 0}
                """)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        send(patch("/api/v1/events/" + id), """
                {"location": null, "version": 1}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.location").value(nullValue()));

        mvc.perform(delete("/api/v1/events/" + id).param("version", "0")).andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/events/" + id).param("version", "2")).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/events/" + id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
    }

    @Test
    void evt004GoalDeletionKeepsTheEventAndClearsTheLink() throws Exception {
        String goalId = JsonPath.read(send(post("/api/v1/goals"), """
                {"parentGoalId": null, "type": "YEAR", "title": "Linked goal", "why": "",
                 "startDate": "2044-01-01", "endDate": "2044-12-31", "priority": 1, "progressPolicy": "AUTO"}
                """).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");

        send(post("/api/v1/events"), timedJson("Unknown goal", "2044-05-01", "[]")
                .replace("\"linkedGoalId\": null", "\"linkedGoalId\": \"00000000-0000-4000-8000-000000000000\""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_EVENT_GOAL"));

        String id = createEvent(timedJson("Deadline", "2044-05-01", "[]")
                .replace("\"linkedGoalId\": null", "\"linkedGoalId\": \"" + goalId + "\""));
        mvc.perform(get("/api/v1/events").param("linkedGoalId", goalId))
                .andExpect(jsonPath("$.length()").value(1));

        mvc.perform(delete("/api/v1/goals/" + goalId)).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/events/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linkedGoalId").value(nullValue()));
    }

    @Test
    void cal003ListsOccurrencesInRangeWithRecurrenceAndCategoryFilter() throws Exception {
        String birthday = JsonPath.read(send(post("/api/v1/event-categories"), """
                {"name": "cal003 birthdays", "color": "#d9822b", "sortOrder": null}
                """).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        createEvent("""
                {"title": "Mom birthday", "categoryId": "%s", "allDay": true, "startDate": "2045-03-05",
                 "endDateExclusive": "2045-03-06", "timezone": "Asia/Seoul", "recurrence": "YEARLY", "reminders": [1440]}
                """.formatted(birthday));
        createEvent("""
                {"title": "Rent", "allDay": false, "startAt": "2045-01-31T23:59:00+09:00",
                 "endAt": "2045-01-31T23:59:00+09:00", "timezone": "Asia/Seoul", "recurrence": "MONTHLY", "reminders": []}
                """);

        mvc.perform(get("/api/v1/event-occurrences").param("from", "2047-02-01").param("to", "2047-03-31"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.title == 'Rent')].startAt",
                        containsInAnyOrder("2047-02-28T23:59:00+09:00", "2047-03-31T23:59:00+09:00")))
                .andExpect(jsonPath("$[?(@.title == 'Mom birthday')].startDate").value(
                        org.hamcrest.Matchers.contains("2047-03-05")));

        // Recurring occurrences keep their Category.
        String birthdays = mvc.perform(get("/api/v1/event-occurrences").param("from", "2047-02-01")
                        .param("to", "2047-03-31").param("categoryId", birthday))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].category.name").value("cal003 birthdays"))
                .andExpect(jsonPath("$[0].category.color").value("#d9822b"))
                .andReturn().getResponse().getContentAsString();
        List<String> categoryIds = JsonPath.read(birthdays, "$[*].category.id");
        assertThat(categoryIds).isNotEmpty().allMatch(birthday::equals);

        // hasCategory=false keeps only uncategorized Events (the monthly Rent here).
        mvc.perform(get("/api/v1/event-occurrences").param("from", "2047-02-01").param("to", "2047-03-31")
                        .param("hasCategory", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.title == 'Rent')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.title == 'Mom birthday')]").isEmpty())
                .andExpect(jsonPath("$[?(@.title == 'Rent')].category").value(org.hamcrest.Matchers.everyItem(nullValue())));

        // 366 days inclusive is the limit.
        mvc.perform(get("/api/v1/event-occurrences").param("from", "2047-01-01").param("to", "2048-01-01"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/event-occurrences").param("from", "2047-01-01").param("to", "2048-01-02"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_OCCURRENCE_RANGE"));
    }

    private String createEvent(String json) throws Exception {
        return JsonPath.read(send(post("/api/v1/events"), json).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");
    }

    private static String timedJson(String title, String date, String reminders) {
        return """
                {"title": "%s", "allDay": false, "startAt": "%sT10:00:00+09:00",
                 "endAt": "%sT11:00:00+09:00", "timezone": "Asia/Seoul", "location": null, "notes": null,
                 "recurrence": "NONE", "reminders": %s, "linkedGoalId": null}
                """.formatted(title, date, date, reminders);
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String json) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(json));
    }
}
