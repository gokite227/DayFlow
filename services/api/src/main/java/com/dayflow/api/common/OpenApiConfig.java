package com.dayflow.api.common;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.JsonSchema;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class OpenApiConfig {

    public static final String BEARER_SCHEME = "bearerAuth";

    /** Endpoints a client calls without an access token (AUTH-001, AUTH-004). */
    public static final Set<String> PUBLIC_PATHS = Set.of(
            "/api/v1/auth/google/start", "/api/v1/auth/exchange", "/api/v1/auth/refresh", "/api/v1/auth/logout");

    /**
     * AUTH-003: every other /api operation requires a DayFlow access token. Documents the Bearer JWT scheme,
     * the requirement and the 401 Problem Details response on those operations.
     */
    @Bean
    OpenApiCustomizer bearerAuthenticationCustomizer() {
        return openApi -> {
            if (openApi.getComponents() == null) {
                openApi.setComponents(new Components());
            }
            openApi.getComponents().addSecuritySchemes(BEARER_SCHEME, new SecurityScheme()
                    .type(SecurityScheme.Type.HTTP)
                    .scheme("bearer")
                    .bearerFormat("JWT")
                    .description("DayFlow access token from /api/v1/auth/exchange or /api/v1/auth/refresh"));
            if (openApi.getPaths() == null) {
                return;
            }
            openApi.getPaths().forEach((path, item) -> {
                if (PUBLIC_PATHS.contains(path)) {
                    return;
                }
                item.readOperations().stream().filter(operation -> operation.getSecurity() == null).forEach(operation -> {
                    operation.addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME));
                    Schema<?> problem = new JsonSchema();
                    problem.set$ref("#/components/schemas/ProblemResponse");
                    operation.getResponses().addApiResponse("401", new ApiResponse()
                            .description("Missing, expired or invalid access token (UNAUTHORIZED)")
                            .content(new Content().addMediaType(ProblemResponse.MEDIA_TYPE, new MediaType().schema(problem))));
                });
            });
        };
    }

    /**
     * A property declared as {@code @Schema(types = {"object", "null"})} on a DTO type is
     * generated as {@code $ref} plus sibling {@code type}. In OpenAPI 3.1 both must hold,
     * so null would still be rejected. Rewrite it to {@code oneOf: [$ref, {type: null}]}.
     */
    @Bean
    OpenApiCustomizer nullableReferenceCustomizer() {
        return openApi -> {
            if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
                return;
            }
            for (Schema<?> schema : openApi.getComponents().getSchemas().values()) {
                Map<String, Schema> properties = schema.getProperties();
                if (properties != null) {
                    properties.replaceAll((name, property) -> isNullableReference(property)
                            ? nullableReference(property)
                            : property);
                }
            }
        };
    }

    private static boolean isNullableReference(Schema<?> property) {
        return property.get$ref() != null && property.getTypes() != null && property.getTypes().contains("null");
    }

    private static Schema<?> nullableReference(Schema<?> property) {
        Schema<?> reference = new JsonSchema();
        reference.set$ref(property.get$ref());
        Schema<?> nullType = new JsonSchema();
        nullType.setTypes(Set.of("null"));

        Schema<?> nullable = new JsonSchema();
        nullable.setDescription(property.getDescription());
        nullable.setOneOf(List.of(reference, nullType));
        return nullable;
    }
}
