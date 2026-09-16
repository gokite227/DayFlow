package com.dayflow.api.day;

import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * DAY-005: Tag colors come from the DayFlow palette instead of free hex input, so tags stay
 * readable on the pink/lavender surfaces. The web palette (day-tag-values.ts) uses the same list.
 */
public final class DayTagColors {

    public static final List<String> PALETTE = List.of(
            "#ee749d", // 핑크
            "#c78be7", // 라벤더
            "#8aa6ee", // 블루
            "#5fb7a5", // 민트
            "#7fb469", // 그린
            "#f0a45c", // 살구
            "#d7ae3c", // 머스터드
            "#9a8fa6"); // 그레이

    private static final Set<String> ALLOWED = new LinkedHashSet<>(PALETTE);

    private DayTagColors() {
    }

    /** Accepts any case and returns the stored lowercase form. */
    public static String normalize(String color) {
        String normalized = color == null ? "" : color.strip().toLowerCase(Locale.ROOT);
        if (!ALLOWED.contains(normalized)) {
            throw new ApiException(ErrorCode.INVALID_DAY_TAG_COLOR,
                    "color must be one of the DayFlow palette colors: " + String.join(", ", PALETTE), "color");
        }
        return normalized;
    }
}
