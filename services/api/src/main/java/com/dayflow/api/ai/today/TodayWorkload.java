package com.dayflow.api.ai.today;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Deterministic time math of today's plan, so the model never has to add or compare durations itself.
 *
 * <p>Input is the time placement (DaySchedule start/end) of today's unfinished Days. A Day without a schedule has no
 * duration here: nothing is estimated from its title.
 *
 * <ul>
 *   <li>{@code totalScheduledMinutes}: sum of all placements (what the plan asks for)</li>
 *   <li>{@code occupiedMinutes}: length of the union of placements (the clock time they cover)</li>
 *   <li>{@code overbookedMinutes}: total − occupied, i.e. time that would have to happen in parallel</li>
 *   <li>{@code peakConcurrentCount}: most placements running at the same moment</li>
 *   <li>busy windows: groups of placements that overlap each other (touching end/start is not an overlap)</li>
 * </ul>
 *
 * Example: seven Days at 09:00–10:00 → total 420, occupied 60, overbooked 360, peak 7, one window 09:00–10:00.
 */
public final class TodayWorkload {

    /** One scheduled, unfinished Day. {@code ref} is the model-facing ref, or null when the Day is not listed. */
    public record Placement(String ref, Instant start, Instant end) {

        long minutes() {
            return Math.max(0, Duration.between(start, end).toMinutes());
        }
    }

    /**
     * Overlapping placements. {@code availableMinutes} is the clock time of the window, {@code plannedMinutes} the sum
     * of the Days in it.
     */
    public record BusyWindow(Instant start, Instant end, long availableMinutes, long plannedMinutes,
            long overbookedMinutes, int peakConcurrentCount, List<String> dayRefs, int dayCount) {
    }

    public record Result(int scheduledDayCount, long totalScheduledMinutes, long occupiedMinutes,
            long overbookedMinutes, int peakConcurrentCount, List<BusyWindow> busyWindows) {
    }

    private TodayWorkload() {
    }

    public static Result calculate(List<Placement> input) {
        List<Placement> placements = input.stream()
                .filter(placement -> placement.end().isAfter(placement.start()))
                .sorted(Comparator.comparing(Placement::start).thenComparing(Placement::end))
                .toList();

        long total = placements.stream().mapToLong(Placement::minutes).sum();
        long occupied = 0;
        int peak = 0;
        List<BusyWindow> windows = new ArrayList<>();

        // Group placements whose time ranges overlap (start strictly before the group's current end).
        int index = 0;
        while (index < placements.size()) {
            List<Placement> group = new ArrayList<>();
            Instant groupEnd = placements.get(index).end();
            group.add(placements.get(index));
            index++;
            while (index < placements.size() && placements.get(index).start().isBefore(groupEnd)) {
                Placement next = placements.get(index);
                group.add(next);
                if (next.end().isAfter(groupEnd)) {
                    groupEnd = next.end();
                }
                index++;
            }
            Instant groupStart = group.getFirst().start();
            long available = Duration.between(groupStart, groupEnd).toMinutes();
            long planned = group.stream().mapToLong(Placement::minutes).sum();
            int groupPeak = peakConcurrent(group);
            occupied += available;
            peak = Math.max(peak, groupPeak);
            if (group.size() > 1 && planned > available) {
                windows.add(new BusyWindow(groupStart, groupEnd, available, planned, planned - available, groupPeak,
                        group.stream().map(Placement::ref).filter(ref -> ref != null).toList(), group.size()));
            }
        }
        return new Result(placements.size(), total, occupied, total - occupied, peak, windows);
    }

    /** Sweep line: +1 at each start, −1 at each end; an end at the same instant as a start is processed first. */
    private static int peakConcurrent(List<Placement> placements) {
        record Edge(Instant at, int delta) {
        }
        List<Edge> edges = new ArrayList<>();
        for (Placement placement : placements) {
            edges.add(new Edge(placement.start(), 1));
            edges.add(new Edge(placement.end(), -1));
        }
        edges.sort(Comparator.comparing(Edge::at).thenComparingInt(Edge::delta));
        int current = 0;
        int peak = 0;
        for (Edge edge : edges) {
            current += edge.delta();
            peak = Math.max(peak, current);
        }
        return peak;
    }
}
