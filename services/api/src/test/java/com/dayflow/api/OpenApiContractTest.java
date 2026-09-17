package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dayflow.api.common.OpenApiConfig;
import com.jayway.jsonpath.JsonPath;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** The generated OpenAPI document must describe the same status codes and bodies as the runtime API. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class OpenApiContractTest {

    private static final String SCHEMAS = "$.components.schemas.";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AuthTestSupport auth;

    /** The document is public; the runtime body checks call the API as a signed-in user. */
    private AuthTestSupport.UserMvc mvc;

    private String spec;

    @BeforeEach
    void signInAndLoadSpec() throws Exception {
        mvc = auth.as(mockMvc, auth.newUser("openapi-contract"));
        spec = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString();
    }

    /** AUTH-003: protected operations declare the Bearer JWT scheme and a 401; the public auth endpoints do not. */
    @Test
    void documentsBearerAuthenticationOnProtectedOperations() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.type").value("http"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.scheme").value("bearer"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.bearerFormat").value("JWT"))
                .andExpect(jsonPath("$.paths['/api/v1/goals'].get.security[0].bearerAuth").exists())
                .andExpect(jsonPath("$.paths['/api/v1/me'].get.security[0].bearerAuth").exists())
                .andExpect(problemResponse("/api/v1/goals", "get", "401"))
                .andExpect(problemResponse("/api/v1/recovery/carry-over/apply", "post", "401"))
                .andExpect(problemResponse("/api/v1/auth/refresh", "post", "401"))
                .andExpect(jsonPath("$.paths['/api/v1/auth/exchange'].post.security").doesNotExist())
                .andExpect(jsonPath("$.paths['/api/v1/auth/refresh'].post.security").doesNotExist())
                .andExpect(jsonPath("$.paths['/api/v1/auth/logout'].post.security").doesNotExist())
                .andExpect(jsonPath("$.paths['/api/v1/auth/google/start'].get.security").doesNotExist())
                .andExpect(jsonPath("$.paths['/api/v1/auth/dev/login']").doesNotExist());

        Map<String, Map<String, Map<String, Object>>> paths = JsonPath.read(spec, "$.paths");
        paths.forEach((path, operations) -> operations.forEach((method, operation) -> {
            boolean isPublic = OpenApiConfig.PUBLIC_PATHS.contains(path);
            assertThat(operation.containsKey("security")).as(method + " " + path + " security").isEqualTo(!isPublic);
        }));
        for (String schema : List.of("AuthTokenResponse", "MeResponse")) {
            assertThat(requiredOf(schema)).as(schema + " required").containsExactlyInAnyOrderElementsOf(propertiesOf(schema));
        }
        assertThat(propertiesOf("MeResponse")).containsExactlyInAnyOrder("id", "email", "displayName", "avatarUrl");
    }

    @Test
    void documentsCreatedAndNoContentStatusCodes() throws Exception {
        ResultActions docs = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk());

        expectOnlySuccessStatus(docs, "/api/v1/goals", "post", "201");
        expectOnlySuccessStatus(docs, "/api/v1/days", "post", "201");
        expectOnlySuccessStatus(docs, "/api/v1/goals", "get", "200");
        expectOnlySuccessStatus(docs, "/api/v1/goals/{goalId}", "get", "200");
        expectOnlySuccessStatus(docs, "/api/v1/goals/{goalId}", "patch", "200");
        expectOnlySuccessStatus(docs, "/api/v1/days", "get", "200");
        expectOnlySuccessStatus(docs, "/api/v1/days/{dayId}", "get", "200");
        expectOnlySuccessStatus(docs, "/api/v1/days/{dayId}", "patch", "200");
        expectOnlySuccessStatus(docs, "/api/v1/days/{dayId}/schedule", "put", "200");
        expectOnlySuccessStatus(docs, "/api/v1/goals/{goalId}", "delete", "204");
        expectOnlySuccessStatus(docs, "/api/v1/days/{dayId}", "delete", "204");
        expectOnlySuccessStatus(docs, "/api/v1/days/{dayId}/schedule", "delete", "204");
        expectOnlySuccessStatus(docs, "/api/v1/day-tags", "post", "201");
        expectOnlySuccessStatus(docs, "/api/v1/day-tags", "get", "200");
        expectOnlySuccessStatus(docs, "/api/v1/day-tags/{tagId}", "patch", "200");
        expectOnlySuccessStatus(docs, "/api/v1/day-tags/{tagId}", "delete", "204");
        expectOnlySuccessStatus(docs, "/api/v1/reviews/{type}/{periodStart}", "get", "200");
        expectOnlySuccessStatus(docs, "/api/v1/reviews/{type}/{periodStart}", "put", "200");
        expectOnlySuccessStatus(docs, "/api/v1/review-items/{itemId}/convert", "post", "200");
        expectOnlySuccessStatus(docs, "/api/v1/recovery/apply", "post", "200");
        expectOnlySuccessStatus(docs, "/api/v1/recovery-days/{date}", "put", "200");
        expectOnlySuccessStatus(docs, "/api/v1/recovery-days/{date}", "delete", "204");
        expectOnlySuccessStatus(docs, "/api/v1/events", "post", "201");
        expectOnlySuccessStatus(docs, "/api/v1/events", "get", "200");
        expectOnlySuccessStatus(docs, "/api/v1/events/{eventId}", "get", "200");
        expectOnlySuccessStatus(docs, "/api/v1/events/{eventId}", "patch", "200");
        expectOnlySuccessStatus(docs, "/api/v1/events/{eventId}", "delete", "204");
        expectOnlySuccessStatus(docs, "/api/v1/event-occurrences", "get", "200");
        expectOnlySuccessStatus(docs, "/api/v1/event-categories", "get", "200");
        expectOnlySuccessStatus(docs, "/api/v1/event-categories", "post", "201");
        expectOnlySuccessStatus(docs, "/api/v1/event-categories/{categoryId}", "patch", "200");
        expectOnlySuccessStatus(docs, "/api/v1/event-categories/{categoryId}", "delete", "204");
    }

    @Test
    void documentsTimedAndAllDayEventFieldsAsRequiredNullables() throws Exception {
        for (String schema : List.of("EventResponse", "EventOccurrenceResponse")) {
            assertThat(requiredOf(schema)).as(schema + " required").containsExactlyInAnyOrderElementsOf(
                    propertiesOf(schema));
            for (String field : List.of("startAt", "endAt", "startDate", "endDateExclusive", "location",
                    "linkedGoalId")) {
                List<String> types = JsonPath.read(spec, SCHEMAS + schema + ".properties." + field + ".type");
                assertThat(types).as(schema + "." + field).containsExactlyInAnyOrder("string", "null");
            }
        }
        mvc.perform(get("/v3/api-docs"))
                .andExpect(problemResponse("/api/v1/events/{eventId}", "patch", "409"))
                .andExpect(problemResponse("/api/v1/events/{eventId}", "delete", "409"))
                .andExpect(jsonPath(SCHEMAS + "EventResponse.properties.reminders.type").value("array"))
                .andExpect(jsonPath(SCHEMAS + "CreateEventRequest.properties.reminders.maxItems").value(5))
                .andExpect(jsonPath(SCHEMAS + "UpdateEventRequest.required", not(hasItem("linkedGoalId"))))
                .andExpect(jsonPath(SCHEMAS + "EventResponse.properties.type").doesNotExist())
                .andExpect(jsonPath(SCHEMAS + "EventType").doesNotExist())
                .andExpect(jsonPath(SCHEMAS + "EventResponse.properties.category.oneOf[*]['$ref']",
                        contains("#/components/schemas/EventCategorySummary")))
                .andExpect(jsonPath(SCHEMAS + "EventResponse.properties.category.oneOf[*].type", contains("null")))
                .andExpect(jsonPath(SCHEMAS + "EventOccurrenceResponse.properties.category.oneOf[*].type",
                        contains("null")))
                .andExpect(jsonPath(SCHEMAS + "CreateEventRequest.properties.categoryId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "CreateEventRequest.required", not(hasItem("categoryId"))))
                .andExpect(jsonPath(SCHEMAS + "UpdateEventRequest.properties.categoryId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(problemResponse("/api/v1/event-categories/{categoryId}", "patch", "409"))
                .andExpect(problemResponse("/api/v1/event-categories/{categoryId}", "delete", "404"));
    }

    /** A timed and an all-day Event carry every documented field, with the other kind's pair as null. */
    @Test
    void runtimeEventBodiesMatchDocumentedFields() throws Exception {
        for (String json : List.of("""
                {"title": "Contract timed", "allDay": false, "startAt": "2050-01-01T09:00:00Z",
                 "endAt": "2050-01-01T10:00:00Z", "timezone": "UTC", "recurrence": "NONE", "reminders": []}
                """, """
                {"title": "Contract all-day", "allDay": true, "startDate": "2050-01-01",
                 "endDateExclusive": "2050-01-02", "timezone": "UTC", "recurrence": "NONE", "reminders": []}
                """)) {
            String event = mvc.perform(post("/api/v1/events").contentType(MediaType.APPLICATION_JSON).content(json))
                    .andExpect(status().isCreated())
                    .andReturn().getResponse().getContentAsString();
            assertThat(keysOf(event)).containsExactlyInAnyOrderElementsOf(propertiesOf("EventResponse"));
        }
        String occurrences = mvc.perform(get("/api/v1/event-occurrences").param("from", "2050-01-01")
                        .param("to", "2050-01-01"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<Map<String, Object>> list = JsonPath.read(occurrences, "$");
        assertThat(list).hasSizeGreaterThanOrEqualTo(2)
                .allSatisfy(occurrence -> assertThat(occurrence.keySet())
                        .containsExactlyInAnyOrderElementsOf(propertiesOf("EventOccurrenceResponse")));
    }

    @Test
    void documentsJsonSuccessBodiesAndProblemDetailsErrors() throws Exception {
        assertThat(spec).doesNotContain("*/*");

        mvc.perform(get("/v3/api-docs"))
                .andExpect(jsonPath("$.paths['/api/v1/goals'].post.responses['201'].content['application/json']")
                        .exists())
                .andExpect(jsonPath("$.paths['/api/v1/days/{dayId}/schedule'].put.responses['200'].content['application/json']")
                        .exists())
                .andExpect(problemResponse("/api/v1/goals", "post", "400"))
                .andExpect(problemResponse("/api/v1/goals/{goalId}", "get", "404"))
                .andExpect(problemResponse("/api/v1/goals/{goalId}", "patch", "409"))
                .andExpect(problemResponse("/api/v1/goals/{goalId}", "delete", "409"))
                .andExpect(problemResponse("/api/v1/days/{dayId}", "patch", "409"))
                .andExpect(problemResponse("/api/v1/days/{dayId}/schedule", "put", "409"))
                .andExpect(problemResponse("/api/v1/days/{dayId}/schedule", "delete", "404"));
    }

    @Test
    void documentsResponseFieldsAsRequiredWithExplicitNulls() throws Exception {
        for (String schema : List.of("GoalResponse", "DayResponse", "DayTagResponse", "DayScheduleResponse",
                "ProblemResponse", "FieldViolation", "ReviewResponse", "ReviewItemResponse",
                "ConvertReviewItemResponse", "RecoveryDayResponse", "ApplyRecoveryResponse",
                "RecoveryCandidateResponse", "RecoveryEventResponse", "RecoveryEventItemResponse",
                "CarryOverPreviewResponse", "CarryOverLevelPreview", "CarryOverDayPreview", "ApplyCarryOverResponse",
                "CarriedDayResponse", "EventCategoryResponse", "EventCategorySummary")) {
            assertThat(requiredOf(schema)).as(schema + " required").containsExactlyInAnyOrderElementsOf(
                    propertiesOf(schema));
        }

        mvc.perform(get("/v3/api-docs"))
                .andExpect(jsonPath(SCHEMAS + "GoalResponse.properties.parentGoalId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "DayResponse.properties.plannedDate.type",
                        containsInAnyOrder("string", "null")))
                // REC-003: continuation links are always sent, null when there is none.
                .andExpect(jsonPath(SCHEMAS + "DayResponse.properties.carriedFromDayId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "GoalResponse.properties.continuedFromGoalId.type",
                        containsInAnyOrder("string", "null")))
                // REV-003/REV-004: review lines always send both Goal links, null when unlinked.
                .andExpect(jsonPath(SCHEMAS + "ReviewItemResponse.properties.goalId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "ReviewItemResponse.properties.targetGoalId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "ReviewItemRequest.required", not(hasItem("goalId"))))
                .andExpect(jsonPath(SCHEMAS + "ReviewItemRequest.required", not(hasItem("targetGoalId"))))
                // DAY-001: a Day without a Goal sends goalId: null, so the field stays required.
                .andExpect(jsonPath(SCHEMAS + "DayResponse.properties.goalId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "DayResponse.properties.schedule.oneOf[0]['$ref']")
                        .value("#/components/schemas/DayScheduleResponse"))
                .andExpect(jsonPath(SCHEMAS + "DayResponse.properties.schedule.oneOf[1].type").value("null"));
    }

    @Test
    void documentsNullableRequestFieldsWithoutMakingThemRequired() throws Exception {
        mvc.perform(get("/v3/api-docs"))
                .andExpect(jsonPath(SCHEMAS + "UpdateDayRequest.properties.plannedDate.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "UpdateDayRequest.required", not(hasItem("plannedDate"))))
                .andExpect(jsonPath(SCHEMAS + "CreateDayRequest.properties.plannedDate.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "CreateDayRequest.required", not(hasItem("plannedDate"))))
                .andExpect(jsonPath(SCHEMAS + "CreateDayRequest.properties.goalId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "CreateDayRequest.required", not(hasItem("goalId"))))
                .andExpect(jsonPath(SCHEMAS + "CreateDayRequest.required", not(hasItem("tagIds"))))
                .andExpect(jsonPath(SCHEMAS + "UpdateDayRequest.properties.goalId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "UpdateDayRequest.required", not(hasItem("goalId"))))
                .andExpect(jsonPath(SCHEMAS + "CreateGoalRequest.properties.parentGoalId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "UpdateGoalRequest.properties.parentGoalId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "UpdateGoalRequest.required", not(hasItem("parentGoalId"))))
                .andExpect(jsonPath(SCHEMAS + "UpdateDayRequest.properties.title.type").value("string"));
    }

    /** docs/requirements.md §9 is the Source of Truth for the API table: its Recovery rows match the runtime spec. */
    @Test
    void recoveryEndpointsInTheRequirementsMatchTheRuntimeSpec() throws Exception {
        Pattern row = Pattern.compile(
                "^\\|\\s*([A-Z/]+)\\s*\\|\\s*(/api/v1/recovery[^\\s|]*)\\s*\\|");
        Set<String> documented = new TreeSet<>();
        // The test JVM runs in services/api.
        for (String line : Files.readAllLines(Path.of("../../docs/requirements.md"))) {
            Matcher matcher = row.matcher(line);
            if (matcher.find()) {
                for (String method : matcher.group(1).split("/")) {
                    documented.add(method.toLowerCase() + " " + matcher.group(2));
                }
            }
        }

        Map<String, Map<String, Object>> paths = JsonPath.read(spec, "$.paths");
        Set<String> runtime = new TreeSet<>();
        paths.forEach((path, operations) -> {
            if (path.startsWith("/api/v1/recovery")) {
                operations.keySet().forEach(method -> runtime.add(method + " " + path));
            }
        });

        assertThat(documented).isEqualTo(runtime);
    }

    @Test
    void documentsExpectedVersionAsRequiredAndNullable() throws Exception {
        String schema = SCHEMAS + "SetDayScheduleRequest";

        mvc.perform(get("/v3/api-docs"))
                .andExpect(jsonPath("$.openapi").value("3.1.0"))
                .andExpect(jsonPath(schema + ".required", hasItem("expectedVersion")))
                .andExpect(jsonPath(schema + ".properties.expectedVersion.type", containsInAnyOrder("integer", "null")))
                .andExpect(jsonPath(schema + ".properties.expectedVersion.format").value("int64"));
    }

    /** AI Coach: POST 200, every response field required, suggestion action fields as explicit nullables. */
    @Test
    void documentsTodayCoachResponse() throws Exception {
        expectOnlySuccessStatus(mockMvc.perform(get("/v3/api-docs")), "/api/v1/ai/coach/today", "post", "200");
        mvc.perform(get("/v3/api-docs"))
                .andExpect(problemResponse("/api/v1/ai/coach/today", "post", "401"))
                .andExpect(problemResponse("/api/v1/ai/coach/today", "post", "409"))
                .andExpect(problemResponse("/api/v1/ai/coach/today", "post", "429"))
                .andExpect(problemResponse("/api/v1/ai/coach/today", "post", "502"))
                .andExpect(problemResponse("/api/v1/ai/coach/today", "post", "503"));
        for (String schema : List.of("TodayCoachResponse", "CoachPriority", "CoachObservation", "CoachEvidence",
                "CoachSuggestion")) {
            assertThat(requiredOf(schema)).as(schema + " required").containsExactlyInAnyOrderElementsOf(propertiesOf(schema));
        }
        for (String field : List.of("dayId", "dayTitle", "proposedDate", "proposedPriority")) {
            List<String> types = JsonPath.read(spec, SCHEMAS + "CoachSuggestion.properties." + field + ".type");
            assertThat(types).as("CoachSuggestion." + field).containsExactlyInAnyOrder("string", "null");
        }

        String coach = mvc.perform(post("/api/v1/ai/coach/today").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"localDate\":\"%s\",\"timezone\":\"UTC\"}".formatted(java.time.LocalDate.now(java.time.ZoneOffset.UTC))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(keysOf(coach)).containsExactlyInAnyOrderElementsOf(propertiesOf("TodayCoachResponse"));
    }

    /** AI Review Coach: POST 200, every field required (including "try"), runtime keys match the document. */
    @Test
    void documentsReviewCoachResponse() throws Exception {
        expectOnlySuccessStatus(mockMvc.perform(get("/v3/api-docs")), "/api/v1/ai/coach/review", "post", "200");
        mvc.perform(get("/v3/api-docs"))
                .andExpect(problemResponse("/api/v1/ai/coach/review", "post", "400"))
                .andExpect(problemResponse("/api/v1/ai/coach/review", "post", "401"))
                .andExpect(problemResponse("/api/v1/ai/coach/review", "post", "429"))
                .andExpect(problemResponse("/api/v1/ai/coach/review", "post", "502"))
                .andExpect(problemResponse("/api/v1/ai/coach/review", "post", "503"));
        for (String schema : List.of("ReviewCoachResponse", "ReviewDraftItem", "ReviewHighlight", "ReviewEvidence")) {
            assertThat(requiredOf(schema)).as(schema + " required").containsExactlyInAnyOrderElementsOf(propertiesOf(schema));
        }
        assertThat(propertiesOf("ReviewCoachResponse")).contains("keep", "problem", "try").doesNotContain("tryItems");

        String draft = mvc.perform(post("/api/v1/ai/coach/review").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"WEEK\",\"periodStart\":\"2026-08-03\",\"timezone\":\"Asia/Seoul\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(keysOf(draft)).containsExactlyInAnyOrderElementsOf(propertiesOf("ReviewCoachResponse"));
    }

    /** AI Recovery Coach: POST 200, every field required, targetDate an explicit nullable. */
    @Test
    void documentsRecoveryCoachResponse() throws Exception {
        String path = "/api/v1/ai/coach/recovery";
        expectOnlySuccessStatus(mockMvc.perform(get("/v3/api-docs")), path, "post", "200");
        mvc.perform(get("/v3/api-docs"))
                .andExpect(problemResponse(path, "post", "400"))
                .andExpect(problemResponse(path, "post", "401"))
                .andExpect(problemResponse(path, "post", "409"))
                .andExpect(problemResponse(path, "post", "429"))
                .andExpect(problemResponse(path, "post", "502"))
                .andExpect(problemResponse(path, "post", "503"));
        for (String schema : List.of("RecoveryCoachResponse", "RecoveryRecommendation", "RecoveryCoachObservation",
                "CoachFact")) {
            assertThat(requiredOf(schema)).as(schema + " required").containsExactlyInAnyOrderElementsOf(propertiesOf(schema));
        }
        List<String> types = JsonPath.read(spec, SCHEMAS + "RecoveryRecommendation.properties.targetDate.type");
        assertThat(types).containsExactlyInAnyOrder("string", "null");

        String body = mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"localDate\":\"%s\",\"timezone\":\"UTC\"}".formatted(java.time.LocalDate.now(java.time.ZoneOffset.UTC))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(keysOf(body)).containsExactlyInAnyOrderElementsOf(propertiesOf("RecoveryCoachResponse"));
    }

    /** AI Planning Coach: POST 200, every field required, optional suggestion fields as explicit nullables. */
    @Test
    void documentsPlanningCoachResponse() throws Exception {
        String path = "/api/v1/ai/coach/planning";
        expectOnlySuccessStatus(mockMvc.perform(get("/v3/api-docs")), path, "post", "200");
        mvc.perform(get("/v3/api-docs"))
                .andExpect(problemResponse(path, "post", "400"))
                .andExpect(problemResponse(path, "post", "401"))
                .andExpect(problemResponse(path, "post", "404"))
                .andExpect(problemResponse(path, "post", "409"))
                .andExpect(problemResponse(path, "post", "429"))
                .andExpect(problemResponse(path, "post", "502"))
                .andExpect(problemResponse(path, "post", "503"));
        for (String schema : List.of("PlanningCoachResponse", "PlanningDaySuggestion", "PlanningDayProposal",
                "PlanningCoachObservation")) {
            assertThat(requiredOf(schema)).as(schema + " required").containsExactlyInAnyOrderElementsOf(propertiesOf(schema));
        }
        for (String field : List.of("targetDate", "startTime", "endTime")) {
            List<String> types = JsonPath.read(spec, SCHEMAS + "PlanningDaySuggestion.properties." + field + ".type");
            assertThat(types).as("PlanningDaySuggestion." + field).containsExactlyInAnyOrder("string", "null");
        }
        List<String> proposed = JsonPath.read(spec, SCHEMAS + "PlanningDayProposal.properties.proposedDate.type");
        assertThat(proposed).containsExactlyInAnyOrder("string", "null");

        java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneOffset.UTC);
        String goal = mvc.perform(post("/api/v1/goals").contentType(MediaType.APPLICATION_JSON).content("""
                {"kind":"PERIOD","parentGoalId":null,"type":null,"title":"Contract period","why":"","startDate":"%s",
                 "endDate":"%s","priority":1,"progressPolicy":"AUTO"}""".formatted(today, today.plusDays(14))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String goalId = JsonPath.read(goal, "$.id");
        String body = mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"goalId\":\"%s\",\"weekStart\":null,\"timezone\":\"UTC\"}".formatted(goalId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(keysOf(body)).containsExactlyInAnyOrderElementsOf(propertiesOf("PlanningCoachResponse"));
    }

    /** Runtime bodies must carry exactly the documented fields, including explicit nulls. */
    @Test
    void runtimeBodiesMatchDocumentedFields() throws Exception {
        String goal = mvc.perform(post("/api/v1/goals").contentType(MediaType.APPLICATION_JSON).content("""
                {"type": "YEAR", "title": "Contract goal", "why": "Docs match runtime", "startDate": "2026-01-01",
                 "endDate": "2026-12-31", "priority": 1, "progressPolicy": "AUTO"}
                """))
                .andExpect(status().isCreated())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andReturn().getResponse().getContentAsString();
        assertThat(keysOf(goal)).containsExactlyInAnyOrderElementsOf(propertiesOf("GoalResponse"));

        String error = mvc.perform(get("/api/v1/goals/00000000-0000-4000-8000-000000000000"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andReturn().getResponse().getContentAsString();
        assertThat(keysOf(error)).containsExactlyInAnyOrderElementsOf(propertiesOf("ProblemResponse"));
    }

    private List<String> requiredOf(String schema) {
        return JsonPath.read(spec, SCHEMAS + schema + ".required");
    }

    private List<String> propertiesOf(String schema) {
        Map<String, Object> properties = JsonPath.read(spec, SCHEMAS + schema + ".properties");
        return List.copyOf(properties.keySet());
    }

    private static List<String> keysOf(String json) {
        Map<String, Object> body = JsonPath.read(json, "$");
        return List.copyOf(body.keySet());
    }

    private static org.springframework.test.web.servlet.ResultMatcher problemResponse(
            String path, String method, String code) {
        return jsonPath("$.paths['" + path + "']." + method + ".responses['" + code
                + "'].content['application/problem+json'].schema['$ref']")
                .value("#/components/schemas/ProblemResponse");
    }

    private static void expectOnlySuccessStatus(ResultActions docs, String path, String method, String code)
            throws Exception {
        String responses = "$.paths['" + path + "']." + method + ".responses";
        docs.andExpect(jsonPath(responses + "['" + code + "']").exists());
        for (String other : List.of("200", "201", "204")) {
            if (!other.equals(code)) {
                docs.andExpect(jsonPath(responses + "['" + other + "']").doesNotExist());
            }
        }
    }
}
