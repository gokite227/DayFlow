package com.dayflow.api.common;

import io.swagger.v3.oas.models.media.JsonSchema;
import io.swagger.v3.oas.models.media.Schema;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class OpenApiConfig {

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
