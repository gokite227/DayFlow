package com.dayflow.api.ai.review;

import com.dayflow.api.ai.today.TodayWorkload;
import com.dayflow.api.day.DayPriority;
import com.dayflow.api.day.DayStatus;
import com.dayflow.api.review.ReviewType;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * Deterministic numbers of one review period, computed from the Days as they are stored now. The model receives these
 * numbers (and labels built from them) and never counts or compares on its own.
 *
 * <p>What the data can and cannot say:
 * <ul>
 *   <li>Status is the Day's current status. DayFlow does not store when a Day was completed, so a time-of-day bucket
 *       means "Days placed in that time range", never "work done at that time".</li>
 *   <li>A bucket (time of day, weekday) is a pattern only with at least {@link #MIN_PATTERN_SAMPLE} Days; smaller
 *       groups are reported as counts but never as a pattern.</li>
 *   <li>Completion rate is done / (total − skipped), like the Review screen: let-go Days do not count against it.</li>
 * </ul>
 */
public final class ReviewMetrics {

    /** Minimum Days in a time-of-day or weekday group before it may be called a pattern. */
    public static final int MIN_PATTERN_SAMPLE = 3;

    /** Time placement start hour in the schedule's own timezone. */
    public enum TimeBucket {
        MORNING("오전(5~12시)", 5, 12),
        AFTERNOON("오후(12~18시)", 12, 18),
        EVENING("저녁(18~22시)", 18, 22),
        LATE_NIGHT("밤(22~5시)", 22, 5);

        private final String label;
        private final int fromHour;
        private final int toHour;

        TimeBucket(String label, int fromHour, int toHour) {
            this.label = label;
            this.fromHour = fromHour;
            this.toHour = toHour;
        }

        public String label() {
            return label;
        }

        static TimeBucket of(LocalTime time) {
            int hour = time.getHour();
            for (TimeBucket bucket : values()) {
                boolean inside = bucket.fromHour < bucket.toHour
                        ? hour >= bucket.fromHour && hour < bucket.toHour
                        : hour >= bucket.fromHour || hour < bucket.toHour;
                if (inside) {
                    return bucket;
                }
            }
            return LATE_NIGHT;
        }
    }

    /** One Day of the period with its optional time placement. */
    public record DayInput(UUID id, String title, DayStatus status, DayPriority priority, boolean core, UUID goalId,
            LocalDate plannedDate, boolean carriedIn, Instant startAt, Instant endAt, ZoneId scheduleZone) {

        boolean scheduled() {
            return startAt != null && endAt != null && endAt.isAfter(startAt);
        }

        long scheduledMinutes() {
            return scheduled() ? Duration.between(startAt, endAt).toMinutes() : 0;
        }

        TimeBucket timeBucket() {
            return scheduled() ? TimeBucket.of(startAt.atZone(scheduleZone).toLocalTime()) : null;
        }

        boolean done() {
            return status == DayStatus.DONE;
        }

        boolean skipped() {
            return status == DayStatus.SKIPPED;
        }
    }

    public record Counts(int total, int done, int skipped, int open) {

        static Counts of(List<DayInput> days) {
            int done = (int) days.stream().filter(DayInput::done).count();
            int skipped = (int) days.stream().filter(DayInput::skipped).count();
            return new Counts(days.size(), done, skipped, days.size() - done - skipped);
        }

        /** done / (total − skipped), or null when nothing is left to count. */
        public Double completionRate() {
            int counted = total - skipped;
            return counted > 0 ? (double) done / counted : null;
        }

        public boolean enoughForPattern() {
            return total - skipped >= MIN_PATTERN_SAMPLE;
        }
    }

    /** An overbooked time range on one date (see {@link TodayWorkload}). */
    public record DatedWindow(LocalDate date, Instant start, Instant end, int dayCount, long availableMinutes,
            long plannedMinutes) {
    }

    public record ScheduleSummary(int scheduled, int unscheduled, long totalMinutes, long completedMinutes,
            long overbookedMinutes, int overloadedDates, int peakConcurrent, List<DatedWindow> windows,
            Counts scheduledCounts, Counts unscheduledCounts) {
    }

    /** One row of the period breakdown (a date, a week chunk, a month). */
    public record Slice(String label, LocalDate start, LocalDate end, Counts counts) {
    }

    public record Result(Counts all, Counts core, Map<DayPriority, Counts> byPriority, ScheduleSummary schedule,
            Map<TimeBucket, Counts> timeOfDay, Map<DayOfWeek, Counts> weekdays, List<Slice> breakdown, int carriedIn) {

        public boolean anyTimePattern() {
            return timeOfDay.values().stream().anyMatch(Counts::enoughForPattern);
        }
    }

    private ReviewMetrics() {
    }

    public static Result analyze(ReviewType type, LocalDate start, LocalDate end, List<DayInput> input) {
        List<DayInput> days = input.stream()
                .filter(day -> day.plannedDate() != null && !day.plannedDate().isBefore(start) && !day.plannedDate().isAfter(end))
                .toList();

        Map<DayPriority, Counts> byPriority = new EnumMap<>(DayPriority.class);
        for (DayPriority priority : DayPriority.values()) {
            byPriority.put(priority, Counts.of(filter(days, day -> day.priority() == priority)));
        }

        Map<TimeBucket, Counts> timeOfDay = new EnumMap<>(TimeBucket.class);
        for (TimeBucket bucket : TimeBucket.values()) {
            timeOfDay.put(bucket, Counts.of(filter(days, day -> day.timeBucket() == bucket)));
        }

        Map<DayOfWeek, Counts> weekdays = new EnumMap<>(DayOfWeek.class);
        for (DayOfWeek weekday : DayOfWeek.values()) {
            weekdays.put(weekday, Counts.of(filter(days, day -> day.plannedDate().getDayOfWeek() == weekday)));
        }

        return new Result(Counts.of(days), Counts.of(filter(days, DayInput::core)), byPriority, schedule(days),
                timeOfDay, weekdays, breakdown(type, start, end, days),
                (int) days.stream().filter(DayInput::carriedIn).count());
    }

    private static ScheduleSummary schedule(List<DayInput> days) {
        List<DayInput> scheduled = filter(days, DayInput::scheduled);
        List<DayInput> unscheduled = filter(days, day -> !day.scheduled());
        long total = scheduled.stream().mapToLong(DayInput::scheduledMinutes).sum();
        long completed = scheduled.stream().filter(DayInput::done).mapToLong(DayInput::scheduledMinutes).sum();

        // Planned conflicts per date. Let-go Days are not part of the plan any more.
        Map<LocalDate, List<DayInput>> byDate = scheduled.stream().filter(day -> !day.skipped())
                .collect(Collectors.groupingBy(DayInput::plannedDate, TreeMap::new, Collectors.toList()));
        long overbooked = 0;
        int overloadedDates = 0;
        int peak = 0;
        List<DatedWindow> windows = new ArrayList<>();
        for (Map.Entry<LocalDate, List<DayInput>> entry : byDate.entrySet()) {
            TodayWorkload.Result workload = TodayWorkload.calculate(entry.getValue().stream()
                    .map(day -> new TodayWorkload.Placement(null, day.startAt(), day.endAt())).toList());
            overbooked += workload.overbookedMinutes();
            peak = Math.max(peak, workload.peakConcurrentCount());
            if (workload.overbookedMinutes() > 0) {
                overloadedDates++;
            }
            workload.busyWindows().forEach(window -> windows.add(new DatedWindow(entry.getKey(), window.start(),
                    window.end(), window.dayCount(), window.availableMinutes(), window.plannedMinutes())));
        }
        return new ScheduleSummary(scheduled.size(), unscheduled.size(), total, completed, overbooked, overloadedDates,
                peak, windows, Counts.of(scheduled), Counts.of(unscheduled));
    }

    /** DAY: none. WEEK: per date. MONTH: 7-day chunks. QUARTER and YEAR: per month. */
    private static List<Slice> breakdown(ReviewType type, LocalDate start, LocalDate end, List<DayInput> days) {
        List<Slice> slices = new ArrayList<>();
        switch (type) {
            case DAY -> {
            }
            case WEEK -> {
                for (LocalDate date = start; !date.isAfter(end); date = date.plusDays(1)) {
                    LocalDate current = date;
                    slices.add(new Slice(date.getMonthValue() + "/" + date.getDayOfMonth(), date, date,
                            Counts.of(filter(days, day -> day.plannedDate().equals(current)))));
                }
            }
            case MONTH -> {
                int week = 1;
                for (LocalDate chunk = start; !chunk.isAfter(end); chunk = chunk.plusDays(7), week++) {
                    LocalDate chunkEnd = chunk.plusDays(6).isAfter(end) ? end : chunk.plusDays(6);
                    slices.add(slice(week + "주차", chunk, chunkEnd, days));
                }
            }
            case QUARTER, YEAR -> {
                for (LocalDate month = start; !month.isAfter(end); month = month.plusMonths(1)) {
                    slices.add(slice(month.getMonthValue() + "월", month, month.plusMonths(1).minusDays(1), days));
                }
            }
        }
        return slices;
    }

    private static Slice slice(String label, LocalDate from, LocalDate to, List<DayInput> days) {
        return new Slice(label, from, to, Counts.of(filter(days,
                day -> !day.plannedDate().isBefore(from) && !day.plannedDate().isAfter(to))));
    }

    /** The first date of the period right before the one starting at {@code start}. */
    public static LocalDate previousStart(ReviewType type, LocalDate start) {
        return switch (type) {
            case DAY -> start.minusDays(1);
            case WEEK -> start.minusDays(7);
            case MONTH -> start.minusMonths(1);
            case QUARTER -> start.minusMonths(3);
            case YEAR -> start.minusYears(1);
        };
    }

    public static long daysInPeriod(LocalDate start, LocalDate end) {
        return ChronoUnit.DAYS.between(start, end) + 1;
    }

    private static List<DayInput> filter(List<DayInput> days, Predicate<DayInput> predicate) {
        return days.stream().filter(predicate).toList();
    }
}
