package com.dayflow.api.ai;

/** No AI configured (the default): the Coach says it is not connected, everything else works as usual. */
public class DisabledAiCoachProvider implements AiCoachProvider {

    @Override
    public String name() {
        return "disabled";
    }

    @Override
    public boolean available() {
        return false;
    }

    @Override
    public AiStructuredResult generate(AiStructuredRequest request) {
        throw new AiProviderException(AiProviderException.Kind.NOT_CONFIGURED, "No AI provider is configured.");
    }
}
