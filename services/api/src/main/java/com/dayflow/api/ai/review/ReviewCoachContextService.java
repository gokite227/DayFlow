package com.dayflow.api.ai.review;

import com.dayflow.api.ai.CoachText;
import com.dayflow.api.ai.review.ReviewMetrics.Counts;
import com.dayflow.api.ai.review.ReviewMetrics.DayInput;
import com.dayflow.api.ai.review.ReviewMetrics.TimeBucket;
import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.day.Day;
import com.dayflow.api.day.DayPriority;
import com.dayflow.api.day.DayRepository;
import com.dayflow.api.day.DaySchedule;
import com.dayflow.api.day.DayScheduleRepository;
import com.dayflow.api.goal.Goal;
import com.dayflow.api.goal.GoalRepository;
import com.dayflow.api.recovery.RecoveryAction;
import com.dayflow.api.recovery.RecoveryDayRepository;
import com.dayflow.api.recovery.RecoveryEvent;
import com.dayflow.api.recovery.RecoveryEventItem;
import com.dayflow.api.recovery.RecoveryEventRepository;
import com.dayflow.api.review.Review;
import com.dayflow.api.review.ReviewItem;
import com.dayflow.api.review.ReviewItemKind;
import com.dayflow.api.review.ReviewRepository;
import com.dayflow.api.review.ReviewType;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the Review Coach context of one period for the current user in one read-only transaction.
 *
 * <p>Strategy per period size: DAY and WEEK carry Day details (limited), MONTH/QUARTER/YEAR carry aggregates and only
 * a few important unfinished Days. All numbers are computed here ({@link ReviewMetrics}) and handed over as evidence
 * labels; the model only chooses which facts matter and writes KPT lines about them.
 *
 * <p>Privacy: no email, name, user id, token, Day/Goal UUIDs (refs instead), Event data, Focus data or review archive.
 * Titles and at most a few KPT lines (previous TRY, lines already written for this period) are sent, clipped.
 */
@Service
public class ReviewCoachContextService {

    /** Day details per review type; larger periods rely on aggregates. */
    static final Map<ReviewType, Integer> MAX_DETAIL_DAYS = Map.of(
            ReviewType.DAY, 12, ReviewType.WEEK, 30, ReviewType.MONTH, 10, ReviewType.QUARTER, 5, ReviewType.YEAR, 0);
    static final int MAX_GOALS = 8;
    static final int MAX_BUSY_WINDOWS = 5;
    static final int MAX_REPEATED_RECOVERY = 3;
    static final int MAX_PREVIOUS_TRY = 3;
    static final int MAX_EXISTING_LINES_PER_KIND = 3;
    static final int MAX_TITLE_LENGTH = 80;
    static final int MAX_LINE_LENGTH = 120;
    /** Schedules are loaded in chunks so a YEAR period never builds one huge IN list. */
    static final int SCHEDULE_CHUNK = 500;

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    static final Map<RecoveryAction, String> RECOVERY_LABEL = Map.of(
            RecoveryAction.KEEP, "그대로 두기", RecoveryAction.REDUCE, "작게 줄이기", RecoveryAction.MOVE, "날짜 바꾸기",
            RecoveryAction.CARRY_OVER, "다음 계획으로 이어가기", RecoveryAction.DROP, "이번에는 내려놓기");
    static final Map<ReviewType, String> TYPE_LABEL = Map.of(
            ReviewType.DAY, "일간", ReviewType.WEEK, "주간", ReviewType.MONTH, "월간", ReviewType.QUARTER, "분기",
            ReviewType.YEAR, "연간");
    private static final Map<DayOfWeek, String> WEEKDAY_LABEL = Map.of(
            DayOfWeek.MONDAY, "월요일", DayOfWeek.TUESDAY, "화요일", DayOfWeek.WEDNESDAY, "수요일",
            DayOfWeek.THURSDAY, "목요일", DayOfWeek.FRIDAY, "금요일", DayOfWeek.SATURDAY, "토요일", DayOfWeek.SUNDAY, "일요일");

    private final DayRepository days;
    private final DayScheduleRepository schedules;
    private final GoalRepository goals;
    private final ReviewRepository reviews;
    private final RecoveryEventRepository recoveryEvents;
    private final RecoveryDayRepository recoveryDays;
    private final CurrentUser currentUser;

    public ReviewCoachContextService(DayRepository days, DayScheduleRepository schedules, GoalRepository goals,
            ReviewRepository reviews, RecoveryEventRepository recoveryEvents, RecoveryDayRepository recoveryDays,
            CurrentUser currentUser) {
        this.days = days;
        this.schedules = schedules;
        this.goals = goals;
        this.reviews = reviews;
        this.recoveryEvents = recoveryEvents;
        this.recoveryDays = recoveryDays;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public ReviewCoachContext build(ReviewType type, LocalDate start, LocalDate end, LocalDate today) {
        UUID userId = currentUser.id();
        List<Day> periodDays = days.findByUserIdAndPlannedDateBetween(userId, start, end);
        Map<UUID, DaySchedule> scheduleByDay = schedulesOf(periodDays);
        List<DayInput> inputs = inputs(periodDays, scheduleByDay);
        ReviewMetrics.Result metrics = ReviewMetrics.analyze(type, start, end, inputs);

        LocalDate previousStart = ReviewMetrics.previousStart(type, start);
        LocalDate previousEnd = type.periodEnd(previousStart);
        List<Day> previousDays = days.findByUserIdAndPlannedDateBetween(userId, previousStart, previousEnd);
        ReviewMetrics.Result previous = ReviewMetrics.analyze(type, previousStart, previousEnd,
                inputs(previousDays, schedulesOf(previousDays)));

        Evidence evidence = new Evidence();
        Map<String, Object> data = new LinkedHashMap<>();
        List<String> titles = new ArrayList<>();
        Map<String, String> refNames = new HashMap<>();

        // Period
        boolean inProgress = !end.isBefore(today);
        Map<String, Object> period = new LinkedHashMap<>();
        period.put("type", type.name());
        period.put("typeLabel", TYPE_LABEL.get(type));
        period.put("start", start.toString());
        period.put("end", end.toString());
        period.put("daysInPeriod", ReviewMetrics.daysInPeriod(start, end));
        period.put("inProgress", inProgress);
        period.put("statusNote", "Day 상태는 지금 저장된 상태예요. 완료한 시각은 기록되지 않아요.");
        data.put("period", period);
        if (inProgress) {
            evidence.put("PERIOD_IN_PROGRESS", "기간이 아직 진행 중이에요 (오늘 포함 "
                    + ReviewMetrics.daysInPeriod(today.isBefore(start) ? start : today, end) + "일 남음)");
        }

        // Completion
        Counts all = metrics.all();
        if (all.total() == 0) {
            evidence.put("NO_DAYS", "이 기간에 날짜가 정해진 Day가 없어요");
        } else {
            evidence.put("COMPLETION", "계획한 Day " + (all.total() - all.skipped()) + "개 중 " + all.done() + "개 완료 ("
                    + rate(all) + (all.skipped() > 0 ? ", 내려놓은 " + all.skipped() + "개 제외" : "") + ")");
            if (all.open() > 0) {
                evidence.put("UNFINISHED", "미완료로 남아 있는 Day " + all.open() + "개");
            }
            if (all.skipped() > 0) {
                evidence.put("SKIPPED", "내려놓은 Day " + all.skipped() + "개");
            }
        }
        if (metrics.core().total() > 0) {
            evidence.put("CORE_COMPLETION", "핵심 Day " + counted(metrics.core()) + "개 중 " + metrics.core().done() + "개 완료");
        }
        Counts high = metrics.byPriority().get(DayPriority.HIGH);
        if (high.total() > 0) {
            evidence.put("HIGH_PRIORITY_COMPLETION", "우선순위 높음 Day " + counted(high) + "개 중 " + high.done() + "개 완료");
        }
        if (metrics.carriedIn() > 0) {
            evidence.put("CARRIED_IN", "이전 계획에서 이어온 Day " + metrics.carriedIn() + "개");
        }
        data.put("daysSummary", countsData(all, null));
        data.put("coreDays", countsData(metrics.core(), evidence.has("CORE_COMPLETION") ? "CORE_COMPLETION" : null));
        Map<String, Object> priorities = new LinkedHashMap<>();
        metrics.byPriority().forEach((priority, counts) -> priorities.put(priority.name(), countsData(counts, null)));
        data.put("byPriority", priorities);

        // Schedule
        ReviewMetrics.ScheduleSummary schedule = metrics.schedule();
        if (all.total() > 0) {
            evidence.put("SCHEDULED_SHARE", "시간을 정한 Day " + schedule.scheduled() + "개 · 시간 없이 둔 Day "
                    + schedule.unscheduled() + "개");
        }
        if (schedule.scheduledCounts().enoughForPattern() && schedule.unscheduledCounts().enoughForPattern()) {
            evidence.put("SCHEDULED_VS_UNSCHEDULED", "시간을 정한 Day 완료 " + rate(schedule.scheduledCounts())
                    + " · 시간 없이 둔 Day 완료 " + rate(schedule.unscheduledCounts()));
        }
        if (schedule.totalMinutes() > 0) {
            evidence.put("SCHEDULED_MINUTES", "배치한 시간 합계 " + duration(schedule.totalMinutes()) + " (완료한 Day "
                    + duration(schedule.completedMinutes()) + ")");
        }
        if (schedule.overbookedMinutes() > 0) {
            evidence.put("OVERBOOKED", "일정이 겹쳐 넘친 시간 " + duration(schedule.overbookedMinutes()) + " ("
                    + schedule.overloadedDates() + "일)");
        }
        if (schedule.peakConcurrent() >= 2) {
            evidence.put("PEAK_CONCURRENT", "같은 시각 최대 " + schedule.peakConcurrent() + "개 겹침");
        }
        Map<String, Object> scheduleData = new LinkedHashMap<>();
        scheduleData.put("scheduledDayCount", schedule.scheduled());
        scheduleData.put("unscheduledDayCount", schedule.unscheduled());
        scheduleData.put("totalScheduledMinutes", schedule.totalMinutes());
        scheduleData.put("completedScheduledMinutes", schedule.completedMinutes());
        scheduleData.put("overbookedMinutes", schedule.overbookedMinutes());
        scheduleData.put("overloadedDates", schedule.overloadedDates());
        scheduleData.put("peakConcurrentCount", schedule.peakConcurrent());
        if (type == ReviewType.DAY || type == ReviewType.WEEK) {
            scheduleData.put("busyWindows", schedule.windows().stream().limit(MAX_BUSY_WINDOWS).map(window -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("date", window.date().toString());
                item.put("start", TIME.format(window.start().atZone(zoneOf(inputs))));
                item.put("end", TIME.format(window.end().atZone(zoneOf(inputs))));
                item.put("dayCount", window.dayCount());
                item.put("availableMinutes", window.availableMinutes());
                item.put("plannedMinutes", window.plannedMinutes());
                return item;
            }).toList());
        }
        data.put("schedule", scheduleData);

        // Time of day (placement start), never "done at"
        Set<String> timeKeys = new LinkedHashSet<>();
        List<Map<String, Object>> timeData = new ArrayList<>();
        for (TimeBucket bucket : TimeBucket.values()) {
            Counts counts = metrics.timeOfDay().get(bucket);
            String key = "TIME_" + bucket.name();
            if (counts.enoughForPattern()) {
                evidence.put(key, bucket.label() + "에 배치된 Day " + counted(counts) + "개 중 " + counts.done() + "개 완료");
                timeKeys.add(key);
            }
            Counts before = previous.timeOfDay().get(bucket);
            String previousKey = "PREVIOUS_" + key;
            if ((counts.enoughForPattern() || before.enoughForPattern()) && previous.all().total() > 0) {
                evidence.put(previousKey, bucket.label() + " 배치 Day 지난 기간 " + counted(before) + "개(완료 "
                        + before.done() + ") → 이번 기간 " + counted(counts) + "개(완료 " + counts.done() + ")");
                timeKeys.add(previousKey);
            }
            Map<String, Object> item = countsData(counts, evidence.has(key) ? key : null);
            item.put("bucket", bucket.name());
            item.put("label", bucket.label());
            item.put("enoughSample", counts.enoughForPattern());
            timeData.add(item);
        }
        if (!metrics.anyTimePattern() && all.total() > 0) {
            evidence.put("PATTERN_SAMPLE_LIMITED", "시간대마다 배치된 Day가 " + ReviewMetrics.MIN_PATTERN_SAMPLE
                    + "개 미만이라 시간대 패턴은 판단하기 어려워요");
        }
        data.put("timeOfDay", timeData);

        // Weekdays (not for a single day)
        Set<String> weekdayKeys = new LinkedHashSet<>();
        if (type != ReviewType.DAY) {
            List<Map<String, Object>> weekdayData = new ArrayList<>();
            metrics.weekdays().forEach((weekday, counts) -> {
                String key = "WEEKDAY_" + weekday.name();
                if (counts.enoughForPattern()) {
                    evidence.put(key, WEEKDAY_LABEL.get(weekday) + "에 계획된 Day " + counted(counts) + "개 중 "
                            + counts.done() + "개 완료");
                    weekdayKeys.add(key);
                }
                if (counts.total() > 0) {
                    Map<String, Object> item = countsData(counts, evidence.has(key) ? key : null);
                    item.put("weekday", weekday.name());
                    item.put("enoughSample", counts.enoughForPattern());
                    weekdayData.add(item);
                }
            });
            data.put("weekdays", weekdayData);
        }

        // Breakdown (per date / week chunk / month)
        data.put("breakdown", metrics.breakdown().stream().map(slice -> {
            Map<String, Object> item = countsData(slice.counts(), null);
            item.put("label", slice.label());
            item.put("start", slice.start().toString());
            item.put("end", slice.end().toString());
            return item;
        }).toList());

        // Previous period (same type)
        Map<String, Object> previousData = new LinkedHashMap<>();
        previousData.put("start", previousStart.toString());
        previousData.put("end", previousEnd.toString());
        previousData.put("days", countsData(previous.all(), null));
        previousData.put("overbookedMinutes", previous.schedule().overbookedMinutes());
        if (previous.all().total() > 0 && all.total() > 0) {
            evidence.put("PREVIOUS_COMPLETION", "완료율 지난 기간 " + rate(previous.all()) + " → 이번 기간 " + rate(all));
        }
        if (previous.schedule().overbookedMinutes() > 0 || schedule.overbookedMinutes() > 0) {
            evidence.put("PREVIOUS_OVERBOOKED", "겹쳐 넘친 시간 지난 기간 " + duration(previous.schedule().overbookedMinutes())
                    + " → 이번 기간 " + duration(schedule.overbookedMinutes()));
        }
        Review previousReview = reviews.findByUserIdAndTypeAndPeriodStart(userId, type, previousStart).orElse(null);
        List<String> previousTry = previousReview == null ? List.of() : previousReview.getItems().stream()
                .filter(item -> item.getKind() == ReviewItemKind.TRY)
                .limit(MAX_PREVIOUS_TRY)
                .map(item -> CoachText.clip(item.getContent(), MAX_LINE_LENGTH))
                .toList();
        previousData.put("reviewExists", previousReview != null);
        previousData.put("tryLines", previousTry);
        titles.addAll(previousTry);
        if (!previousTry.isEmpty()) {
            evidence.put("PREVIOUS_TRY", "지난 " + TYPE_LABEL.get(type) + " 회고의 TRY " + previousTry.size() + "개");
        }
        data.put("previousPeriod", previousData);

        // Goals overlapping the period
        List<Goal> overlapping = goals
                .findByUserIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAscCreatedAtAsc(
                        userId, end, start);
        Map<UUID, Goal> goalById = overlapping.stream().collect(Collectors.toMap(Goal::getId, Function.identity()));
        Map<UUID, List<DayInput>> daysByGoal = inputs.stream().filter(day -> day.goalId() != null)
                .collect(Collectors.groupingBy(DayInput::goalId));
        List<GoalRow> goalRows = new ArrayList<>();
        for (Goal goal : overlapping) {
            boolean reviewLevel = goal.isPeriod() || goal.getType() == type.goalType();
            List<DayInput> linked = new ArrayList<>();
            for (UUID id : subtree(goal, overlapping)) {
                linked.addAll(daysByGoal.getOrDefault(id, List.of()));
            }
            if (reviewLevel || (!linked.isEmpty() && goal.acceptsDays())) {
                goalRows.add(new GoalRow(goal, Counts.of(linked)));
            }
        }
        goalRows.sort(Comparator.comparing((GoalRow row) -> row.counts().total() == 0)
                .thenComparing(row -> row.goal().getStartDate()));
        Map<UUID, String> goalRefs = new HashMap<>();
        List<Map<String, Object>> goalData = new ArrayList<>();
        for (GoalRow row : goalRows.stream().limit(MAX_GOALS).toList()) {
            String ref = "G" + (goalRefs.size() + 1);
            String title = CoachText.clip(row.goal().getTitle(), MAX_TITLE_LENGTH);
            goalRefs.put(row.goal().getId(), ref);
            refNames.put(ref, title);
            titles.add(title);
            String key = "GOAL_" + goalRefs.size();
            evidence.put(key, row.counts().total() == 0
                    ? "'" + title + "' 이 기간에 연결된 Day 없음"
                    : "'" + title + "' 기간 내 Day " + counted(row.counts()) + "개 중 " + row.counts().done() + "개 완료");
            Map<String, Object> item = countsData(row.counts(), key);
            item.put("ref", ref);
            item.put("title", title);
            item.put("kind", row.goal().getKind().name());
            item.put("goalType", row.goal().getType() == null ? null : row.goal().getType().name());
            item.put("goalStart", row.goal().getStartDate().toString());
            item.put("goalEnd", row.goal().getEndDate().toString());
            goalData.add(item);
        }
        data.put("goals", goalData);
        data.put("goalsOmitted", Math.max(0, goalRows.size() - MAX_GOALS));

        // Recovery in the period
        List<RecoveryEvent> events = recoveryEvents.findByUserIdAndLocalDateBetween(userId, start, end);
        Map<RecoveryAction, Integer> actions = new EnumMap<>(RecoveryAction.class);
        Map<UUID, Integer> timesByDay = new HashMap<>();
        Map<UUID, String> titleByDay = new HashMap<>();
        int decisions = 0;
        for (RecoveryEvent event : events) {
            for (RecoveryEventItem item : event.getItems()) {
                decisions++;
                actions.merge(item.getAction(), 1, Integer::sum);
                if (item.getDayId() != null) {
                    timesByDay.merge(item.getDayId(), 1, Integer::sum);
                    titleByDay.put(item.getDayId(), item.getDayTitle());
                }
            }
        }
        List<Map.Entry<UUID, Integer>> repeated = timesByDay.entrySet().stream().filter(entry -> entry.getValue() >= 2)
                .sorted(Map.Entry.<UUID, Integer>comparingByValue().reversed()).toList();
        if (decisions > 0) {
            evidence.put("RECOVERY_ACTIONS", "Recovery 정리 " + decisions + "건 (" + actions.entrySet().stream()
                    .map(entry -> RECOVERY_LABEL.get(entry.getKey()) + " " + entry.getValue())
                    .collect(Collectors.joining(" · ")) + ")");
        }
        if (!repeated.isEmpty()) {
            evidence.put("RECOVERY_REPEATED", "두 번 이상 다시 정리한 Day " + repeated.size() + "개");
        }
        int restDays = recoveryDays.findByUserIdAndDateBetweenOrderByDate(userId, start, end).size();
        if (restDays > 0) {
            evidence.put("RECOVERY_DAYS", "Recovery Day " + restDays + "일");
        }
        Map<String, Object> recoveryData = new LinkedHashMap<>();
        recoveryData.put("decisions", decisions);
        Map<String, Integer> actionData = new LinkedHashMap<>();
        actions.forEach((action, count) -> actionData.put(action.name(), count));
        recoveryData.put("actions", actionData);
        recoveryData.put("recoveryDays", restDays);
        recoveryData.put("repeatedlyRecovered", repeated.stream().limit(MAX_REPEATED_RECOVERY).map(entry -> {
            String title = CoachText.clip(Objects.requireNonNullElse(titleByDay.get(entry.getKey()), ""), MAX_TITLE_LENGTH);
            titles.add(title);
            return Map.<String, Object>of("title", title, "times", entry.getValue());
        }).toList());
        data.put("recovery", recoveryData);

        // Day details (limited per period size)
        int maxDetails = MAX_DETAIL_DAYS.get(type);
        List<DayInput> detailCandidates = type == ReviewType.DAY || type == ReviewType.WEEK
                ? inputs
                // Larger periods: only unfinished Days that matter (core, high priority, carried in, recovered again).
                : inputs.stream().filter(day -> day.status() != null && !day.done() && !day.skipped()
                        && (day.core() || day.priority() == DayPriority.HIGH || day.carriedIn()
                        || timesByDay.getOrDefault(day.id(), 0) >= 2)).toList();
        List<DayInput> details = detailCandidates.stream()
                .sorted(Comparator.comparing(DayInput::plannedDate)
                        .thenComparing(DayInput::core, Comparator.reverseOrder())
                        .thenComparing(day -> day.priority().level(), Comparator.reverseOrder())
                        .thenComparing(DayInput::title))
                .limit(maxDetails)
                .toList();
        List<Map<String, Object>> dayData = new ArrayList<>();
        int dayRef = 0;
        for (DayInput day : details) {
            String ref = "D" + (++dayRef);
            String title = CoachText.clip(day.title(), MAX_TITLE_LENGTH);
            refNames.put(ref, title);
            titles.add(title);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("ref", ref);
            item.put("title", title);
            item.put("plannedDate", day.plannedDate().toString());
            item.put("status", day.status().name());
            item.put("priority", day.priority().name());
            item.put("core", day.core());
            item.put("goalRef", day.goalId() == null ? null : goalRefs.get(day.goalId()));
            item.put("timeBucket", day.timeBucket() == null ? null : day.timeBucket().name());
            item.put("scheduledMinutes", day.scheduled() ? day.scheduledMinutes() : null);
            item.put("carriedIn", day.carriedIn());
            item.put("recoveredTimes", timesByDay.getOrDefault(day.id(), 0));
            dayData.add(item);
        }
        data.put("days", dayData);
        data.put("daysOmitted", detailCandidates.size() - details.size());

        // Lines the user already wrote for this period (a few, clipped): only so the model does not repeat them. The
        // client removes repeats when appending; replacing keeps the full draft.
        Review current = reviews.findByUserIdAndTypeAndPeriodStart(userId, type, start).orElse(null);
        Map<String, Object> written = new LinkedHashMap<>();
        for (ReviewItemKind kind : ReviewItemKind.values()) {
            List<String> lines = current == null ? List.of() : current.getItems().stream()
                    .filter(item -> item.getKind() == kind).map(ReviewItem::getContent).toList();
            List<String> sent = lines.stream().limit(MAX_EXISTING_LINES_PER_KIND)
                    .map(line -> CoachText.clip(line, MAX_LINE_LENGTH)).toList();
            titles.addAll(sent);
            written.put(kind.name().toLowerCase(), sent);
        }
        data.put("alreadyWritten", written);

        data.put("minPatternSample", ReviewMetrics.MIN_PATTERN_SAMPLE);
        data.put("evidence", evidence.asList());

        List<String> factKeys = evidence.keys().stream()
                .filter(key -> !key.startsWith("PREVIOUS_TIME_") && !key.startsWith("GOAL_")).limit(8).toList();
        return new ReviewCoachContext(type, start, end, data, evidence.map(), timeKeys, weekdayKeys, refNames, titles,
                factKeys);
    }

    private record GoalRow(Goal goal, Counts counts) {
    }

    /** The Goal and its descendants among the loaded Goals (Days link to WEEK/PERIOD Goals under it). */
    private static Set<UUID> subtree(Goal root, List<Goal> loaded) {
        Set<UUID> ids = new LinkedHashSet<>(List.of(root.getId()));
        boolean grew = true;
        while (grew) {
            grew = false;
            for (Goal goal : loaded) {
                if (goal.getParentGoalId() != null && ids.contains(goal.getParentGoalId()) && ids.add(goal.getId())) {
                    grew = true;
                }
            }
        }
        return ids;
    }

    private Map<UUID, DaySchedule> schedulesOf(List<Day> list) {
        Map<UUID, DaySchedule> result = new HashMap<>();
        List<UUID> ids = list.stream().map(Day::getId).toList();
        for (int from = 0; from < ids.size(); from += SCHEDULE_CHUNK) {
            schedules.findByDayIdIn(ids.subList(from, Math.min(ids.size(), from + SCHEDULE_CHUNK)))
                    .forEach(schedule -> result.put(schedule.getDayId(), schedule));
        }
        return result;
    }

    private static List<DayInput> inputs(List<Day> list, Map<UUID, DaySchedule> scheduleByDay) {
        return list.stream().map(day -> {
            DaySchedule schedule = scheduleByDay.get(day.getId());
            return new DayInput(day.getId(), day.getTitle(), day.getStatus(), day.getPriority(), day.isCoreDay(),
                    day.getGoalId(), day.getPlannedDate(), day.getCarriedFromDayId() != null,
                    schedule == null ? null : schedule.getStartAt(), schedule == null ? null : schedule.getEndAt(),
                    schedule == null ? null : schedule.zoneId());
        }).toList();
    }

    private static ZoneId zoneOf(List<DayInput> inputs) {
        return inputs.stream().map(DayInput::scheduleZone).filter(Objects::nonNull).findFirst().orElse(ZoneId.of("UTC"));
    }

    private static Map<String, Object> countsData(Counts counts, String evidenceKey) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("total", counts.total());
        item.put("done", counts.done());
        item.put("open", counts.open());
        item.put("skipped", counts.skipped());
        item.put("completionRatePercent", counts.completionRate() == null ? null : Math.round(counts.completionRate() * 100));
        if (evidenceKey != null) {
            item.put("evidenceKey", evidenceKey);
        }
        return item;
    }

    private static int counted(Counts counts) {
        return counts.total() - counts.skipped();
    }

    static String rate(Counts counts) {
        return counts.completionRate() == null ? "-" : Math.round(counts.completionRate() * 100) + "%";
    }

    static String duration(long minutes) {
        long hours = minutes / 60;
        long rest = minutes % 60;
        if (hours == 0) {
            return rest + "분";
        }
        return rest == 0 ? hours + "시간" : hours + "시간 " + rest + "분";
    }

    /** Evidence key → label in insertion order. */
    private static final class Evidence {
        private final Map<String, String> labels = new LinkedHashMap<>();

        void put(String key, String label) {
            labels.put(key, label);
        }

        boolean has(String key) {
            return labels.containsKey(key);
        }

        List<String> keys() {
            return List.copyOf(labels.keySet());
        }

        Map<String, String> map() {
            return Collections.unmodifiableMap(new LinkedHashMap<>(labels));
        }

        List<Map<String, String>> asList() {
            return labels.entrySet().stream().map(entry -> {
                Map<String, String> item = new LinkedHashMap<>();
                item.put("key", entry.getKey());
                item.put("label", entry.getValue());
                return item;
            }).toList();
        }
    }
}
