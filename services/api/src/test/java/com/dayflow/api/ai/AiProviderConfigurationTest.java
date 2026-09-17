package com.dayflow.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Provider selection: an incomplete AI configuration only disables the Coach, it never breaks the server start. */
class AiProviderConfigurationTest {

    private final AiProviderConfiguration configuration = new AiProviderConfiguration();
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    private static AiCoachProperties properties(String provider, String apiKey) {
        return new AiCoachProperties(provider,
                new AiCoachProperties.Groq(apiKey, "openai/gpt-oss-20b", null, null, null, null, null, null));
    }

    @Test
    void defaultsToDisabled() {
        assertThat(configuration.aiCoachProvider(properties(null, null), jsonMapper))
                .isInstanceOf(DisabledAiCoachProvider.class);
        assertThat(configuration.aiCoachProvider(properties("disabled", "key"), jsonMapper))
                .isInstanceOf(DisabledAiCoachProvider.class);
        assertThat(configuration.aiCoachProvider(properties("openai", "key"), jsonMapper))
                .isInstanceOf(DisabledAiCoachProvider.class);
    }

    @Test
    void groqWithoutKeyIsDisabledInsteadOfFailing() {
        assertThat(configuration.aiCoachProvider(properties("groq", null), jsonMapper))
                .isInstanceOf(DisabledAiCoachProvider.class);
        assertThat(configuration.aiCoachProvider(properties("GROQ", "  "), jsonMapper))
                .isInstanceOf(DisabledAiCoachProvider.class);
    }

    @Test
    void groqWithKeyUsesGroqAndTheDefaultBaseUrl() {
        AiCoachProperties properties = properties("groq", "gsk_test");
        AiCoachProvider provider = configuration.aiCoachProvider(properties, jsonMapper);
        assertThat(provider).isInstanceOf(GroqAiCoachProvider.class);
        assertThat(provider.available()).isTrue();
        assertThat(properties.groq().baseUrl()).isEqualTo("https://api.groq.com/openai/v1");
        assertThat(properties.groq().outputMode()).isEqualTo(AiCoachProperties.OutputMode.STRICT);
    }

    @Test
    void productionRefusesTheFixtureProvider() {
        assertThatThrownBy(() -> new AiProductionConfigValidator(properties("fixture", null)).afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("AI_COACH_PROVIDER");
        new AiProductionConfigValidator(properties("groq", null)).afterPropertiesSet();
        new AiProductionConfigValidator(properties("disabled", null)).afterPropertiesSet();
    }
}
