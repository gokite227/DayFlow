package com.dayflow.api.ai.recovery;

import com.dayflow.api.ai.CoachText;
import com.dayflow.api.ai.recovery.RecoveryCoachContext.Candidate;
import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.day.Day;
import com.dayflow.api.day.DayDtos.DayResponse;
import com.dayflow.api.day.DayPriority;
import com.dayflow.api.day.DayRepository;
import com.dayflow.api.day.DaySchedule;
import com.dayflow.api.day.DayScheduleRepository;
import com.dayflow.api.day.DayStatus;
import com.dayflow.api.goal.Goal;
import com.dayflow.api.goal.GoalRepository;
import com.dayflow.api.goal.GoalType;
import com.dayflow.api.recovery.RecoveryAction;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryCandidateReason;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryCandidateResponse;
import com.dayflow.api.recovery.RecoveryEventItem;
import com.dayflow.api.recovery.RecoveryEventRepository;
import com.dayflow.api.recovery.RecoveryService;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the Recovery Coach context in one read-only transaction: the current Recovery candidates (same rule as the
 * Recovery screen), what the domain allows for each, the dates a MOVE or CARRY_OVER may use with their load, and
 * earlier Recovery decisions. The model only picks among these; it never computes dates or counts.
 *
 * <p>Domain rules mirrored here (not changed): MOVE goes to today or later inside the Day's WEEK/PERIOD Goal (any
 * later date without a Goal); CARRY_OVER only continues an unfinished Day of a CALENDAR WEEK Goal that was not
 * carried yet, to a date outside that week; REDUCE needs an estimate that can still get smaller; DROP sets SKIPPED.
 */
@Service
public class RecoveryCoachContextService {

    /** Candidates looked at in detail; the rest are only counted. */
    static final int MAX_CANDIDATES = 8;
    /** Dates offered for MOVE / CARRY_OVER: today and the next days. */
    static final int DATE_WINDOW_DAYS = 7;
    static final int MAX_TITLE_LENGTH = 80;

    private static final Set<DayStatus> OPEN = Set.of(DayStatus.NOT_STARTED, DayStatus.IN_PROGRESS, DayStatus.DEFERRED);
    static final Map<RecoveryAction, String> ACTION_LABEL = Map.of(
            RecoveryAction.KEEP, "그대로 두기", RecoveryAction.REDUCE, "작게 줄이기", RecoveryAction.MOVE, "날짜 바꾸기",
            RecoveryAction.CARRY_OVER, "다음 계획으로 이어가기", RecoveryAction.DROP, "이번에는 내려놓기");
    static final Map<DayPriority, String> PRIORITY_LABEL = Map.of(
            DayPriority.NONE, "우선순위 없음", DayPriority.LOW, "우선순위 낮음", DayPriority.MEDIUM, "우선순위 보통",
            DayPriority.HIGH, "우선순위 높음");

    private final RecoveryService recoveryService;
    private final DayRepository days;
    private final DayScheduleRepository schedules;
    private final GoalRepository goals;
    private final RecoveryEventRepository events;
    private final CurrentUser currentUser;

    public RecoveryCoachContextService(RecoveryService recoveryService, DayRepository days,
            DayScheduleRepository schedules, GoalRepository goals, RecoveryEventRepository events,
            CurrentUser currentUser) {
        this.recoveryService = recoveryService;
        this.days = days;
        this.schedules = schedules;
        this.goals = goals;
        this.events = events;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public RecoveryCoachContext build(LocalDate today, Instant now) {
        UUID userId = currentUser.id();
        List<RecoveryCandidateResponse> all = recoveryService.candidates(today, now);
        List<RecoveryCandidateResponse> detailed = all.stream().limit(MAX_CANDIDATES).toList();
        Set<UUID> dayIds = detailed.stream().map(candidate -> candidate.day().id()).collect(Collectors.toSet());
        Set<UUID> goalIds = detailed.stream().map(candidate -> candidate.day().goalId()).filter(id -> id != null)
                .collect(Collectors.toSet());
        Map<UUID, Goal> goalById = goalIds.isEmpty() ? Map.of() : goals.findByUserIdAndIdIn(userId, goalIds).stream()
                .collect(Collectors.toMap(Goal::getId, Function.identity()));

        Map<UUID, Map<RecoveryAction, Integer>> history = new HashMap<>();
        if (!dayIds.isEmpty()) {
            for (RecoveryEventItem item : events.findItemsNewestFirst(userId, dayIds)) {
                history.computeIfAbsent(item.getDayId(), id -> new EnumMap<>(RecoveryAction.class))
                        .merge(item.getAction(), 1, Integer::sum);
            }
        }

        // Load of the dates a Day could go to (open Days planned there, their time placements).
        LocalDate windowEnd = today.plusDays(DATE_WINDOW_DAYS);
        List<Day> windowDays = days.findByUserIdAndPlannedDateBetween(userId, today, windowEnd).stream()
                .filter(day -> OPEN.contains(day.getStatus())).toList();
        Map<UUID, DaySchedule> scheduleByDay = windowDays.isEmpty() ? Map.of()
                : schedules.findByDayIdIn(windowDays.stream().map(Day::getId).toList()).stream()
                        .collect(Collectors.toMap(DaySchedule::getDayId, Function.identity()));

        Map<String, String> evidence = new LinkedHashMap<>();
        List<String> titles = new ArrayList<>();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("today", today.toString());
        data.put("candidateCount", all.size());
        data.put("reviewedCount", detailed.size());
        evidence.put("CANDIDATES", "정리할 Day " + all.size() + "개"
                + (all.size() > detailed.size() ? " (자세히 본 Day " + detailed.size() + "개)" : ""));

        List<Map<String, Object>> dateData = new ArrayList<>();
        for (LocalDate date = today; !date.isAfter(windowEnd); date = date.plusDays(1)) {
            LocalDate current = date;
            List<Day> planned = windowDays.stream().filter(day -> current.equals(day.getPlannedDate())).toList();
            long minutes = planned.stream().map(day -> scheduleByDay.get(day.getId())).filter(schedule -> schedule != null)
                    .mapToLong(schedule -> Duration.between(schedule.getStartAt(), schedule.getEndAt()).toMinutes()).sum();
            String key = loadKey(date);
            evidence.put(key, dateLabel(date) + " 남은 Day " + planned.size() + "개 · 시간 배치 " + duration(minutes));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", date.toString());
            item.put("weekday", date.getDayOfWeek().name());
            item.put("openDays", planned.size());
            item.put("coreOpenDays", planned.stream().filter(Day::isCoreDay).count());
            item.put("scheduledMinutes", minutes);
            item.put("evidenceKey", key);
            dateData.add(item);
        }
        data.put("dates", dateData);

        Map<String, Candidate> candidates = new LinkedHashMap<>();
        List<Map<String, Object>> candidateData = new ArrayList<>();
        for (RecoveryCandidateResponse candidate : detailed) {
            DayResponse day = candidate.day();
            String ref = "D" + (candidates.size() + 1);
            String title = CoachText.clip(day.title(), MAX_TITLE_LENGTH);
            titles.add(title);
            Goal goal = day.goalId() == null ? null : goalById.get(day.goalId());
            if (goal != null) {
                titles.add(CoachText.clip(goal.getTitle(), MAX_TITLE_LENGTH));
            }
            long overdueDays = ChronoUnit.DAYS.between(day.plannedDate(), today);
            Map<RecoveryAction, Integer> decisions = history.getOrDefault(day.id(), Map.of());
            int recoveryCount = decisions.values().stream().mapToInt(Integer::intValue).sum();
            boolean goalActive = goal != null && !goal.getEndDate().isBefore(today);

            // What the domain allows.
            Set<LocalDate> moveDates = new LinkedHashSet<>();
            LocalDate moveMin = goal == null || goal.getStartDate().isBefore(today) ? today : goal.getStartDate();
            LocalDate moveMax = goal == null ? windowEnd : goal.getEndDate().isBefore(windowEnd) ? goal.getEndDate() : windowEnd;
            for (LocalDate date = moveMin; !date.isAfter(moveMax); date = date.plusDays(1)) {
                if (!date.equals(day.plannedDate())) {
                    moveDates.add(date);
                }
            }
            Set<LocalDate> carryOverDates = new LinkedHashSet<>();
            boolean calendarWeek = goal != null && goal.isCalendar() && goal.getType() == GoalType.WEEK;
            if (calendarWeek && !days.existsByCarriedFromDayId(day.id())) {
                for (LocalDate date = today; !date.isAfter(windowEnd); date = date.plusDays(1)) {
                    if (!goal.contains(date)) {
                        carryOverDates.add(date);
                    }
                }
            }
            Set<RecoveryAction> allowed = EnumSet.of(RecoveryAction.KEEP, RecoveryAction.DROP);
            if (day.estimatedMinutes() >= 2) {
                allowed.add(RecoveryAction.REDUCE);
            }
            if (!moveDates.isEmpty()) {
                allowed.add(RecoveryAction.MOVE);
            }
            if (!carryOverDates.isEmpty()) {
                allowed.add(RecoveryAction.CARRY_OVER);
            }
            // Letting go is only supported for low-importance Days outside an active Goal that were already handled
            // before or are long overdue. The domain allows DROP for every unfinished Day; the Coach is stricter.
            boolean dropSupported = !day.coreDay()
                    && (day.priority() == DayPriority.NONE || day.priority() == DayPriority.LOW)
                    && !goalActive
                    && (recoveryCount >= 1 || overdueDays >= 7);

            Set<String> keys = new LinkedHashSet<>();
            String overdueKey = "OVERDUE_" + ref;
            evidence.put(overdueKey, candidate.reason() == RecoveryCandidateReason.TIME_PASSED
                    ? "'" + title + "' 오늘 계획한 시간이 지남"
                    : "'" + title + "' 계획일(" + dateLabel(day.plannedDate()) + ")에서 " + overdueDays + "일 지남");
            keys.add(overdueKey);
            String importanceKey = "IMPORTANCE_" + ref;
            evidence.put(importanceKey, "'" + title + "' " + (day.coreDay() ? "핵심 Day · " : "") + PRIORITY_LABEL.get(day.priority()));
            keys.add(importanceKey);
            String goalKey = "GOAL_" + ref;
            evidence.put(goalKey, goal == null ? "'" + title + "' 목표 연결 없음"
                    : "'" + title + "' → '" + CoachText.clip(goal.getTitle(), MAX_TITLE_LENGTH) + "' ("
                            + (goal.isPeriod() ? "기간 목표" : "주간 목표") + ", " + dateLabel(goal.getStartDate()) + "~"
                            + dateLabel(goal.getEndDate()) + (goalActive
                                    ? ", 오늘 포함 " + (ChronoUnit.DAYS.between(today, goal.getEndDate()) + 1) + "일 남음)"
                                    : ", 기간 끝남)"));
            keys.add(goalKey);
            if (recoveryCount > 0) {
                String historyKey = "HISTORY_" + ref;
                evidence.put(historyKey, "'" + title + "' 전에 " + recoveryCount + "번 다시 정리함 (" + decisions.entrySet().stream()
                        .map(entry -> ACTION_LABEL.get(entry.getKey()) + " " + entry.getValue())
                        .collect(Collectors.joining(" · ")) + ")");
                keys.add(historyKey);
            }

            candidates.put(ref, new Candidate(day.id(), title, allowed, moveDates, carryOverDates, dropSupported, keys));

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("ref", ref);
            item.put("title", title);
            item.put("reason", candidate.reason().name());
            item.put("plannedDate", day.plannedDate().toString());
            item.put("overdueDays", overdueDays);
            item.put("startTime", day.schedule() == null ? null : day.schedule().startAt().toLocalTime().toString());
            item.put("scheduledMinutes", day.schedule() == null ? null
                    : Duration.between(day.schedule().startAt(), day.schedule().endAt()).toMinutes());
            item.put("estimatedMinutes", day.estimatedMinutes());
            item.put("priority", day.priority().name());
            item.put("core", day.coreDay());
            if (goal != null) {
                Map<String, Object> goalData = new LinkedHashMap<>();
                goalData.put("title", CoachText.clip(goal.getTitle(), MAX_TITLE_LENGTH));
                goalData.put("kind", goal.getKind().name());
                goalData.put("type", goal.getType() == null ? null : goal.getType().name());
                goalData.put("start", goal.getStartDate().toString());
                goalData.put("end", goal.getEndDate().toString());
                goalData.put("active", goalActive);
                item.put("goal", goalData);
            } else {
                item.put("goal", null);
            }
            Map<String, Integer> decisionData = new LinkedHashMap<>();
            decisions.forEach((action, count) -> decisionData.put(action.name(), count));
            item.put("recoveryCount", recoveryCount);
            item.put("previousDecisions", decisionData);
            item.put("repeatedRecovery", recoveryCount >= 2);
            item.put("allowedActions", allowed.stream().map(Enum::name).toList());
            item.put("moveDates", moveDates.stream().map(LocalDate::toString).toList());
            item.put("carryOverDates", carryOverDates.stream().map(LocalDate::toString).toList());
            item.put("dropSupported", dropSupported);
            item.put("evidenceKeys", List.copyOf(keys));
            candidateData.add(item);
        }
        data.put("candidates", candidateData);
        data.put("evidence", evidence.entrySet().stream().map(entry -> {
            Map<String, String> item = new LinkedHashMap<>();
            item.put("key", entry.getKey());
            item.put("label", entry.getValue());
            return item;
        }).toList());

        return new RecoveryCoachContext(today, data, candidates, evidence, titles, all.size());
    }

    static String loadKey(LocalDate date) {
        return "LOAD_" + date.toString().replace("-", "_");
    }

    /** "9월 19일(금)" */
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
