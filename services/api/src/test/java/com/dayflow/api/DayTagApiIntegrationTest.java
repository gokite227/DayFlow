package com.dayflow.api;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
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

/** DAY-005 Day Tag rules and Day ↔ Tag links against a real PostgreSQL. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class DayTagApiIntegrationTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void day005CreatesRenamesRecolorsAndSortsTags() throws Exception {
        String tagId = createTag("  운동  ", "#5FB7A5", null);

        // The name is stored trimmed and the color normalized to the palette's lowercase form.
        mvc.perform(get("/api/v1/day-tags"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + tagId + "')].name").value("운동"))
                .andExpect(jsonPath("$[?(@.id == '" + tagId + "')].color").value("#5fb7a5"));

        send(patch("/api/v1/day-tags/" + tagId), """
                {"name": "운동/스트레칭", "color": "#c78be7", "sortOrder": 5, "version": 0}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("운동/스트레칭"))
                .andExpect(jsonPath("$.color").value("#c78be7"))
                .andExpect(jsonPath("$.sortOrder").value(5))
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test
    void day005RejectsDuplicateNamesIgnoringCase() throws Exception {
        createTag("Work", "#ee749d", 0);

        send(post("/api/v1/day-tags"), tagJson("  work  ", "#8aa6ee", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DUPLICATE_DAY_TAG_NAME"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("name"));

        String other = createTag("Study", "#8aa6ee", 1);
        send(patch("/api/v1/day-tags/" + other), """
                {"name": "WORK", "version": 0}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DUPLICATE_DAY_TAG_NAME"));

        // Renaming a Tag to its own name (different case) is allowed.
        send(patch("/api/v1/day-tags/" + other), """
                {"name": "study", "version": 0}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("study"));
    }

    @Test
    void day005RejectsBlankLongNamesAndColorsOutsideThePalette() throws Exception {
        send(post("/api/v1/day-tags"), tagJson("   ", "#ee749d", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        send(post("/api/v1/day-tags"), tagJson("가".repeat(31), "#ee749d", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        send(post("/api/v1/day-tags"), tagJson("자유색", "#123456", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_DAY_TAG_COLOR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("color"));
    }

    @Test
    void day005RejectsStaleTagVersion() throws Exception {
        String tagId = createTag("독서", "#9a8fa6", 0);
        send(patch("/api/v1/day-tags/" + tagId), """
                {"name": "독서2", "version": 0}
                """).andExpect(status().isOk());

        send(patch("/api/v1/day-tags/" + tagId), """
                {"name": "독서3", "version": 0}
                """)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
    }

    @Test
    void day005PutsSeveralTagsOnADayAndFiltersByTag() throws Exception {
        String home = createTag("청소", "#9a8fa6", 0);
        String fitness = createTag("달리기", "#5fb7a5", 1);

        String dayId = idOf(send(post("/api/v1/days"), dayJson("빨래", List.of(home, fitness)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.tags", hasSize(2)))
                .andExpect(jsonPath("$.tags[0].name").value("청소")));

        mvc.perform(get("/api/v1/days").param("tagId", fitness))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + dayId + "')]").isNotEmpty());

        // A sent list replaces the Tags; an empty list removes them.
        send(patch("/api/v1/days/" + dayId), """
                {"tagIds": ["%s"], "version": 0}
                """.formatted(home))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tags", hasSize(1)))
                .andExpect(jsonPath("$.tags[0].id").value(home));

        mvc.perform(get("/api/v1/days").param("tagId", fitness))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + dayId + "')]").isEmpty());

        send(patch("/api/v1/days/" + dayId), """
                {"tagIds": [], "version": 1}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tags").isEmpty());
    }

    @Test
    void day005RejectsMoreThanTenTagsAndUnknownTagIds() throws Exception {
        List<String> tagIds = IntStream.range(0, 11)
                .mapToObj(index -> {
                    try {
                        return createTag("tag-" + index, "#ee749d", index);
                    } catch (Exception exception) {
                        throw new IllegalStateException(exception);
                    }
                })
                .toList();

        send(post("/api/v1/days"), dayJson("너무 많은 태그", tagIds))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        send(post("/api/v1/days"), dayJson("모르는 태그", List.of("00000000-0000-4000-8000-000000000000")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_DAY_TAG"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("tagIds"));

        send(post("/api/v1/days"), dayJson("딱 열 개", tagIds.subList(0, 10)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.tags", hasSize(10)));
    }

    @Test
    void day005DeletingATagKeepsItsDays() throws Exception {
        String tagId = createTag("부업", "#f0a45c", 0);
        String dayId = idOf(send(post("/api/v1/days"), dayJson("블로그 글쓰기", List.of(tagId)))
                .andExpect(status().isCreated()));

        mvc.perform(delete("/api/v1/day-tags/" + tagId)).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/days/" + dayId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("블로그 글쓰기"))
                .andExpect(jsonPath("$.tags").isEmpty());
        mvc.perform(patch("/api/v1/day-tags/" + tagId).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\": \"부업\", \"version\": 0}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DAY_TAG_NOT_FOUND"));
    }

    private String createTag(String name, String color, Integer sortOrder) throws Exception {
        return idOf(send(post("/api/v1/day-tags"), tagJson(name, color, sortOrder))
                .andExpect(status().isCreated()));
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String json) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private static String idOf(ResultActions result) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id");
    }

    private static String tagJson(String name, String color, Integer sortOrder) {
        return """
                {"name": "%s", "color": "%s", "sortOrder": %s}
                """.formatted(name, color, sortOrder == null ? "null" : sortOrder);
    }

    /** A Day without a Goal, so Tag rules are tested on their own (DAY-001). */
    private static String dayJson(String title, List<String> tagIds) {
        String ids = tagIds.stream().map(id -> "\"" + id + "\"").collect(Collectors.joining(", "));
        return """
                {"goalId": null, "title": "%s", "status": "NOT_STARTED", "priority": "MEDIUM",
                 "estimatedMinutes": 30, "plannedDate": null, "planningMode": "ANYTIME", "coreDay": false,
                 "tagIds": [%s]}
                """.formatted(title, ids);
    }
}
