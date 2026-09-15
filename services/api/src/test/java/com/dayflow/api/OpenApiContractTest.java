package com.dayflow.api;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** The generated OpenAPI document must describe the same status codes and bodies as the runtime API. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class OpenApiContractTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void documentsCreatedAndNoContentStatusCodes() throws Exception {
        ResultActions spec = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());

        expectOnlyStatus(spec, "/api/v1/goals", "post", "201");
        expectOnlyStatus(spec, "/api/v1/days", "post", "201");
        expectOnlyStatus(spec, "/api/v1/goals", "get", "200");
        expectOnlyStatus(spec, "/api/v1/goals/{goalId}", "get", "200");
        expectOnlyStatus(spec, "/api/v1/goals/{goalId}", "patch", "200");
        expectOnlyStatus(spec, "/api/v1/days", "get", "200");
        expectOnlyStatus(spec, "/api/v1/days/{dayId}", "get", "200");
        expectOnlyStatus(spec, "/api/v1/days/{dayId}", "patch", "200");
        expectOnlyStatus(spec, "/api/v1/days/{dayId}/schedule", "put", "200");
        expectOnlyStatus(spec, "/api/v1/goals/{goalId}", "delete", "204");
        expectOnlyStatus(spec, "/api/v1/days/{dayId}", "delete", "204");
        expectOnlyStatus(spec, "/api/v1/days/{dayId}/schedule", "delete", "204");
    }

    @Test
    void documentsExpectedVersionAsRequiredAndNullable() throws Exception {
        String schema = "$.components.schemas.SetDayScheduleRequest";

        mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openapi").value("3.1.0"))
                .andExpect(jsonPath(schema + ".required", hasItem("expectedVersion")))
                .andExpect(jsonPath(schema + ".properties.expectedVersion.type", containsInAnyOrder("integer", "null")))
                .andExpect(jsonPath(schema + ".properties.expectedVersion.format").value("int64"));
    }

    private static void expectOnlyStatus(ResultActions spec, String path, String method, String code)
            throws Exception {
        String responses = "$.paths['" + path + "']." + method + ".responses";
        spec.andExpect(jsonPath(responses + "['" + code + "']").exists());
        if (!code.equals("200")) {
            spec.andExpect(jsonPath(responses + "['200']").doesNotExist());
        }
    }
}
