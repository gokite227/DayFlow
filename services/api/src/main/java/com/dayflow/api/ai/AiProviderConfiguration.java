package com.dayflow.api.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;

/**
 * Picks the one {@link AiCoachProvider} from {@code dayflow.ai.provider}. Services only ever see the interface, so
 * nothing outside this package knows Groq exists.
 *
 * <p>An incomplete configuration never fails the start: {@code groq} without GROQ_API_KEY falls back to the disabled
 * provider with a warning (the key itself is never logged), and the Coach reports AI_COACH_UNAVAILABLE.
 */
@Configuration
public class AiProviderConfiguration {

    private static final Logger log = LoggerFactory.getLogger(AiProviderConfiguration.class);

    @Bean
    public AiCoachProvider aiCoachProvider(AiCoachProperties properties, JsonMapper jsonMapper) {
        if (properties.unknownProvider()) {
            log.warn("AI_COACH_PROVIDER '{}' is unknown; AI Coach is disabled.", properties.provider());
        }
        return switch (properties.providerType()) {
            case DISABLED -> new DisabledAiCoachProvider();
            case FIXTURE -> {
                log.info("AI Coach uses the fixture provider (deterministic answers, no network).");
                yield new FixtureAiCoachProvider(jsonMapper);
            }
            case GROQ -> {
                if (!properties.groq().configured()) {
                    log.warn("AI_COACH_PROVIDER=groq but GROQ_API_KEY or GROQ_MODEL is missing; AI Coach is disabled.");
                    yield new DisabledAiCoachProvider();
                }
                log.info("AI Coach uses Groq (model={}, outputMode={}).", properties.groq().model(),
                        properties.groq().outputMode());
                yield new GroqAiCoachProvider(properties.groq(), jsonMapper);
            }
        };
    }
}
