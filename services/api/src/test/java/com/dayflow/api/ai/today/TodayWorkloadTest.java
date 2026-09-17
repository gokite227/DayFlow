package com.dayflow.api.ai.today;

import static org.assertj.core.api.Assertions.assertThat;

import com.dayflow.api.ai.today.TodayWorkload.Placement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Deterministic workload math of the Today Coach context (no model involved). */
class TodayWorkloadTest {

    private static Placement at(String ref, String start, String end) {
        return new Placement(ref, Instant.parse("2031-03-05T" + start + ":00Z"), Instant.parse("2031-03-05T" + end + ":00Z"));
    }

    @Test
    void sevenOneHourDaysInTheSameHourAreOverbooked() {
        List<Placement> placements = new ArrayList<>();
        for (int i = 1; i <= 7; i++) {
            placements.add(at("D" + i, "09:00", "10:00"));
        }

        TodayWorkload.Result result = TodayWorkload.calculate(placements);

        assertThat(result.scheduledDayCount()).isEqualTo(7);
        assertThat(result.totalScheduledMinutes()).isEqualTo(420);
        assertThat(result.occupiedMinutes()).isEqualTo(60);
        assertThat(result.overbookedMinutes()).isEqualTo(360);
        assertThat(result.peakConcurrentCount()).isEqualTo(7);
        assertThat(result.busyWindows()).singleElement().satisfies(window -> {
            assertThat(window.start()).isEqualTo(Instant.parse("2031-03-05T09:00:00Z"));
            assertThat(window.end()).isEqualTo(Instant.parse("2031-03-05T10:00:00Z"));
            assertThat(window.availableMinutes()).isEqualTo(60);
            assertThat(window.plannedMinutes()).isEqualTo(420);
            assertThat(window.overbookedMinutes()).isEqualTo(360);
            assertThat(window.peakConcurrentCount()).isEqualTo(7);
            assertThat(window.dayRefs()).containsExactly("D1", "D2", "D3", "D4", "D5", "D6", "D7");
        });
    }

    @Test
    void separateOrTouchingDaysAreNotOverbooked() {
        TodayWorkload.Result result = TodayWorkload.calculate(List.of(
                at("D1", "09:00", "10:00"), at("D2", "10:00", "11:00"), at("D3", "13:00", "13:30")));

        assertThat(result.totalScheduledMinutes()).isEqualTo(150);
        assertThat(result.occupiedMinutes()).isEqualTo(150);
        assertThat(result.overbookedMinutes()).isZero();
        assertThat(result.peakConcurrentCount()).isEqualTo(1);
        assertThat(result.busyWindows()).isEmpty();
    }

    @Test
    void partialOverlapCountsOnlyTheSharedTime() {
        TodayWorkload.Result result = TodayWorkload.calculate(List.of(
                at("D2", "09:30", "10:30"), at("D1", "09:00", "10:00"), at("D3", "12:00", "13:00")));

        assertThat(result.totalScheduledMinutes()).isEqualTo(180);
        assertThat(result.occupiedMinutes()).isEqualTo(150);
        assertThat(result.overbookedMinutes()).isEqualTo(30);
        assertThat(result.peakConcurrentCount()).isEqualTo(2);
        assertThat(result.busyWindows()).singleElement().satisfies(window -> {
            assertThat(window.availableMinutes()).isEqualTo(90);
            assertThat(window.plannedMinutes()).isEqualTo(120);
            assertThat(window.overbookedMinutes()).isEqualTo(30);
            assertThat(window.dayRefs()).containsExactly("D1", "D2");
        });
    }

    @Test
    void chainedOverlapsFormOneWindowWithTheRealPeak() {
        // 09–11 overlaps 10–12 overlaps 11:30–12:30; at most two run at once.
        TodayWorkload.Result result = TodayWorkload.calculate(List.of(
                at("D1", "09:00", "11:00"), at("D2", "10:00", "12:00"), at("D3", "11:30", "12:30")));

        assertThat(result.peakConcurrentCount()).isEqualTo(2);
        assertThat(result.busyWindows()).singleElement().satisfies(window -> {
            assertThat(window.availableMinutes()).isEqualTo(210);
            assertThat(window.plannedMinutes()).isEqualTo(300);
            assertThat(window.overbookedMinutes()).isEqualTo(90);
        });
    }

    @Test
    void noPlacementsMeansNoDurationAtAll() {
        TodayWorkload.Result result = TodayWorkload.calculate(List.of());
        assertThat(result.scheduledDayCount()).isZero();
        assertThat(result.totalScheduledMinutes()).isZero();
        assertThat(result.busyWindows()).isEmpty();
    }

    @Test
    void unlistedDaysStillCountButHaveNoRef() {
        TodayWorkload.Result result = TodayWorkload.calculate(List.of(at("D1", "20:00", "21:00"), at(null, "20:00", "21:00")));
        assertThat(result.overbookedMinutes()).isEqualTo(60);
        assertThat(result.busyWindows().getFirst().dayRefs()).containsExactly("D1");
        assertThat(result.busyWindows().getFirst().dayCount()).isEqualTo(2);
    }
}
