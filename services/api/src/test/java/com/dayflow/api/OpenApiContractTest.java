package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
    private MockMvc mvc;

    private String spec;

    @BeforeEach
    void loadSpec() throws Exception {
        spec = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString();
    }

    @Test
    void documentsCreatedAndNoContentStatusCodes() throws Exception {
        ResultActions docs = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());

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
        expectOnlySuccessStatus(docs, "/api/v1/reviews/{type}/{periodStart}", "get", "200");
        expectOnlySuccessStatus(docs, "/api/v1/reviews/{type}/{periodStart}", "put", "200");
        expectOnlySuccessStatus(docs, "/api/v1/review-items/{itemId}/convert", "post", "200");
        expectOnlySuccessStatus(docs, "/api/v1/recovery/apply", "post", "200");
        expectOnlySuccessStatus(docs, "/api/v1/recovery-days/{date}", "put", "200");
        expectOnlySuccessStatus(docs, "/api/v1/recovery-days/{date}", "delete", "204");
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
        for (String schema : List.of("GoalResponse", "DayResponse", "DayScheduleResponse", "ProblemResponse",
                "FieldViolation", "ReviewResponse", "ReviewItemResponse", "ConvertReviewItemResponse",
                "RecoveryDayResponse", "ApplyRecoveryResponse")) {
            assertThat(requiredOf(schema)).as(schema + " required").containsExactlyInAnyOrderElementsOf(
                    propertiesOf(schema));
        }

        mvc.perform(get("/v3/api-docs"))
                .andExpect(jsonPath(SCHEMAS + "GoalResponse.properties.parentGoalId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "DayResponse.properties.plannedDate.type",
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
                .andExpect(jsonPath(SCHEMAS + "CreateGoalRequest.properties.parentGoalId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "UpdateGoalRequest.properties.parentGoalId.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "UpdateGoalRequest.required", not(hasItem("parentGoalId"))))
                .andExpect(jsonPath(SCHEMAS + "UpdateDayRequest.properties.title.type").value("string"));
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
