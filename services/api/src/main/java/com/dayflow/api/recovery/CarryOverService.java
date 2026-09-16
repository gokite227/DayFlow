package com.dayflow.api.recovery;

import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.day.Day;
import com.dayflow.api.day.DayDtos.DayResponse;
import com.dayflow.api.day.DayRepository;
import com.dayflow.api.day.DayScheduleRepository;
import com.dayflow.api.day.DayService;
import com.dayflow.api.day.DayStatus;
import com.dayflow.api.goal.Goal;
import com.dayflow.api.goal.GoalDtos.GoalResponse;
import com.dayflow.api.goal.GoalPeriods;
import com.dayflow.api.goal.GoalRepository;
import com.dayflow.api.goal.GoalService;
import com.dayflow.api.goal.GoalType;
import com.dayflow.api.recovery.CarryOverDtos.ApplyCarryOverRequest;
import com.dayflow.api.recovery.CarryOverDtos.ApplyCarryOverResponse;
import com.dayflow.api.recovery.CarryOverDtos.CarriedDayResponse;
import com.dayflow.api.recovery.CarryOverDtos.CarryOverDayExclusion;
import com.dayflow.api.recovery.CarryOverDtos.CarryOverDayPreview;
import com.dayflow.api.recovery.CarryOverDtos.CarryOverLevelAction;
import com.dayflow.api.recovery.CarryOverDtos.CarryOverLevelChoice;
import com.dayflow.api.recovery.CarryOverDtos.CarryOverLevelPreview;
import com.dayflow.api.recovery.CarryOverDtos.CarryOverMode;
import com.dayflow.api.recovery.CarryOverDtos.CarryOverPreviewRequest;
import com.dayflow.api.recovery.CarryOverDtos.CarryOverPreviewResponse;
import com.dayflow.api.recovery.RecoveryDtos.VersionedIdRequest;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * REC-003 / REC-004 Carry Over. The source Day and its Goals are never changed: new Goals (only for the
 * levels whose period changes, and only when no existing Goal fits) and new Days are created in the target
 * period, each pointing back at what it continues. Preview reads only; apply recomputes the same plan,
 * checks every previewed version and writes everything in one transaction.
 */
@Service
@Transactional
public class CarryOverService {

    private static final Set<DayStatus> FINISHED = Set.of(DayStatus.DONE, DayStatus.SKIPPED);
    private static final List<GoalType> LEVELS = List.of(GoalType.YEAR, GoalType.QUARTER, GoalType.MONTH, GoalType.WEEK);

    private final DayRepository days;
    private final DayScheduleRepository schedules;
    private final GoalRepository goals;
    private final GoalService goalService;
    private final DayService dayService;
    private final RecoveryEventRepository events;

    public CarryOverService(DayRepository days, DayScheduleRepository schedules, GoalRepository goals,
            GoalService goalService, DayService dayService, RecoveryEventRepository events) {
        this.days = days;
        this.schedules = schedules;
        this.goals = goals;
        this.goalService = goalService;
        this.dayService = dayService;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public CarryOverPreviewResponse preview(CarryOverPreviewRequest request) {
        return plan(request.localDate(), request.sourceDayId(), request.targetDate(), request.mode(),
                request.targetWeekGoalId(), request.levels(), request.dayIds()).toResponse();
    }

    public ApplyCarryOverResponse apply(ApplyCarryOverRequest request) {
        List<UUID> dayIds = request.days().stream().map(VersionedIdRequest::id).toList();
        Plan plan = plan(request.localDate(), request.sourceDayId(), request.targetDate(), request.mode(),
                request.targetWeekGoalId(), request.levels(), dayIds);

        // A change after the preview is a conflict, checked before anything is written.
        Set<UUID> referenced = new LinkedHashSet<>(dayIds);
        if (!referenced.containsAll(plan.selectedIds)) {
            throw invalid("days", "Send every carried Day, the source Day included, with its previewed version.");
        }
        for (VersionedIdRequest ref : request.days()) {
            Day day = plan.dayById.get(ref.id());
            if (day == null || !Objects.equals(day.getVersion(), ref.version())) {
                throw staleConflict("days");
            }
        }
        Map<UUID, Long> goalVersions = new HashMap<>();
        if (request.goals() != null) {
            for (VersionedIdRequest ref : request.goals()) {
                Goal goal = goals.findById(ref.id()).orElseThrow(() -> staleConflict("goals"));
                if (!Objects.equals(goal.getVersion(), ref.version())) {
                    throw staleConflict("goals");
                }
                goalVersions.put(ref.id(), ref.version());
            }
        }
        if (request.mode() == CarryOverMode.WITH_PLAN
                && !plan.sourcePath.stream().allMatch(goal -> goalVersions.containsKey(goal.getId()))) {
            throw invalid("goals", "Send the source Goal path with the versions seen in the preview.");
        }
        if (!plan.ready) {
            throw invalid(request.mode() == CarryOverMode.WITH_PLAN ? "levels" : "targetWeekGoalId",
                    "Choose which Goal the plan continues under before applying.");
        }

        List<GoalResponse> createdGoals = new ArrayList<>();
        UUID weekGoalId = switch (request.mode()) {
            case WITHOUT_GOAL -> null;
            case DAY_ONLY -> plan.targetWeekGoalId;
            case WITH_PLAN -> {
                UUID parentId = null;
                for (Level level : plan.levels) {
                    if (level.action == CarryOverLevelAction.CREATE) {
                        Goal created = goalService.createContinuation(level.template,
                                level.sourceGoal == null ? null : level.sourceGoal.getId(),
                                level.type, parentId, level.startDate, level.endDate);
                        createdGoals.add(GoalResponse.from(created));
                        parentId = created.getId();
                    } else {
                        parentId = level.goal.getId();
                    }
                }
                yield parentId;
            }
        };

        RecoveryEvent event = new RecoveryEvent(request.localDate());
        List<CarriedDayResponse> carried = new ArrayList<>();
        for (Day source : plan.selectedDays()) {
            DayResponse destination = dayService.createCarriedOver(source, weekGoalId, request.targetDate());
            // The source keeps its date and status; its current state is recorded as handled (REC-005).
            String state = RecoveryPlanningState.of(source, schedules.findByDayId(source.getId()).orElse(null));
            event.addItem(new RecoveryEventItem(source.getId(), source.getTitle(), RecoveryAction.CARRY_OVER,
                    source.getStatus(), source.getStatus(), source.getPlannedDate(), source.getPlannedDate(),
                    source.getEstimatedMinutes(), source.getEstimatedMinutes(), destination.id(), state));
            carried.add(new CarriedDayResponse(dayService.get(source.getId()), destination));
        }
        RecoveryEvent saved = events.saveAndFlush(event);
        return new ApplyCarryOverResponse(saved.getId(), saved.getAppliedAt(), createdGoals, carried);
    }

    private Plan plan(LocalDate today, UUID sourceDayId, LocalDate targetDate, CarryOverMode mode,
            UUID chosenWeekGoalId, List<CarryOverLevelChoice> levelChoices, List<UUID> dayIds) {
        Day source = days.findById(sourceDayId)
                .orElseThrow(() -> new ApiException(ErrorCode.DAY_NOT_FOUND,
                        "Day " + sourceDayId + " was not found.", "sourceDayId"));
        if (FINISHED.contains(source.getStatus())) {
            throw invalid("sourceDayId", "Only unfinished Days can be carried over.");
        }
        if (source.getGoalId() == null) {
            throw invalid("sourceDayId", "A Day without a Goal is moved with MOVE to today or a later date.");
        }
        if (days.existsByCarriedFromDayId(source.getId())) {
            throw new ApiException(ErrorCode.ALREADY_CARRIED_OVER,
                    "This Day was already carried over to a later plan.", "sourceDayId");
        }
        Goal week = goals.findById(source.getGoalId()).orElseThrow();
        if (targetDate.isBefore(today)) {
            throw invalid("targetDate", "Carry the plan over to today or a later date.");
        }
        if (week.contains(targetDate)) {
            throw invalid("targetDate", "Inside the same WEEK Goal the Day is moved with MOVE.");
        }

        Plan plan = new Plan(mode, targetDate, source, pathOf(week));
        plan.addDays(mode == CarryOverMode.WITH_PLAN
                ? days.findByGoalIdOrderByPlannedDateAscCreatedAtAsc(week.getId())
                : List.of(source), dayIds);
        plan.targetWeekGoals = goals.findByTypeAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByCreatedAt(
                GoalType.WEEK, targetDate, targetDate);

        switch (mode) {
            case WITHOUT_GOAL -> plan.ready = true;
            case DAY_ONLY -> {
                if (chosenWeekGoalId != null) {
                    if (plan.targetWeekGoals.stream().noneMatch(goal -> goal.getId().equals(chosenWeekGoalId))) {
                        throw invalid("targetWeekGoalId", "Choose a WEEK Goal that contains the target date.");
                    }
                    plan.targetWeekGoalId = chosenWeekGoalId;
                } else if (plan.targetWeekGoals.size() == 1) {
                    plan.targetWeekGoalId = plan.targetWeekGoals.get(0).getId();
                }
                plan.ready = plan.targetWeekGoalId != null;
            }
            case WITH_PLAN -> resolveLevels(plan, week, levelChoices);
        }
        return plan;
    }

    /**
     * REC-004 Goal continuation, from YEAR down to WEEK. A level whose target period equals the source
     * Goal's period keeps that Goal. Otherwise an existing Goal of the target period under the resolved
     * parent is reused (the user's choice first, then the one continuing the source Goal, then a single
     * candidate); with no candidate a new Goal is proposed; with several the user has to choose.
     * Titles alone never decide a match.
     */
    private void resolveLevels(Plan plan, Goal week, List<CarryOverLevelChoice> levelChoices) {
        Map<GoalType, CarryOverLevelChoice> choices = new EnumMap<>(GoalType.class);
        if (levelChoices != null) {
            levelChoices.forEach(choice -> choices.put(choice.type(), choice));
        }
        Map<GoalType, Goal> sourceByType = new EnumMap<>(GoalType.class);
        plan.sourcePath.forEach(goal -> sourceByType.put(goal.getType(), goal));

        Goal parent = null;
        boolean parentExists = true;
        plan.ready = true;
        for (GoalType type : LEVELS) {
            LocalDate[] period = GoalPeriods.containing(type, plan.targetDate);
            Goal sourceGoal = sourceByType.get(type);
            Level level = new Level(type, period[0], period[1], sourceGoal, sourceByType.getOrDefault(type, week));

            boolean samePeriod = sourceGoal != null && sourceGoal.getStartDate().equals(period[0])
                    && sourceGoal.getEndDate().equals(period[1])
                    && (type == GoalType.YEAR || (parent != null && parent.getId().equals(sourceGoal.getParentGoalId())));
            if (samePeriod) {
                level.action = CarryOverLevelAction.KEEP_SOURCE;
                level.goal = sourceGoal;
                parent = sourceGoal;
                parentExists = true;
                plan.levels.add(level);
                continue;
            }

            Goal resolvedParent = parent;
            level.candidates = !parentExists ? List.of()
                    : goals.findByTypeAndStartDateAndEndDateOrderByCreatedAt(type, period[0], period[1]).stream()
                            .filter(goal -> type == GoalType.YEAR
                                    || (resolvedParent != null && resolvedParent.getId().equals(goal.getParentGoalId())))
                            .toList();

            CarryOverLevelChoice choice = choices.get(type);
            if (choice != null && choice.create()) {
                level.action = CarryOverLevelAction.CREATE;
            } else if (choice != null && choice.goalId() != null) {
                level.goal = level.candidates.stream().filter(goal -> goal.getId().equals(choice.goalId())).findFirst()
                        .orElseThrow(() -> invalid("levels", "The chosen " + type + " Goal does not fit the target date."));
                level.action = CarryOverLevelAction.REUSE;
            } else {
                List<Goal> continuing = level.candidates.stream()
                        .filter(goal -> sourceGoal != null && sourceGoal.getId().equals(goal.getContinuedFromGoalId()))
                        .toList();
                if (continuing.size() == 1) {
                    level.goal = continuing.get(0);
                    level.action = CarryOverLevelAction.REUSE;
                } else if (level.candidates.size() == 1) {
                    level.goal = level.candidates.get(0);
                    level.action = CarryOverLevelAction.REUSE;
                } else if (level.candidates.isEmpty()) {
                    level.action = CarryOverLevelAction.CREATE;
                } else {
                    level.action = CarryOverLevelAction.CHOOSE;
                    plan.ready = false;
                }
            }

            if (level.action == CarryOverLevelAction.REUSE) {
                parent = level.goal;
                parentExists = true;
            } else {
                parent = null;
                parentExists = false;
            }
            plan.levels.add(level);
        }
    }

    /** YEAR → WEEK Goals above a WEEK Goal, following parent links. */
    private List<Goal> pathOf(Goal week) {
        List<Goal> path = new ArrayList<>();
        Goal current = week;
        while (current != null && path.size() < LEVELS.size()) {
            path.add(0, current);
            current = current.getParentGoalId() == null ? null : goals.findById(current.getParentGoalId()).orElse(null);
        }
        return path;
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(ErrorCode.INVALID_RECOVERY_DECISION, message, field);
    }

    private static ApiException staleConflict(String field) {
        return new ApiException(ErrorCode.VERSION_CONFLICT,
                "The plan changed after the preview. Reload and try again; nothing was applied.", field);
    }

    private static final class Level {
        final GoalType type;
        final LocalDate startDate;
        final LocalDate endDate;
        final Goal sourceGoal;
        /** The Goal whose title, why, priority and policy a CREATE copies. */
        final Goal template;
        CarryOverLevelAction action;
        Goal goal;
        List<Goal> candidates = List.of();

        Level(GoalType type, LocalDate startDate, LocalDate endDate, Goal sourceGoal, Goal template) {
            this.type = type;
            this.startDate = startDate;
            this.endDate = endDate;
            this.sourceGoal = sourceGoal;
            this.template = template;
        }

        CarryOverLevelPreview toPreview() {
            return new CarryOverLevelPreview(type, startDate, endDate,
                    sourceGoal == null ? null : GoalResponse.from(sourceGoal), action,
                    goal == null ? null : GoalResponse.from(goal),
                    candidates.stream().map(GoalResponse::from).toList(),
                    action == CarryOverLevelAction.CREATE ? template.getTitle() : null);
        }
    }

    private final class Plan {
        final CarryOverMode mode;
        final LocalDate targetDate;
        final Day source;
        final List<Goal> sourcePath;
        final List<Level> levels = new ArrayList<>();
        final List<Day> listedDays = new ArrayList<>();
        final Map<UUID, Day> dayById = new HashMap<>();
        final Map<UUID, CarryOverDayExclusion> exclusions = new HashMap<>();
        final Set<UUID> selectedIds = new LinkedHashSet<>();
        List<Goal> targetWeekGoals = List.of();
        UUID targetWeekGoalId;
        boolean ready;

        Plan(CarryOverMode mode, LocalDate targetDate, Day source, List<Goal> sourcePath) {
            this.mode = mode;
            this.targetDate = targetDate;
            this.source = source;
            this.sourcePath = sourcePath;
        }

        /** The source Day is always carried; other Days of the WEEK Goal only when the user selects them. */
        void addDays(List<Day> candidates, List<UUID> requestedIds) {
            listedDays.add(source);
            candidates.stream().filter(day -> !day.getId().equals(source.getId())).forEach(listedDays::add);
            for (Day day : listedDays) {
                dayById.put(day.getId(), day);
                if (FINISHED.contains(day.getStatus())) {
                    exclusions.put(day.getId(), CarryOverDayExclusion.FINISHED);
                } else if (!day.getId().equals(source.getId()) && days.existsByCarriedFromDayId(day.getId())) {
                    exclusions.put(day.getId(), CarryOverDayExclusion.ALREADY_CARRIED);
                }
            }
            selectedIds.add(source.getId());
            if (requestedIds != null) {
                for (UUID id : requestedIds) {
                    if (!dayById.containsKey(id) || exclusions.containsKey(id)) {
                        throw invalid("dayIds", "Only unfinished Days of the same WEEK Goal that were not carried over yet can be selected.");
                    }
                    selectedIds.add(id);
                }
            }
        }

        List<Day> selectedDays() {
            return selectedIds.stream().map(dayById::get).toList();
        }

        CarryOverPreviewResponse toResponse() {
            List<CarryOverDayPreview> dayPreviews = listedDays.stream()
                    .map(day -> new CarryOverDayPreview(dayService.get(day.getId()), selectedIds.contains(day.getId()),
                            !exclusions.containsKey(day.getId()), exclusions.get(day.getId())))
                    .toList();
            return new CarryOverPreviewResponse(targetDate, mode, dayService.get(source.getId()),
                    sourcePath.stream().map(GoalResponse::from).toList(),
                    targetWeekGoals.stream().map(GoalResponse::from).toList(),
                    mode == CarryOverMode.DAY_ONLY ? targetWeekGoalId : null,
                    levels.stream().map(Level::toPreview).toList(), dayPreviews, ready);
        }
    }
}
