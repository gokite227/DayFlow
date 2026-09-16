package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
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
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Event Categories (EVT-006) and their Events on PostgreSQL. Each test uses its own names and years. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class EventCategoryApiIntegrationTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void evt006MigrationSeedsTheFormerEventTypesAsEditableCategories() throws Exception {
        String body = mvc.perform(get("/api/v1/event-categories"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<Map<String, Object>> categories = JsonPath.read(body, "$");
        List<String> defaults = List.of("일정", "생일", "면접", "시험", "마감", "약속");
        List<String> colors = List.of("#66707a", "#d9822b", "#3a78b8", "#7453c2", "#cf3f5c", "#2a927f");
        for (int i = 0; i < defaults.size(); i++) {
            String name = defaults.get(i);
            List<Map<String, Object>> matches = categories.stream().filter(c -> name.equals(c.get("name"))).toList();
            assertThat(matches).as(name).hasSize(1);
            assertThat(matches.get(0)).containsEntry("color", colors.get(i)).containsEntry("sortOrder", i);
        }
        List<Integer> sortOrders = JsonPath.read(body, "$[*].sortOrder");
        assertThat(sortOrders).isSorted();
    }

    @Test
    void evt006CreatesCategoriesWithTrimmedUniqueNamesAndPaletteColors() throws Exception {
        String created = createCategory("  cat-Work  ", "#3A78B8")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("cat-Work"))
                .andExpect(jsonPath("$.color").value("#3a78b8"))
                .andExpect(jsonPath("$.version").value(0))
                .andReturn().getResponse().getContentAsString();
        List<Integer> sortOrders = JsonPath.read(mvc.perform(get("/api/v1/event-categories"))
                .andReturn().getResponse().getContentAsString(), "$[*].sortOrder");
        assertThat((Integer) JsonPath.read(created, "$.sortOrder")).isEqualTo(sortOrders.stream()
                .mapToInt(Integer::intValue).max().orElseThrow());

        createCategory("CAT-WORK", "#66707a")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DUPLICATE_EVENT_CATEGORY_NAME"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("name"));
        createCategory("   ", "#66707a")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        createCategory("c".repeat(31), "#66707a")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        createCategory("cat-Color", "#123456")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_EVENT_CATEGORY_COLOR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("color"));
    }

    @Test
    void evt006RenamesRecolorsReordersAndChecksTheVersion() throws Exception {
        String id = categoryId("cat-Study", "#7453c2");
        createCategory("cat-Health", "#2a927f").andExpect(status().isCreated());

        send(patch("/api/v1/event-categories/" + id), """
                {"name": " cat-Exams ", "color": "#cf3f5c", "sortOrder": 40, "version": 0}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("cat-Exams"))
                .andExpect(jsonPath("$.color").value("#cf3f5c"))
                .andExpect(jsonPath("$.sortOrder").value(40))
                .andExpect(jsonPath("$.version").value(1));

        send(patch("/api/v1/event-categories/" + id), """
                {"name": "other", "version": 0}
                """)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
        send(patch("/api/v1/event-categories/" + id), """
                {"name": "CAT-health", "version": 1}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DUPLICATE_EVENT_CATEGORY_NAME"));
        send(patch("/api/v1/event-categories/" + id), """
                {"color": "#000000", "version": 1}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_EVENT_CATEGORY_COLOR"));
        send(patch("/api/v1/event-categories/" + id), """
                {"version": 1}
                """)
                .andExpect(status().isBadRequest());
        // Changing only the case of its own name is allowed.
        send(patch("/api/v1/event-categories/" + id), """
                {"name": "CAT-EXAMS", "version": 1}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("CAT-EXAMS"));

        send(patch("/api/v1/event-categories/00000000-0000-4000-8000-000000000000"), """
                {"name": "missing", "version": 0}
                """)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EVENT_CATEGORY_NOT_FOUND"));
    }

    @Test
    void evt006EventsCanBeCreatedChangedAndClearedWithoutACategory() throws Exception {
        String travel = categoryId("cat-Travel", "#c2549a");
        String family = categoryId("cat-Family", "#8a6d3b");

        String uncategorized = send(post("/api/v1/events"), timedJson("cat-Loose", "2071-04-01", null))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.category").value(nullValue()))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(uncategorized, "$.id");

        send(post("/api/v1/events"), timedJson("cat-Unknown", "2071-04-01", "00000000-0000-4000-8000-000000000000"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_EVENT_CATEGORY"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("categoryId"));

        send(patch("/api/v1/events/" + id), """
                {"categoryId": "%s", "version": 0}
                """.formatted(travel))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category.id").value(travel))
                .andExpect(jsonPath("$.category.name").value("cat-Travel"))
                .andExpect(jsonPath("$.category.color").value("#c2549a"));
        send(patch("/api/v1/events/" + id), """
                {"categoryId": "%s", "version": 1}
                """.formatted(family))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category.name").value("cat-Family"));
        // Omitting categoryId keeps the Category.
        send(patch("/api/v1/events/" + id), """
                {"title": "cat-Loose renamed", "version": 2}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category.name").value("cat-Family"));
        send(patch("/api/v1/events/" + id), """
                {"categoryId": null, "version": 3}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category").value(nullValue()))
                .andExpect(jsonPath("$.title").value("cat-Loose renamed"));
    }

    @Test
    void evt006RenamingOrDeletingACategoryKeepsItsEvents() throws Exception {
        String goalId = JsonPath.read(send(post("/api/v1/goals"), """
                {"parentGoalId": null, "type": "YEAR", "title": "cat goal", "why": "",
                 "startDate": "2072-01-01", "endDate": "2072-12-31", "priority": 1, "progressPolicy": "AUTO"}
                """).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        String categoryId = categoryId("cat-Clinic", "#2a927f");
        String eventId = JsonPath.read(send(post("/api/v1/events"), """
                {"title": "cat-Checkup", "categoryId": "%s", "allDay": false,
                 "startAt": "2072-02-03T09:00:00+09:00", "endAt": "2072-02-03T10:00:00+09:00",
                 "timezone": "Asia/Seoul", "location": "Clinic", "notes": "bring card", "recurrence": "WEEKLY",
                 "reminders": [10, 60], "linkedGoalId": "%s"}
                """.formatted(categoryId, goalId)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");

        send(patch("/api/v1/event-categories/" + categoryId), """
                {"name": "cat-Hospital", "color": "#3a78b8", "version": 0}
                """).andExpect(status().isOk());
        mvc.perform(get("/api/v1/events/" + eventId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category.name").value("cat-Hospital"))
                .andExpect(jsonPath("$.category.color").value("#3a78b8"))
                .andExpect(jsonPath("$.version").value(0));

        mvc.perform(delete("/api/v1/event-categories/" + categoryId)).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/events/" + eventId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("cat-Checkup"))
                .andExpect(jsonPath("$.category").value(nullValue()))
                .andExpect(jsonPath("$.startAt").value("2072-02-03T09:00:00+09:00"))
                .andExpect(jsonPath("$.location").value("Clinic"))
                .andExpect(jsonPath("$.notes").value("bring card"))
                .andExpect(jsonPath("$.recurrence").value("WEEKLY"))
                .andExpect(jsonPath("$.reminders", contains(10, 60)))
                .andExpect(jsonPath("$.linkedGoalId").value(goalId));
        mvc.perform(get("/api/v1/event-occurrences").param("from", "2072-02-01").param("to", "2072-02-29"))
                .andExpect(jsonPath("$[?(@.title == 'cat-Checkup')].eventId").value(
                        contains(eventId, eventId, eventId, eventId)));

        mvc.perform(delete("/api/v1/event-categories/" + categoryId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EVENT_CATEGORY_NOT_FOUND"));
        mvc.perform(get("/api/v1/event-categories"))
                .andExpect(jsonPath("$[?(@.id == '" + categoryId + "')]").isEmpty());
    }

    @Test
    void evt006FiltersEventsAndOccurrencesByCategoryOrUncategorized() throws Exception {
        String sports = categoryId("cat-Sports", "#d9822b");
        send(post("/api/v1/events"), timedJson("cat-Match", "2073-06-10", sports)).andExpect(status().isCreated());
        send(post("/api/v1/events"), timedJson("cat-Nothing", "2073-06-11", null)).andExpect(status().isCreated());

        String bySports = mvc.perform(get("/api/v1/events").param("categoryId", sports))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<String> titles = JsonPath.read(bySports, "$[*].title");
        assertThat(titles).containsExactly("cat-Match");

        String uncategorized = mvc.perform(get("/api/v1/events").param("hasCategory", "false"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<String> uncategorizedTitles = JsonPath.read(uncategorized, "$[*].title");
        List<Object> uncategorizedCategories = JsonPath.read(uncategorized, "$[*].category");
        assertThat(uncategorizedTitles).contains("cat-Nothing").doesNotContain("cat-Match");
        assertThat(uncategorizedCategories).allMatch(category -> category == null);

        String categorized = mvc.perform(get("/api/v1/events").param("hasCategory", "true"))
                .andReturn().getResponse().getContentAsString();
        assertThat((List<String>) JsonPath.read(categorized, "$[*].title"))
                .contains("cat-Match").doesNotContain("cat-Nothing");

        mvc.perform(get("/api/v1/event-occurrences").param("from", "2073-06-01").param("to", "2073-06-30")
                        .param("categoryId", sports))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].title", contains("cat-Match")))
                .andExpect(jsonPath("$[0].category.name").value("cat-Sports"));
        mvc.perform(get("/api/v1/event-occurrences").param("from", "2073-06-01").param("to", "2073-06-30")
                        .param("hasCategory", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.title == 'cat-Nothing')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.title == 'cat-Match')]").isEmpty());
    }

    private ResultActions createCategory(String name, String color) throws Exception {
        return send(post("/api/v1/event-categories"), """
                {"name": "%s", "color": "%s"}
                """.formatted(name, color));
    }

    private String categoryId(String name, String color) throws Exception {
        return JsonPath.read(createCategory(name, color).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");
    }

    private static String timedJson(String title, String date, String categoryId) {
        return """
                {"title": "%s", "categoryId": %s, "allDay": false, "startAt": "%sT10:00:00+09:00",
                 "endAt": "%sT11:00:00+09:00", "timezone": "Asia/Seoul", "recurrence": "NONE", "reminders": []}
                """.formatted(title, categoryId == null ? "null" : "\"" + categoryId + "\"", date, date);
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String json) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(json));
    }
}
