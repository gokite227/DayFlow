package com.dayflow.api.ai;

import com.dayflow.api.ai.AiProviderException.Kind;
import java.io.IOException;
import java.io.InputStream;
import java.net.SocketTimeoutException;
import java.net.http.HttpClient;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Groq Chat Completions (OpenAI-compatible) with Structured Outputs. Plain Spring {@link RestClient}; no SDK.
 *
 * <p>Privacy: the prompt, the user data, the model's raw answer and the API key are never logged. A call logs only a
 * request id, provider, task, model, HTTP status, latency, outcome and token counts. The model's reasoning text, if
 * any, is ignored.
 *
 * <p>No retries: a 429 is reported with Retry-After and the user decides when to ask again, so one tap costs at most one
 * provider request.
 */
public class GroqAiCoachProvider implements AiCoachProvider {

    private static final Logger log = LoggerFactory.getLogger(GroqAiCoachProvider.class);

    private final AiCoachProperties.Groq settings;
    private final JsonMapper jsonMapper;
    private final RestClient restClient;

    public GroqAiCoachProvider(AiCoachProperties.Groq settings, JsonMapper jsonMapper) {
        this.settings = settings;
        this.jsonMapper = jsonMapper;
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(settings.connectTimeout()).build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(settings.readTimeout());
        this.restClient = RestClient.builder().baseUrl(settings.baseUrl()).requestFactory(requestFactory).build();
    }

    @Override
    public String name() {
        return "groq";
    }

    @Override
    public boolean available() {
        return settings.configured();
    }

    @Override
    public AiStructuredResult generate(AiStructuredRequest request) {
        if (!settings.configured()) {
            throw new AiProviderException(Kind.NOT_CONFIGURED, "GROQ_API_KEY or GROQ_MODEL is not set.");
        }
        String requestId = UUID.randomUUID().toString().substring(0, 8);
        long started = System.nanoTime();
        String body = jsonMapper.writeValueAsString(requestBody(request));
        try {
            AiStructuredResult result = restClient.post()
                    .uri("/chat/completions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + settings.apiKey())
                    .body(body)
                    .exchange((clientRequest, response) -> {
                        int status = response.getStatusCode().value();
                        String text = read(response.getBody());
                        if (status == 429) {
                            Duration retryAfter = parseRetryAfter(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER));
                            logCall(requestId, request.task(), status, started, "rate_limited", null);
                            throw new AiProviderException(Kind.RATE_LIMITED, "Groq rate limit reached.", retryAfter);
                        }
                        if (status < 200 || status >= 300) {
                            logCall(requestId, request.task(), status, started, "http_error", null);
                            throw new AiProviderException(Kind.UPSTREAM_ERROR, "Groq answered HTTP " + status + ".");
                        }
                        AiStructuredResult parsed = parse(text);
                        logCall(requestId, request.task(), status, started, "ok", parsed);
                        return parsed;
                    });
            return result;
        } catch (AiProviderException known) {
            throw known;
        } catch (ResourceAccessException io) {
            boolean timeout = isTimeout(io);
            logCall(requestId, request.task(), 0, started, timeout ? "timeout" : "network_error", null);
            throw new AiProviderException(timeout ? Kind.TIMEOUT : Kind.UPSTREAM_ERROR,
                    timeout ? "Groq did not answer in time." : "Groq could not be reached.");
        } catch (RuntimeException unexpected) {
            logCall(requestId, request.task(), 0, started, "client_error", null);
            throw new AiProviderException(Kind.UPSTREAM_ERROR, "Groq request failed.");
        }
    }

    /** OpenAI-compatible body. The system message holds DayFlow's instructions; the user message holds only data. */
    Map<String, Object> requestBody(AiStructuredRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", settings.model());
        body.put("messages", List.of(
                Map.of("role", "system", "content", request.instructions()),
                Map.of("role", "user", "content", request.dataJson())));
        body.put("temperature", 0.3);
        body.put("max_completion_tokens", settings.maxCompletionTokens());
        if (settings.reasoningEffort() != null) {
            body.put("reasoning_effort", settings.reasoningEffort());
        }
        body.put("response_format", switch (settings.outputMode()) {
            case STRICT, BEST_EFFORT -> Map.of("type", "json_schema", "json_schema", Map.of(
                    "name", request.schemaName(),
                    "strict", settings.outputMode() == AiCoachProperties.OutputMode.STRICT,
                    "schema", request.outputSchema()));
            case JSON_OBJECT -> Map.of("type", "json_object");
        });
        return body;
    }

    AiStructuredResult parse(String text) {
        JsonNode root;
        try {
            root = jsonMapper.readTree(text);
        } catch (JacksonException malformed) {
            throw new AiProviderException(Kind.INVALID_OUTPUT, "Groq response is not JSON.");
        }
        JsonNode choice = root.path("choices").path(0);
        if (!"stop".equals(choice.path("finish_reason").asString(""))) {
            // "length": the answer was cut off by max_completion_tokens and cannot be trusted as complete JSON.
            throw new AiProviderException(Kind.INVALID_OUTPUT, "Groq answer did not finish normally.");
        }
        JsonNode content = choice.path("message").path("content");
        if (!content.isString() || content.asString().isBlank()) {
            throw new AiProviderException(Kind.INVALID_OUTPUT, "Groq answer has no content.");
        }
        JsonNode output;
        try {
            output = jsonMapper.readTree(content.asString());
        } catch (JacksonException malformed) {
            throw new AiProviderException(Kind.INVALID_OUTPUT, "Groq answer is not valid JSON.");
        }
        if (output == null || !output.isObject()) {
            throw new AiProviderException(Kind.INVALID_OUTPUT, "Groq answer is not a JSON object.");
        }
        JsonNode usage = root.path("usage");
        return new AiStructuredResult(output, root.path("model").asString(settings.model()),
                usage.path("prompt_tokens").isNumber() ? usage.path("prompt_tokens").asLong() : null,
                usage.path("completion_tokens").isNumber() ? usage.path("completion_tokens").asLong() : null);
    }

    static Duration parseRetryAfter(String header) {
        if (header == null || header.isBlank()) {
            return null;
        }
        try {
            double seconds = Double.parseDouble(header.strip());
            return seconds > 0 ? Duration.ofSeconds((long) Math.ceil(seconds)) : null;
        } catch (NumberFormatException notSeconds) {
            return null;
        }
    }

    private static boolean isTimeout(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof HttpTimeoutException || cause instanceof SocketTimeoutException) {
                return true;
            }
        }
        return false;
    }

    private static String read(InputStream body) throws IOException {
        return body == null ? "" : new String(body.readAllBytes(), StandardCharsets.UTF_8);
    }

    private void logCall(String requestId, String task, int status, long started, String outcome, AiStructuredResult result) {
        long latencyMs = (System.nanoTime() - started) / 1_000_000;
        log.info("ai.coach request={} provider=groq task={} model={} status={} latencyMs={} outcome={} promptTokens={} completionTokens={}",
                requestId, task, settings.model(), status, latencyMs, outcome,
                result == null ? null : result.promptTokens(), result == null ? null : result.completionTokens());
    }
}
