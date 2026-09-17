package com.dayflow.api.ai.today;

import com.dayflow.api.day.DayPriority;
import com.dayflow.api.day.DayStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * What the Today Coach knows about the current user, built by {@link TodayCoachContextService}.
 *
 * <p>{@code data} is the small JSON document sent to the model. It only uses short refs ("D1", "G1", "R1", metric
 * keys) instead of database ids, so the model never sees a UUID. The maps translate those refs back to the user's own
 * rows; a ref the model invents simply does not resolve, which is how {@link TodayCoachValidator} drops hallucinated
 * or foreign ids. The refs are internal: the validator also removes them from user-facing text.
 */
public record TodayCoachContext(
        LocalDate today,
        Map<String, Object> data,
        Map<String, DayFact> days,
        Set<String> todayDayRefs,
        Map<String, GoalFact> goals,
        Map<String, ReviewFact> reviews,
        Map<String, MetricFact> metrics,
        WorkloadFact workload) {

    /**
     * @param startTime local "HH:mm" of today's time placement, or null
     */
    public record DayFact(UUID id, String title, DayStatus status, DayPriority priority, LocalDate plannedDate,
            String goalRef, boolean core, String startTime) {

        public boolean finished() {
            return status == DayStatus.DONE || status == DayStatus.SKIPPED;
        }
    }

    public record GoalFact(UUID id, String title, LocalDate startDate, LocalDate endDate) {

        public boolean contains(LocalDate date) {
            return !date.isBefore(startDate) && !date.isAfter(endDate);
        }
    }

    public record ReviewFact(UUID id, String label) {
    }

    public record MetricFact(String label) {
    }

    /** Computed by {@link TodayWorkload}; each busy window key is also a METRIC evidence key. */
    public record WorkloadFact(long overbookedMinutes, List<BusyWindowFact> busyWindows) {

        public static final WorkloadFact NONE = new WorkloadFact(0, List.of());

        public boolean overloaded() {
            return overbookedMinutes > 0 && !busyWindows.isEmpty();
        }
    }

    /** One overbooked time range in local "HH:mm". */
    public record BusyWindowFact(String key, String start, String end, int dayCount, long availableMinutes,
            long plannedMinutes, boolean passed) {
    }

    /** Listed unfinished Days of earlier dates, most recent first (the order of the context). */
    public List<Map.Entry<String, DayFact>> unfinishedDays() {
        return days.entrySet().stream()
                .filter(entry -> entry.getValue().plannedDate() != null && entry.getValue().plannedDate().isBefore(today)
                        && !entry.getValue().finished())
                .toList();
    }
}
