package com.dayflow.api.ai.planning;

import com.dayflow.api.ai.CoachText;
import com.dayflow.api.ai.planning.PlanningCoachContext.DayOption;
import com.dayflow.api.ai.review.ReviewMetrics;
import com.dayflow.api.ai.review.ReviewMetrics.Counts;
import com.dayflow.api.ai.review.ReviewMetrics.DayInput;
import com.dayflow.api.ai.review.ReviewMetrics.TimeBucket;
import com.dayflow.api.ai.today.TodayWorkload;
import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.day.Day;
import com.dayflow.api.day.DayPriority;
import com.dayflow.api.day.DayRepository;
import com.dayflow.api.day.DaySchedule;
import com.dayflow.api.day.DayScheduleRepository;
import com.dayflow.api.day.DayStatus;
import com.dayflow.api.event.EventDtos.EventOccurrenceResponse;
import com.dayflow.api.event.EventService;
import com.dayflow.api.goal.Goal;
import com.dayflow.api.goal.GoalRepository;
import com.dayflow.api.goal.GoalType;
import com.dayflow.api.recovery.RecoveryAction;
import com.dayflow.api.recovery.RecoveryEvent;
import com.dayflow.api.recovery.RecoveryEventItem;
import com.dayflow.api.recovery.RecoveryEventRepository;
import com.dayflow.api.review.Review;
import com.dayflow.api.review.ReviewItemKind;
import com.dayflow.api.review.ReviewRepository;
import com.dayflow.api.review.ReviewType;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the Planning Coach context of one planned period in one read-only transaction.
 *
 * <p>The period is canonical: a CALENDAR WEEK Goal plans its own week; a PERIOD Goal plans one Monday-based week
 * clipped to its range (the same derived grouping as the Period Goal screen; no WEEK Goal is created). Only dates from
 * today on can be planned.
 *
 * <p>Capacity is what DayFlow knows, never a guess of the user's free time: open Days per date, their time
 * placements and overlaps, Days placed in the evening, and Event time blocks (durations only; no Event title,
 * location or memo leaves the server).
 */
@Service
public class PlanningCoachContextService {

    static final int MAX_TARGET_DAYS = 20;
    static final int MAX_UNDATED_DAYS = 10;
    static final int MAX_EARLIER_DAYS = 5;
    static final int RECENT_DAYS = 14;
    static final int MAX_TRY_LINES = 3;
    static final int MAX_TITLE_LENGTH = 80;
    static final int MAX_LINE_LENGTH = 120;

    private static final Set<DayStatus> OPEN = Set.of(DayStatus.NOT_STARTED, DayStatus.IN_PROGRESS, DayStatus.DEFERRED);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final Map<RecoveryAction, String> ACTION_LABEL = Map.of(
            RecoveryAction.KEEP, "그대로 두기", RecoveryAction.REDUCE, "작게 줄이기", RecoveryAction.MOVE, "날짜 바꾸기",
            RecoveryAction.CARRY_OVER, "다음 계획으로 이어가기", RecoveryAction.DROP, "이번에는 내려놓기");
    private static final Map<ReviewType, String> REVIEW_LABEL = Map.of(ReviewType.DAY, "일간", ReviewType.WEEK, "주간",
            ReviewType.MONTH, "월간", ReviewType.QUARTER, "분기", ReviewType.YEAR, "연간");

    private final GoalRepository goals;
    private final DayRepository days;
    private final DayScheduleRepository schedules;
    private final ReviewRepository reviews;
    private final RecoveryEventRepository recoveryEvents;
    private final EventService eventService;
    private final CurrentUser currentUser;

    public PlanningCoachContextService(GoalRepository goals, DayRepository days, DayScheduleRepository schedules,
            ReviewRepository reviews, RecoveryEventRepository recoveryEvents, EventService eventService,
            CurrentUser currentUser) {
        this.goals = goals;
        this.days = days;
        this.schedules = schedules;
        this.reviews = reviews;
        this.recoveryEvents = recoveryEvents;
        this.eventService = eventService;
        this.currentUser = currentUser;
    }

    /** The planned period of a Goal, validated the same way the screens derive it. */
    public record Target(Goal goal, LocalDate start, LocalDate end) {
    }

    @Transactional(readOnly = true)
    public Target target(UUID goalId, LocalDate weekStart, LocalDate today) {
        Goal goal = goals.findByIdAndUserId(goalId, currentUser.id())
                .orElseThrow(() -> new ApiException(ErrorCode.GOAL_NOT_FOUND, "Goal " + goalId + " was not found."));
        LocalDate start;
        LocalDate end;
        if (goal.isPeriod()) {
            LocalDate monday;
            if (weekStart != null) {
                if (weekStart.getDayOfWeek() != DayOfWeek.MONDAY) {
                    throw new ApiException(ErrorCode.VALIDATION_ERROR, "weekStart must be a Monday.", "weekStart");
                }
                monday = weekStart;
            } else {
                LocalDate anchor = goal.getStartDate().isAfter(today) ? goal.getStartDate() : today;
                monday = anchor.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            }
            start = monday.isBefore(goal.getStartDate()) ? goal.getStartDate() : monday;
            end = monday.plusDays(6).isAfter(goal.getEndDate()) ? goal.getEndDate() : monday.plusDays(6);
            if (start.isAfter(end)) {
                throw new ApiException(ErrorCode.VALIDATION_ERROR, "The week is outside the Goal period.", "weekStart");
            }
        } else if (goal.getType() == GoalType.WEEK) {
            start = goal.getStartDate();
            end = goal.getEndDate();
        } else {
            throw new ApiException(ErrorCode.VALIDATION_ERROR,
                    "The Planning Coach plans a WEEK Goal or a week of a PERIOD Goal.", "goalId");
        }
        if (end.isBefore(today)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "A period that has already ended cannot be planned.",
                    "goalId");
        }
        return new Target(goal, start, end);
    }

    @Transactional(readOnly = true)
    public PlanningCoachContext build(UUID goalId, LocalDate weekStart, LocalDate today) {
        UUID userId = currentUser.id();
        Target target = target(goalId, weekStart, today);
        Goal goal = target.goal();
        LocalDate planStart = target.start().isBefore(today) ? today : target.start();
        Set<LocalDate> plannable = new LinkedHashSet<>();
        for (LocalDate date = planStart; !date.isAfter(target.end()); date = date.plusDays(1)) {
            plannable.add(date);
        }

        Map<String, String> evidence = new LinkedHashMap<>();
        Map<String, Object> data = new LinkedHashMap<>();
        List<String> titles = new ArrayList<>();
        String goalTitle = CoachText.clip(goal.getTitle(), MAX_TITLE_LENGTH);
        titles.add(goalTitle);

        Map<String, Object> targetData = new LinkedHashMap<>();
        targetData.put("start", target.start().toString());
        targetData.put("end", target.end().toString());
        targetData.put("today", today.toString());
        targetData.put("plannableDates", plannable.stream().map(LocalDate::toString).toList());
        data.put("target", targetData);

        // Goal and its Days.
        List<Day> linked = days.findByGoalIdOrderByPlannedDateAscCreatedAtAsc(goal.getId());
        Map<UUID, DaySchedule> linkedSchedules = schedulesOf(linked);
        long linkedDone = linked.stream().filter(day -> day.getStatus() == DayStatus.DONE).count();
        List<Day> inTarget = linked.stream().filter(day -> day.getPlannedDate() != null
                && !day.getPlannedDate().isBefore(target.start()) && !day.getPlannedDate().isAfter(target.end())).toList();
        List<Day> undated = linked.stream().filter(day -> day.getPlannedDate() == null && OPEN.contains(day.getStatus())).toList();
        List<Day> earlier = linked.stream().filter(day -> day.getPlannedDate() != null
                && day.getPlannedDate().isBefore(target.start()) && !day.getPlannedDate().isBefore(today.minusDays(RECENT_DAYS))
                && OPEN.contains(day.getStatus())).toList();

        Map<String, Object> goalData = new LinkedHashMap<>();
        goalData.put("title", goalTitle);
        goalData.put("why", CoachText.clip(goal.getWhy(), MAX_LINE_LENGTH));
        titles.add(CoachText.clip(goal.getWhy(), MAX_LINE_LENGTH));
        goalData.put("kind", goal.getKind().name());
        goalData.put("type", goal.getType() == null ? null : goal.getType().name());
        goalData.put("start", goal.getStartDate().toString());
        goalData.put("end", goal.getEndDate().toString());
        goalData.put("linkedDays", linked.size());
        goalData.put("linkedDone", linkedDone);
        data.put("goal", goalData);
        long daysLeft = ChronoUnit.DAYS.between(today.isBefore(goal.getStartDate()) ? goal.getStartDate() : today,
                goal.getEndDate()) + 1;
        evidence.put("GOAL_PROGRESS", "'" + goalTitle + "' 연결 Day " + linked.size() + "개 중 " + linkedDone
                + "개 완료 · 목표 기간 끝까지 " + daysLeft + "일");
        long targetDone = inTarget.stream().filter(day -> day.getStatus() == DayStatus.DONE).count();
        evidence.put("PLANNED_DAYS", "이 기간에 목표와 연결된 Day " + inTarget.size() + "개 (완료 " + targetDone + "개)");
        if (!undated.isEmpty()) {
            evidence.put("UNDATED_DAYS", "날짜를 정하지 않은 연결 Day " + undated.size() + "개");
        }
        if (!earlier.isEmpty()) {
            evidence.put("EARLIER_OPEN_DAYS", "이 기간 전 날짜에 미완료로 남은 연결 Day " + earlier.size() + "개");
        }

        Map<String, DayOption> dayOptions = new LinkedHashMap<>();
        List<Map<String, Object>> dayData = new ArrayList<>();
        addDays(dayOptions, dayData, titles, inTarget.stream().limit(MAX_TARGET_DAYS).toList(), "IN_PERIOD", linkedSchedules,
                plannable, goal);
        addDays(dayOptions, dayData, titles, undated.stream().limit(MAX_UNDATED_DAYS).toList(), "UNDATED", linkedSchedules,
                plannable, goal);
        addDays(dayOptions, dayData, titles, earlier.stream().limit(MAX_EARLIER_DAYS).toList(), "BEFORE_PERIOD",
                linkedSchedules, plannable, goal);
        data.put("days", dayData);

        // Capacity per plannable date: every open Day of the user (any Goal), placements, overlaps, Events.
        List<Day> planned = plannable.isEmpty() ? List.of()
                : days.findByUserIdAndPlannedDateBetween(userId, planStart, target.end()).stream()
                        .filter(day -> OPEN.contains(day.getStatus())).toList();
        Map<UUID, DaySchedule> plannedSchedules = schedulesOf(planned);
        List<EventOccurrenceResponse> occurrences = plannable.isEmpty() ? List.of()
                : eventService.occurrences(planStart, target.end(), null, null);
        List<Map<String, Object>> dateData = new ArrayList<>();
        for (LocalDate date : plannable) {
            List<Day> onDate = planned.stream().filter(day -> date.equals(day.getPlannedDate())).toList();
            List<DaySchedule> placements = onDate.stream().map(day -> plannedSchedules.get(day.getId()))
                    .filter(schedule -> schedule != null).toList();
            long scheduledMinutes = placements.stream().mapToLong(PlanningCoachContextService::minutes).sum();
            long overbooked = TodayWorkload.calculate(placements.stream()
                    .map(schedule -> new TodayWorkload.Placement(null, schedule.getStartAt(), schedule.getEndAt())).toList())
                    .overbookedMinutes();
            long evening = placements.stream()
                    .filter(schedule -> bucketOf(schedule) == TimeBucket.EVENING || bucketOf(schedule) == TimeBucket.LATE_NIGHT)
                    .count();
            long eventMinutes = occurrences.stream().filter(occurrence -> !occurrence.allDay() && occurrence.startAt() != null
                            && occurrence.startAt().toLocalDate().equals(date))
                    .mapToLong(occurrence -> Duration.between(occurrence.startAt(), occurrence.endAt()).toMinutes()).sum();
            long allDayEvents = occurrences.stream().filter(occurrence -> occurrence.allDay() && occurrence.startDate() != null
                    && !date.isBefore(occurrence.startDate()) && date.isBefore(occurrence.endDateExclusive())).count();
            String key = loadKey(date);
            StringBuilder label = new StringBuilder(dateLabel(date) + " 남은 Day " + onDate.size() + "개");
            if (scheduledMinutes > 0) {
                label.append(" · 시간 배치 ").append(duration(scheduledMinutes));
            }
            if (overbooked > 0) {
                label.append(" · 겹침 ").append(duration(overbooked));
            }
            if (evening > 0) {
                label.append(" · 저녁 이후 배치 ").append(evening).append("개");
            }
            if (eventMinutes > 0) {
                label.append(" · 일정 ").append(duration(eventMinutes));
            }
            if (allDayEvents > 0) {
                label.append(" · 종일 일정 ").append(allDayEvents).append("개");
            }
            evidence.put(key, label.toString());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", date.toString());
            item.put("weekday", date.getDayOfWeek().name());
            item.put("openDays", onDate.size());
            item.put("coreDays", onDate.stream().filter(Day::isCoreDay).count());
            item.put("highPriorityDays", onDate.stream().filter(day -> day.getPriority() == DayPriority.HIGH).count());
            item.put("scheduledMinutes", scheduledMinutes);
            item.put("overlappingMinutes", overbooked);
            item.put("eveningOrLaterPlacements", evening);
            item.put("eventBusyMinutes", eventMinutes);
            item.put("allDayEvents", allDayEvents);
            item.put("evidenceKey", key);
            dateData.add(item);
        }
        data.put("dates", dateData);
        data.put("availabilityNote", "사용자의 하루 가용 시간 설정은 없어요. 날짜끼리 상대적으로 비교만 할 수 있어요.");

        // Recent behavior (last 14 days, all Days of the user).
        LocalDate recentFrom = today.minusDays(RECENT_DAYS);
        LocalDate recentTo = today.minusDays(1);
        List<Day> recentDays = days.findByUserIdAndPlannedDateBetween(userId, recentFrom, recentTo);
        Map<UUID, DaySchedule> recentSchedules = schedulesOf(recentDays);
        ReviewMetrics.Result recent = ReviewMetrics.analyze(ReviewType.DAY, recentFrom, recentTo, recentDays.stream()
                .map(day -> {
                    DaySchedule schedule = recentSchedules.get(day.getId());
                    return new DayInput(day.getId(), day.getTitle(), day.getStatus(), day.getPriority(), day.isCoreDay(),
                            day.getGoalId(), day.getPlannedDate(), day.getCarriedFromDayId() != null,
                            schedule == null ? null : schedule.getStartAt(), schedule == null ? null : schedule.getEndAt(),
                            schedule == null ? null : schedule.zoneId());
                }).toList());
        Map<String, Object> recentData = new LinkedHashMap<>();
        recentData.put("from", recentFrom.toString());
        recentData.put("to", recentTo.toString());
        recentData.put("total", recent.all().total());
        recentData.put("done", recent.all().done());
        recentData.put("overbookedMinutes", recent.schedule().overbookedMinutes());
        if (recent.all().total() > 0) {
            evidence.put("RECENT_COMPLETION", "최근 " + RECENT_DAYS + "일 계획한 Day " + (recent.all().total() - recent.all().skipped())
                    + "개 중 " + recent.all().done() + "개 완료");
        }
        List<Map<String, Object>> buckets = new ArrayList<>();
        boolean anyPattern = false;
        for (TimeBucket bucket : TimeBucket.values()) {
            Counts counts = recent.timeOfDay().get(bucket);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("bucket", bucket.name());
            item.put("placed", counts.total() - counts.skipped());
            item.put("done", counts.done());
            item.put("enoughSample", counts.enoughForPattern());
            if (counts.enoughForPattern()) {
                anyPattern = true;
                String key = "RECENT_TIME_" + bucket.name();
                evidence.put(key, "최근 " + RECENT_DAYS + "일 " + bucket.label() + "에 배치된 Day " + (counts.total() - counts.skipped())
                        + "개 중 " + counts.done() + "개 완료");
                item.put("evidenceKey", key);
            }
            buckets.add(item);
        }
        if (!anyPattern && recent.all().total() > 0) {
            evidence.put("RECENT_PATTERN_LIMITED", "최근 기록에서 시간대마다 배치된 Day가 " + ReviewMetrics.MIN_PATTERN_SAMPLE
                    + "개 미만이라 시간대 패턴은 판단하기 어려워요");
        }
        if (recent.schedule().overbookedMinutes() > 0) {
            evidence.put("RECENT_OVERBOOKED", "최근 " + RECENT_DAYS + "일 일정이 겹쳐 넘친 시간 " + duration(recent.schedule().overbookedMinutes()));
        }
        recentData.put("timeOfDay", buckets);
        data.put("recent", recentData);

        // Previous Review TRY lines (nearest WEEK, then MONTH, then DAY review).
        Map<String, String> tryLines = new LinkedHashMap<>();
        List<Map<String, Object>> tryData = new ArrayList<>();
        addTries(tryLines, tryData, evidence, titles, userId, ReviewType.WEEK, target.start().minusDays(1),
                target.start().minusDays(21));
        addTries(tryLines, tryData, evidence, titles, userId, ReviewType.MONTH, target.start().minusDays(1),
                target.start().minusDays(62));
        addTries(tryLines, tryData, evidence, titles, userId, ReviewType.DAY, today, today.minusDays(7));
        data.put("previousTry", tryData);

        // Recent Recovery decisions.
        Map<RecoveryAction, Integer> actions = new EnumMap<>(RecoveryAction.class);
        for (RecoveryEvent event : recoveryEvents.findByUserIdAndLocalDateBetween(userId, recentFrom, today)) {
            for (RecoveryEventItem item : event.getItems()) {
                actions.merge(item.getAction(), 1, Integer::sum);
            }
        }
        int decisions = actions.values().stream().mapToInt(Integer::intValue).sum();
        if (decisions > 0) {
            evidence.put("RECOVERY_RECENT", "최근 " + RECENT_DAYS + "일 Recovery 정리 " + decisions + "건 (" + actions.entrySet().stream()
                    .map(entry -> ACTION_LABEL.get(entry.getKey()) + " " + entry.getValue()).collect(Collectors.joining(" · ")) + ")");
        }
        Map<String, Integer> actionData = new LinkedHashMap<>();
        actions.forEach((action, count) -> actionData.put(action.name(), count));
        data.put("recoveryRecent", actionData);

        data.put("evidence", evidence.entrySet().stream().map(entry -> {
            Map<String, String> item = new LinkedHashMap<>();
            item.put("key", entry.getKey());
            item.put("label", entry.getValue());
            return item;
        }).toList());

        List<String> factKeys = evidence.keySet().stream()
                .filter(key -> !key.startsWith("LOAD_") && !key.startsWith("PREVIOUS_TRY_")).limit(6).toList();
        return new PlanningCoachContext(goal.getId(), goalTitle, target.start(), target.end(), plannable, data, dayOptions,
                evidence, tryLines, titles, factKeys);
    }

    private void addDays(Map<String, DayOption> options, List<Map<String, Object>> out, List<String> titles, List<Day> list,
            String placement, Map<UUID, DaySchedule> scheduleByDay, Set<LocalDate> plannable, Goal goal) {
        for (Day day : list) {
            String ref = "D" + (options.size() + 1);
            String title = CoachText.clip(day.getTitle(), MAX_TITLE_LENGTH);
            titles.add(title);
            boolean finished = !OPEN.contains(day.getStatus());
            DaySchedule schedule = scheduleByDay.get(day.getId());
            LocalTime start = schedule == null ? null : schedule.getStartAt().atZone(schedule.zoneId()).toLocalTime();
            long duration = schedule == null ? 0 : minutes(schedule);
            Set<LocalDate> dateOptions = new LinkedHashSet<>();
            if (!finished) {
                for (LocalDate date : plannable) {
                    if (goal.contains(date) && !date.equals(day.getPlannedDate())) {
                        dateOptions.add(date);
                    }
                }
            }
            options.put(ref, new DayOption(day.getId(), title, finished, day.getPriority(), day.getPlannedDate(), dateOptions,
                    start, duration));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("ref", ref);
            item.put("title", title);
            item.put("placement", placement);
            item.put("status", day.getStatus().name());
            item.put("finished", finished);
            item.put("priority", day.getPriority().name());
            item.put("core", day.isCoreDay());
            item.put("plannedDate", day.getPlannedDate() == null ? null : day.getPlannedDate().toString());
            item.put("startTime", start == null ? null : TIME.format(start));
            item.put("scheduledMinutes", schedule == null ? null : duration);
            item.put("timeBucket", schedule == null ? null : bucketOf(schedule).name());
            item.put("dateOptions", dateOptions.stream().map(LocalDate::toString).toList());
            item.put("canReschedule", !finished && schedule != null && !plannable.isEmpty());
            out.add(item);
        }
    }

    private void addTries(Map<String, String> tryLines, List<Map<String, Object>> out, Map<String, String> evidence,
            List<String> titles, UUID userId, ReviewType type, LocalDate latestStart, LocalDate earliestStart) {
        if (tryLines.size() >= MAX_TRY_LINES) {
            return;
        }
        Review review = reviews.findFirstByUserIdAndTypeAndPeriodStartLessThanEqualOrderByPeriodStartDesc(userId, type, latestStart)
                .filter(found -> !found.getPeriodStart().isBefore(earliestStart)).orElse(null);
        if (review == null) {
            return;
        }
        review.getItems().stream().filter(item -> item.getKind() == ReviewItemKind.TRY).forEach(item -> {
            if (tryLines.size() >= MAX_TRY_LINES) {
                return;
            }
            String key = "PREVIOUS_TRY_" + (tryLines.size() + 1);
            String line = CoachText.clip(item.getContent(), MAX_LINE_LENGTH);
            tryLines.put(key, line);
            titles.add(line);
            evidence.put(key, "지난 " + REVIEW_LABEL.get(type) + " 회고 TRY: '" + line + "'");
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("key", key);
            data.put("reviewType", type.name());
            data.put("periodStart", review.getPeriodStart().toString());
            data.put("text", line);
            out.add(data);
        });
    }

    private Map<UUID, DaySchedule> schedulesOf(List<Day> list) {
        if (list.isEmpty()) {
            return Map.of();
        }
        Map<UUID, DaySchedule> result = new HashMap<>();
        List<UUID> ids = list.stream().map(Day::getId).toList();
        for (int from = 0; from < ids.size(); from += 500) {
            schedules.findByDayIdIn(ids.subList(from, Math.min(ids.size(), from + 500)))
                    .forEach(schedule -> result.put(schedule.getDayId(), schedule));
        }
        return result;
    }

    private static TimeBucket bucketOf(DaySchedule schedule) {
        int hour = schedule.getStartAt().atZone(schedule.zoneId()).getHour();
        if (hour >= 5 && hour < 12) {
            return TimeBucket.MORNING;
        }
        if (hour >= 12 && hour < 18) {
            return TimeBucket.AFTERNOON;
        }
        return hour >= 18 && hour < 22 ? TimeBucket.EVENING : TimeBucket.LATE_NIGHT;
    }

    private static long minutes(DaySchedule schedule) {
        return Math.max(0, Duration.between(schedule.getStartAt(), schedule.getEndAt()).toMinutes());
    }

    static String loadKey(LocalDate date) {
        return "LOAD_" + date.toString().replace("-", "_");
    }

    static String dateLabel(LocalDate date) {
        return date.getMonthValue() + "월 " + date.getDayOfMonth() + "일("
                + date.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.KOREAN) + ")";
    }

    static String duration(long minutes) {
        long hours = minutes / 60;
        long rest = minutes % 60;
        if (hours == 0) {
            return rest + "분";
        }
        return rest == 0 ? hours + "시간" : hours + "시간 " + rest + "분";
    }
}
