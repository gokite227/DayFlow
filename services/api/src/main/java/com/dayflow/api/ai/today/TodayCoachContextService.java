package com.dayflow.api.ai.today;

import com.dayflow.api.ai.CoachText;
import com.dayflow.api.ai.today.TodayCoachContext.DayFact;
import com.dayflow.api.ai.today.TodayCoachContext.GoalFact;
import com.dayflow.api.ai.today.TodayCoachContext.MetricFact;
import com.dayflow.api.ai.today.TodayCoachContext.ReviewFact;
import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.day.Day;
import com.dayflow.api.day.DayRepository;
import com.dayflow.api.day.DaySchedule;
import com.dayflow.api.day.DayScheduleRepository;
import com.dayflow.api.day.DayStatus;
import com.dayflow.api.goal.Goal;
import com.dayflow.api.goal.GoalRepository;
import com.dayflow.api.recovery.RecoveryService;
import com.dayflow.api.review.Review;
import com.dayflow.api.review.ReviewItem;
import com.dayflow.api.review.ReviewItemKind;
import com.dayflow.api.review.ReviewRepository;
import com.dayflow.api.review.ReviewType;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the small, current-user-only context of the Today Coach in one read-only transaction. The transaction ends
 * before the provider is called (see {@link TodayCoachService}).
 *
 * <p>Data minimization: no email, name, user id, token, Focus data or Event text; only Day/Goal titles, statuses and
 * dates, aggregates, and a few recent KPT lines. Every list has a code-level limit below.
 */
@Service
public class TodayCoachContextService {

    static final int MAX_TODAY_DAYS = 12;
    static final int MAX_UNFINISHED_DAYS = 8;
    static final int UNFINISHED_LOOKBACK_DAYS = 14;
    static final int UPCOMING_DAYS = 3;
    static final int RECENT_DAYS = 7;
    static final int MAX_GOALS = 8;
    static final int MAX_REVIEW_ITEMS = 6;
    static final int DAY_REVIEW_LOOKBACK_DAYS = 7;
    static final int WEEK_REVIEW_LOOKBACK_DAYS = 14;
    static final int MAX_TITLE_LENGTH = 80;
    static final int MAX_REVIEW_TEXT_LENGTH = 120;

    private static final Set<DayStatus> OPEN = Set.of(DayStatus.NOT_STARTED, DayStatus.IN_PROGRESS, DayStatus.DEFERRED);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    private final DayRepository days;
    private final DayScheduleRepository schedules;
    private final GoalRepository goals;
    private final ReviewRepository reviews;
    private final RecoveryService recoveryService;
    private final CurrentUser currentUser;

    public TodayCoachContextService(DayRepository days, DayScheduleRepository schedules, GoalRepository goals,
            ReviewRepository reviews, RecoveryService recoveryService, CurrentUser currentUser) {
        this.days = days;
        this.schedules = schedules;
        this.goals = goals;
        this.reviews = reviews;
        this.recoveryService = recoveryService;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public TodayCoachContext build(LocalDate today, ZoneId zone, Instant now) {
        UUID userId = currentUser.id();
        List<Day> window = days.findByUserIdAndPlannedDateBetween(userId, today.minusDays(UNFINISHED_LOOKBACK_DAYS),
                today.plusDays(UPCOMING_DAYS));
        // Missed Days the user has not handled in Recovery yet (same rule as the Recovery screen).
        Set<UUID> recoveryCandidates = recoveryService.candidates(today, now).stream()
                .map(candidate -> candidate.day().id()).collect(Collectors.toSet());

        // Today's Days: unfinished first, then core, priority and start time.
        List<Day> todayAll = window.stream().filter(day -> today.equals(day.getPlannedDate())).toList();
        // Time placements of today and the upcoming days (one query).
        Map<UUID, DaySchedule> scheduleByDay = schedules.findByDayIdIn(window.stream()
                        .filter(day -> !day.getPlannedDate().isBefore(today)).map(Day::getId).toList())
                .stream().collect(Collectors.toMap(DaySchedule::getDayId, Function.identity()));
        List<Day> todayDays = todayAll.stream()
                .sorted(Comparator.comparing((Day day) -> finished(day))
                        .thenComparing(Day::isCoreDay, Comparator.reverseOrder())
                        .thenComparing(day -> day.getPriority().level(), Comparator.reverseOrder())
                        .thenComparing(day -> scheduleByDay.containsKey(day.getId())
                                ? scheduleByDay.get(day.getId()).getStartAt() : Instant.MAX)
                        .thenComparing(Day::getTitle))
                .limit(MAX_TODAY_DAYS).toList();

        // Recent unfinished Days (before today), newest first.
        List<Day> unfinishedAll = window.stream()
                .filter(day -> day.getPlannedDate().isBefore(today) && OPEN.contains(day.getStatus())).toList();
        List<Day> unfinished = unfinishedAll.stream()
                .sorted(Comparator.comparing(Day::getPlannedDate, Comparator.reverseOrder())
                        .thenComparing(Day::isCoreDay, Comparator.reverseOrder())
                        .thenComparing(day -> day.getPriority().level(), Comparator.reverseOrder())
                        .thenComparing(Day::getTitle))
                .limit(MAX_UNFINISHED_DAYS).toList();

        // Goals: those active today (Calendar and Period, Day-holding ones first), then the Goals of listed Days.
        List<Goal> activeAll = goals
                .findByUserIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAscCreatedAtAsc(
                        userId, today, today);
        List<Goal> goalList = new ArrayList<>(activeAll.stream()
                .sorted(Comparator.comparing((Goal goal) -> !goal.acceptsDays()))
                .limit(MAX_GOALS).toList());
        Set<UUID> dayGoalIds = new LinkedHashSet<>();
        todayDays.forEach(day -> addIfPresent(dayGoalIds, day.getGoalId()));
        unfinished.forEach(day -> addIfPresent(dayGoalIds, day.getGoalId()));
        goalList.forEach(goal -> dayGoalIds.remove(goal.getId()));
        if (!dayGoalIds.isEmpty()) {
            goalList.addAll(goals.findByUserIdAndIdIn(userId, dayGoalIds));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("today", today.toString());
        data.put("weekday", today.getDayOfWeek().toString());
        data.put("nowLocalTime", TIME.format(now.atZone(zone)));

        Map<UUID, String> goalRefs = new HashMap<>();
        Map<String, GoalFact> goalFacts = new LinkedHashMap<>();
        List<Map<String, Object>> goalData = new ArrayList<>();
        for (Goal goal : goalList) {
            String ref = "G" + (goalFacts.size() + 1);
            String title = clip(goal.getTitle(), MAX_TITLE_LENGTH);
            goalRefs.put(goal.getId(), ref);
            goalFacts.put(ref, new GoalFact(goal.getId(), title, goal.getStartDate(), goal.getEndDate()));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("ref", ref);
            item.put("title", title);
            item.put("kind", goal.getKind().name());
            item.put("type", goal.getType() == null ? null : goal.getType().name());
            item.put("startDate", goal.getStartDate().toString());
            item.put("endDate", goal.getEndDate().toString());
            item.put("activeToday", goal.contains(today));
            // Days until the Goal period ends (0 = ends today); only meaningful for active Goals.
            item.put("daysLeft", goal.contains(today) ? ChronoUnit.DAYS.between(today, goal.getEndDate()) : null);
            if (goal.acceptsDays()) {
                List<Day> linked = days.findByGoalIdOrderByPlannedDateAscCreatedAtAsc(goal.getId());
                item.put("linkedDaysDone", linked.stream().filter(day -> day.getStatus() == DayStatus.DONE).count());
                item.put("linkedDaysTotal", linked.size());
            }
            goalData.add(item);
        }
        data.put("goals", goalData);

        Map<String, DayFact> dayFacts = new LinkedHashMap<>();
        Set<String> todayRefs = new LinkedHashSet<>();
        Map<UUID, String> todayRefById = new HashMap<>();
        List<Map<String, Object>> todayData = new ArrayList<>();
        for (Day day : todayDays) {
            DaySchedule schedule = scheduleByDay.get(day.getId());
            String ref = addDay(dayFacts, day, goalRefs, schedule, zone);
            todayRefs.add(ref);
            todayRefById.put(day.getId(), ref);
            Map<String, Object> item = dayData(ref, day, goalRefs);
            item.put("completed", finished(day));
            item.put("dateOnly", schedule == null);
            item.put("startTime", schedule == null ? null : TIME.format(schedule.getStartAt().atZone(zone)));
            item.put("endTime", schedule == null ? null : TIME.format(schedule.getEndAt().atZone(zone)));
            // Only a time placement gives a duration; a Day without one has none (never estimated from its title).
            item.put("scheduledMinutes", schedule == null ? null : minutes(schedule));
            item.put("timePassed", schedule != null && !finished(day) && schedule.getEndAt().isBefore(now));
            todayData.add(item);
        }
        data.put("todayDays", todayData);

        Set<UUID> todayGoalIds = todayAll.stream().filter(day -> !finished(day)).map(Day::getGoalId)
                .filter(goalId -> goalId != null).collect(Collectors.toSet());
        List<Map<String, Object>> unfinishedData = new ArrayList<>();
        for (Day day : unfinished) {
            String ref = addDay(dayFacts, day, goalRefs, null, zone);
            long daysOverdue = ChronoUnit.DAYS.between(day.getPlannedDate(), today);
            Map<String, Object> item = dayData(ref, day, goalRefs);
            item.put("plannedDate", day.getPlannedDate().toString());
            item.put("daysOverdue", daysOverdue);
            item.put("fromYesterday", daysOverdue == 1);
            item.put("sameGoalAsTodayDay", day.getGoalId() != null && todayGoalIds.contains(day.getGoalId()));
            item.put("recoveryCandidate", recoveryCandidates.contains(day.getId()));
            unfinishedData.add(item);
        }
        data.put("unfinishedDays", unfinishedData);
        long yesterdayUnfinished = unfinishedAll.stream()
                .filter(day -> day.getPlannedDate().equals(today.minusDays(1))).count();
        Map<String, Object> unfinishedSummary = new LinkedHashMap<>();
        unfinishedSummary.put("count", unfinishedAll.size());
        unfinishedSummary.put("fromYesterday", yesterdayUnfinished);
        unfinishedSummary.put("oldestDaysOverdue", unfinishedAll.stream()
                .mapToLong(day -> ChronoUnit.DAYS.between(day.getPlannedDate(), today)).max().orElse(0));
        unfinishedSummary.put("recoveryCandidates", unfinishedAll.stream()
                .filter(day -> recoveryCandidates.contains(day.getId())).count());
        unfinishedSummary.put("mustBeAddressed", !unfinishedAll.isEmpty());
        data.put("unfinishedSummary", unfinishedSummary);

        // Workload of today's unfinished, scheduled Days, computed here instead of by the model.
        List<TodayWorkload.Placement> placements = todayAll.stream()
                .filter(day -> !finished(day) && scheduleByDay.containsKey(day.getId()))
                .map(day -> new TodayWorkload.Placement(todayRefById.get(day.getId()),
                        scheduleByDay.get(day.getId()).getStartAt(), scheduleByDay.get(day.getId()).getEndAt()))
                .toList();
        TodayWorkload.Result workload = TodayWorkload.calculate(placements);
        List<Map<String, Object>> busyWindowData = new ArrayList<>();
        List<TodayCoachContext.BusyWindowFact> busyWindowFacts = new ArrayList<>();
        Map<String, String> busyWindowLabels = new LinkedHashMap<>();
        for (TodayWorkload.BusyWindow busy : workload.busyWindows()) {
            String key = "busyWindow" + (busyWindowFacts.size() + 1);
            String start = TIME.format(busy.start().atZone(zone));
            String end = TIME.format(busy.end().atZone(zone));
            busyWindowFacts.add(new TodayCoachContext.BusyWindowFact(key, start, end, busy.dayCount(),
                    busy.availableMinutes(), busy.plannedMinutes(), busy.end().isBefore(now)));
            busyWindowLabels.put(key, start + "~" + end + " Day " + busy.dayCount() + "개 겹침 · 가능 "
                    + durationLabel(busy.availableMinutes()) + " / 계획 " + durationLabel(busy.plannedMinutes()));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("key", key);
            item.put("start", start);
            item.put("end", end);
            item.put("availableMinutes", busy.availableMinutes());
            item.put("plannedMinutes", busy.plannedMinutes());
            item.put("overbookedMinutes", busy.overbookedMinutes());
            item.put("peakConcurrentCount", busy.peakConcurrentCount());
            item.put("dayCount", busy.dayCount());
            item.put("dayRefs", busy.dayRefs());
            item.put("passed", busy.end().isBefore(now));
            busyWindowData.add(item);
        }
        Map<String, Object> workloadData = new LinkedHashMap<>();
        workloadData.put("scheduledDayCount", workload.scheduledDayCount());
        workloadData.put("unscheduledOpenDayCount", todayAll.stream()
                .filter(day -> !finished(day) && !scheduleByDay.containsKey(day.getId())).count());
        workloadData.put("totalScheduledMinutes", workload.totalScheduledMinutes());
        workloadData.put("occupiedMinutes", workload.occupiedMinutes());
        workloadData.put("overbookedMinutes", workload.overbookedMinutes());
        workloadData.put("peakConcurrentCount", workload.peakConcurrentCount());
        workloadData.put("overloaded", workload.overbookedMinutes() > 0);
        workloadData.put("busyWindows", busyWindowData);
        data.put("workload", workloadData);

        List<Map<String, Object>> upcoming = new ArrayList<>();
        long upcomingOpen = 0;
        for (int offset = 1; offset <= UPCOMING_DAYS; offset++) {
            LocalDate date = today.plusDays(offset);
            List<Day> planned = window.stream().filter(day -> date.equals(day.getPlannedDate())).toList();
            long open = planned.stream().filter(day -> !finished(day)).count();
            upcomingOpen += open;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", date.toString());
            item.put("total", planned.size());
            item.put("open", open);
            List<DaySchedule> placed = planned.stream().map(day -> scheduleByDay.get(day.getId()))
                    .filter(schedule -> schedule != null).toList();
            item.put("scheduled", placed.size());
            item.put("scheduledMinutes", placed.stream().mapToLong(TodayCoachContextService::minutes).sum());
            item.put("core", planned.stream().filter(Day::isCoreDay).count());
            item.put("highPriority", planned.stream().filter(day -> day.getPriority().level() == 3).count());
            upcoming.add(item);
        }
        data.put("upcomingDays", upcoming);

        LocalDate recentFrom = today.minusDays(RECENT_DAYS);
        List<Day> recent = window.stream()
                .filter(day -> !day.getPlannedDate().isBefore(recentFrom) && day.getPlannedDate().isBefore(today))
                .toList();
        long recentDone = recent.stream().filter(day -> day.getStatus() == DayStatus.DONE).count();
        long recentSkipped = recent.stream().filter(day -> day.getStatus() == DayStatus.SKIPPED).count();
        Map<String, Object> recentData = new LinkedHashMap<>();
        recentData.put("from", recentFrom.toString());
        recentData.put("to", today.minusDays(1).toString());
        recentData.put("total", recent.size());
        recentData.put("done", recentDone);
        recentData.put("skipped", recentSkipped);
        recentData.put("open", recent.size() - recentDone - recentSkipped);
        data.put("recent7Days", recentData);

        Map<String, ReviewFact> reviewFacts = new LinkedHashMap<>();
        List<Map<String, Object>> reviewData = new ArrayList<>();
        addReview(reviewFacts, reviewData, userId, ReviewType.DAY, today, DAY_REVIEW_LOOKBACK_DAYS, "일간 회고");
        addReview(reviewFacts, reviewData, userId, ReviewType.WEEK, today, WEEK_REVIEW_LOOKBACK_DAYS, "주간 회고");
        data.put("reviews", reviewData);

        long todayDone = todayAll.stream().filter(day -> day.getStatus() == DayStatus.DONE).count();
        long todayOpen = todayAll.stream().filter(day -> !finished(day)).count();
        long todayCoreOpen = todayAll.stream().filter(day -> day.isCoreDay() && !finished(day)).count();
        Map<String, MetricFact> metricFacts = new LinkedHashMap<>();
        List<Map<String, Object>> metricData = new ArrayList<>();
        addMetric(metricFacts, metricData, "todayTotalCount", todayAll.size(), "오늘 계획된 Day " + todayAll.size() + "개");
        addMetric(metricFacts, metricData, "todayDoneCount", todayDone, "오늘 완료한 Day " + todayDone + "개");
        addMetric(metricFacts, metricData, "todayOpenCount", todayOpen, "오늘 남은 Day " + todayOpen + "개");
        addMetric(metricFacts, metricData, "todayCoreOpenCount", todayCoreOpen, "오늘 남은 핵심 Day " + todayCoreOpen + "개");
        addMetric(metricFacts, metricData, "overdueCount", unfinishedAll.size(),
                "최근 " + UNFINISHED_LOOKBACK_DAYS + "일 미완료 Day " + unfinishedAll.size() + "개");
        addMetric(metricFacts, metricData, "yesterdayUnfinishedCount", yesterdayUnfinished,
                "어제 끝내지 못한 Day " + yesterdayUnfinished + "개");
        addMetric(metricFacts, metricData, "scheduledDayCount", workload.scheduledDayCount(),
                "오늘 시간이 잡힌 Day " + workload.scheduledDayCount() + "개");
        addMetric(metricFacts, metricData, "totalScheduledMinutes", workload.totalScheduledMinutes(),
                "오늘 일정 합계 " + durationLabel(workload.totalScheduledMinutes()));
        addMetric(metricFacts, metricData, "overbookedMinutes", workload.overbookedMinutes(),
                "겹쳐서 넘치는 시간 " + durationLabel(workload.overbookedMinutes()));
        addMetric(metricFacts, metricData, "peakConcurrentCount", workload.peakConcurrentCount(),
                "같은 시각 최대 " + workload.peakConcurrentCount() + "개 겹침");
        addMetric(metricFacts, metricData, "recoveryCandidateCount", recoveryCandidates.size(),
                "정리할 Day " + recoveryCandidates.size() + "개");
        addMetric(metricFacts, metricData, "recent7DoneCount", recentDone,
                "최근 7일 완료 " + recentDone + "/" + recent.size());
        addMetric(metricFacts, metricData, "upcoming3OpenCount", upcomingOpen, "다음 3일 남은 Day " + upcomingOpen + "개");
        // Busy windows can be cited as METRIC evidence by their key.
        busyWindowLabels.forEach((key, label) -> metricFacts.put(key, new MetricFact(label)));
        data.put("metrics", metricData);

        Map<String, Object> omitted = new LinkedHashMap<>();
        omitted.put("todayDays", todayAll.size() - todayDays.size());
        omitted.put("unfinishedDays", unfinishedAll.size() - unfinished.size());
        omitted.put("activeGoals", Math.max(0, activeAll.size() - MAX_GOALS));
        data.put("omitted", omitted);

        return new TodayCoachContext(today, data, dayFacts, todayRefs, goalFacts, reviewFacts, metricFacts,
                new TodayCoachContext.WorkloadFact(workload.overbookedMinutes(), busyWindowFacts));
    }

    private static long minutes(DaySchedule schedule) {
        return Math.max(0, Duration.between(schedule.getStartAt(), schedule.getEndAt()).toMinutes());
    }

    /** 240 → "4시간", 90 → "1시간 30분", 45 → "45분". */
    static String durationLabel(long minutes) {
        long hours = minutes / 60;
        long rest = minutes % 60;
        if (hours == 0) {
            return rest + "분";
        }
        return rest == 0 ? hours + "시간" : hours + "시간 " + rest + "분";
    }

    private void addReview(Map<String, ReviewFact> facts, List<Map<String, Object>> out, UUID userId, ReviewType type,
            LocalDate today, int lookbackDays, String label) {
        Review review = reviews
                .findFirstByUserIdAndTypeAndPeriodStartLessThanEqualOrderByPeriodStartDesc(userId, type, today)
                .filter(found -> !found.getPeriodStart().isBefore(today.minusDays(lookbackDays)))
                .orElse(null);
        if (review == null || review.getItems().isEmpty()) {
            return;
        }
        String ref = "R" + (facts.size() + 1);
        facts.put(ref, new ReviewFact(review.getId(), label + " " + review.getPeriodStart()));
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("ref", ref);
        item.put("type", type.name());
        item.put("periodStart", review.getPeriodStart().toString());
        item.put("periodEnd", review.getPeriodEnd().toString());
        List<ReviewItem> lines = review.getItems().stream().limit(MAX_REVIEW_ITEMS).toList();
        item.put("keep", lines(lines, ReviewItemKind.KEEP));
        item.put("problem", lines(lines, ReviewItemKind.PROBLEM));
        item.put("try", lines(lines, ReviewItemKind.TRY));
        out.add(item);
    }

    private static List<String> lines(List<ReviewItem> items, ReviewItemKind kind) {
        return items.stream().filter(item -> item.getKind() == kind)
                .map(item -> clip(item.getContent(), MAX_REVIEW_TEXT_LENGTH)).toList();
    }

    private static void addMetric(Map<String, MetricFact> facts, List<Map<String, Object>> out, String key, long value,
            String label) {
        facts.put(key, new MetricFact(label));
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("key", key);
        item.put("value", value);
        out.add(item);
    }

    private static String addDay(Map<String, DayFact> facts, Day day, Map<UUID, String> goalRefs, DaySchedule schedule,
            ZoneId zone) {
        String ref = "D" + (facts.size() + 1);
        facts.put(ref, new DayFact(day.getId(), clip(day.getTitle(), MAX_TITLE_LENGTH), day.getStatus(),
                day.getPriority(), day.getPlannedDate(), day.getGoalId() == null ? null : goalRefs.get(day.getGoalId()),
                day.isCoreDay(), schedule == null ? null : TIME.format(schedule.getStartAt().atZone(zone))));
        return ref;
    }

    private static Map<String, Object> dayData(String ref, Day day, Map<UUID, String> goalRefs) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("ref", ref);
        item.put("title", clip(day.getTitle(), MAX_TITLE_LENGTH));
        item.put("status", day.getStatus().name());
        item.put("priority", day.getPriority().name());
        item.put("core", day.isCoreDay());
        item.put("goalRef", day.getGoalId() == null ? null : goalRefs.get(day.getGoalId()));
        return item;
    }

    private static boolean finished(Day day) {
        return day.getStatus() == DayStatus.DONE || day.getStatus() == DayStatus.SKIPPED;
    }

    private static void addIfPresent(Set<UUID> ids, UUID id) {
        if (id != null) {
            ids.add(id);
        }
    }

    /** One line, control characters removed, at most {@code max} characters. */
    static String clip(String text, int max) {
        return CoachText.clip(text, max);
    }
}
