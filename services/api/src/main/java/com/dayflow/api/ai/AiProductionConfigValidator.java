package com.dayflow.api.ai;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * The prod profile refuses the fixture provider: fixed test answers must never reach real users. A missing Groq key
 * is not an error here; the Coach is then simply unavailable.
 */
@Component
@Profile("prod")
public class AiProductionConfigValidator implements InitializingBean {

    private final AiCoachProperties properties;

    public AiProductionConfigValidator(AiCoachProperties properties) {
        this.properties = properties;
    }

    @Override
    public void afterPropertiesSet() {
        if (properties.providerType() == AiCoachProperties.ProviderType.FIXTURE) {
            throw new IllegalStateException("Unsafe production configuration:\n - AI_COACH_PROVIDER must not be fixture.");
        }
    }
}
