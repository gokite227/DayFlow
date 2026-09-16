package com.dayflow.api.event;

import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import java.util.List;
import java.util.Locale;

/**
 * EVT-006: Event Category colors come from a fixed palette. The first six are the colors the former
 * fixed types used (so migrated Events look the same); they are solid enough for white labels. The web
 * palette (event-category-values.ts) uses the same list.
 */
public final class EventCategoryColors {

    public static final List<String> PALETTE = List.of(
            "#66707a", // 슬레이트 (일정)
            "#d9822b", // 오렌지 (생일)
            "#3a78b8", // 블루 (면접)
            "#7453c2", // 퍼플 (시험)
            "#cf3f5c", // 레드 (마감)
            "#2a927f", // 그린 (약속)
            "#c2549a", // 핑크
            "#8a6d3b"); // 브라운

    private EventCategoryColors() {
    }

    /** Accepts any case and returns the stored lowercase form. */
    public static String normalize(String color) {
        String normalized = color == null ? "" : color.strip().toLowerCase(Locale.ROOT);
        if (!PALETTE.contains(normalized)) {
            throw new ApiException(ErrorCode.INVALID_EVENT_CATEGORY_COLOR,
                    "color must be one of the Event palette colors: " + String.join(", ", PALETTE), "color");
        }
        return normalized;
    }
}
