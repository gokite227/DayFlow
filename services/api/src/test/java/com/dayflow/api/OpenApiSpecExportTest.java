package com.dayflow.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes /v3/api-docs to a file for TypeScript client generation. Skipped unless
 * -Dopenapi.export.path is set (see packages/api-client/README.md).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@EnabledIfSystemProperty(named = "openapi.export.path", matches = ".+")
class OpenApiSpecExportTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void exportOpenApiSpec() throws Exception {
        String json = mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        // Sorted keys and LF line endings keep the committed spec diff stable across machines.
        JsonMapper mapper = JsonMapper.builder()
                .enable(SerializationFeature.INDENT_OUTPUT)
                .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
                .build();
        Map<String, Object> spec = mapper.readValue(json, new TypeReference<Map<String, Object>>() {
        });
        String formatted = mapper.writeValueAsString(spec).replace("\r\n", "\n") + "\n";

        Path output = Path.of(System.getProperty("openapi.export.path")).toAbsolutePath().normalize();
        Files.createDirectories(output.getParent());
        Files.writeString(output, formatted, StandardCharsets.UTF_8);
    }
}
