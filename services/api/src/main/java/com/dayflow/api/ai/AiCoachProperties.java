package com.dayflow.api.ai;

import java.time.Duration;
import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code dayflow.ai.*}: which AI provider the Coach uses. AI is optional: a missing or incomplete configuration never
 * stops the server, it only makes the Coach report AI_COACH_UNAVAILABLE (see {@link AiProviderConfiguration}).
 */
@ConfigurationProperties("dayflow.ai")
public record AiCoachProperties(String provider, Groq groq) {

    public enum ProviderType {
        DISABLED,
        GROQ,
        /** Deterministic answers for tests and local UI work; refused by the prod profile. */
        FIXTURE
    }

    /** How the answer is constrained (Groq Structured Outputs, depending on what the model supports). */
    public enum OutputMode {
        /** json_schema with strict: true (constrained decoding). */
        STRICT,
        /** json_schema with strict: false (best effort, may fail with 400). */
        BEST_EFFORT,
        /** json_object mode; the schema is only enforced by DayFlow's validation. */
        JSON_OBJECT
    }

    public AiCoachProperties {
        groq = groq == null ? new Groq(null, null, null, null, null, null, null, null) : groq;
    }

    public ProviderType providerType() {
        if (provider == null || provider.isBlank()) {
            return ProviderType.DISABLED;
        }
        try {
            return ProviderType.valueOf(provider.strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            return ProviderType.DISABLED;
        }
    }

    public boolean unknownProvider() {
        return provider != null && !provider.isBlank() && providerType() == ProviderType.DISABLED
                && !"disabled".equalsIgnoreCase(provider.strip());
    }

    public record Groq(
            String apiKey,
            String model,
            String baseUrl,
            Duration connectTimeout,
            Duration readTimeout,
            Integer maxCompletionTokens,
            OutputMode outputMode,
            String reasoningEffort) {

        /** The single place of the Groq OpenAI-compatible endpoint; GROQ_BASE_URL overrides it (tests). */
        public static final String DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

        public Groq {
            apiKey = blankToNull(apiKey);
            model = blankToNull(model);
            baseUrl = baseUrl == null || baseUrl.isBlank() ? DEFAULT_BASE_URL : stripTrailingSlash(baseUrl.strip());
            connectTimeout = connectTimeout == null ? Duration.ofSeconds(5) : connectTimeout;
            readTimeout = readTimeout == null ? Duration.ofSeconds(30) : readTimeout;
            maxCompletionTokens = maxCompletionTokens == null ? 1500 : maxCompletionTokens;
            outputMode = outputMode == null ? OutputMode.STRICT : outputMode;
            reasoningEffort = blankToNull(reasoningEffort);
        }

        public boolean configured() {
            return apiKey != null && model != null;
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static String stripTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
