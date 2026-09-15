package com.dayflow.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** application-test.yml allows only http://localhost:3000 (dayflow.cors.allowed-origins). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CorsIntegrationTest {

    private static final String WEB_ORIGIN = "http://localhost:3000";

    @Autowired
    private MockMvc mvc;

    @Test
    void allowsPreflightFromConfiguredOriginWithoutCredentials() throws Exception {
        mvc.perform(options("/api/v1/days/00000000-0000-4000-8000-000000000000")
                        .header(HttpHeaders.ORIGIN, WEB_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "PATCH")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, WEB_ORIGIN))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS));
    }

    @Test
    void exposesLocationToConfiguredOrigin() throws Exception {
        mvc.perform(get("/api/v1/goals").header(HttpHeaders.ORIGIN, WEB_ORIGIN))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, WEB_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, "Location"));
    }

    @Test
    void rejectsUnconfiguredOrigin() throws Exception {
        mvc.perform(options("/api/v1/goals")
                        .header(HttpHeaders.ORIGIN, "https://unknown.example")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }
}
