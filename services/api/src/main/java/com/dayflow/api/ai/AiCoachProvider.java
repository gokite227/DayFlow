package com.dayflow.api.ai;

/**
 * One AI backend for every Coach (Today now; Recovery and Review later). It only turns instructions, a JSON data
 * block and an output schema into JSON. It never reads or writes DayFlow data, and its output is untrusted: each
 * Coach validates it against the user's own data before anything reaches a client.
 */
public interface AiCoachProvider {

    /** "groq", "disabled", "fixture": for logs only. */
    String name();

    /** False when no usable provider is configured; callers answer AI_COACH_UNAVAILABLE without calling it. */
    boolean available();

    /**
     * @throws AiProviderException for every failure (not configured, rate limited, timeout, upstream error, output
     *                             that is not a JSON object). Never retries on its own.
     */
    AiStructuredResult generate(AiStructuredRequest request);
}
