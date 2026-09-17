package com.dayflow.api.ai;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * A fact a Coach answer is based on: an evidence key and the label DayFlow computed for it (the label already holds
 * the numbers). Used by the Recovery and Planning Coaches.
 */
public record CoachFact(
        @Schema(requiredMode = REQUIRED, example = "HISTORY_D1") String key,
        @Schema(requiredMode = REQUIRED, example = "'보고서 초안' 전에 2번 다시 정리함") String label) {
}
