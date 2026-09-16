package com.dayflow.api.day;

import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.day.DayDtos.CreateDayRequest;
import com.dayflow.api.day.DayDtos.DayResponse;
import com.dayflow.api.day.DayDtos.SetDayScheduleRequest;
import com.dayflow.api.day.DayDtos.UpdateDayRequest;
import com.dayflow.api.goal.Goal;
import com.dayflow.api.goal.GoalRepository;
import com.dayflow.api.goal.GoalType;
import jakarta.persistence.criteria.Predicate;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Server-side enforcement of the Day/DaySchedule rules in packages/domain (DAY-001, DAY-002). */
@Service
@Transactional
public class DayService {

    private final DayRepository days;
    private final DayScheduleRepository schedules;
    private final GoalRepository goals;
    private final DayTagService dayTags;

    public DayService(DayRepository days, DayScheduleRepository schedules, GoalRepository goals,
            DayTagService dayTags) {
        this.days = days;
        this.schedules = schedules;
        this.goals = goals;
        this.dayTags = dayTags;
    }

    /** goalId may be null (DAY-001); a Goal, if given, must be a WEEK Goal and contain plannedDate. */
    public DayResponse create(CreateDayRequest request) {
        Goal goal = findWeekGoal(request.goalId());
        validateDateInGoal(request.plannedDate(), goal, "plannedDate");

        Day day = new Day(goal == null ? null : goal.getId(), request.title().strip(), request.status(),
                request.priority(), request.estimatedMinutes(), request.plannedDate(), request.planningMode(),
                request.coreDay());
        day.setTags(dayTags.resolve(request.tagIds()));
        return DayResponse.from(days.saveAndFlush(day), null);
    }

    /**
     * requirements §9: from/to (inclusive plannedDate range), goalId, hasGoal, status, priority and
     * tagId filters (DAY-006). The Days screen combines several of these client-side on one list.
     */
    @Transactional(readOnly = true)
    public List<DayResponse> list(LocalDate from, LocalDate to, UUID goalId, Boolean hasGoal, DayStatus status,
            DayPriority priority, UUID tagId) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "from must be on or before to.", "from");
        }
        Specification<Day> filter = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.<LocalDate>get("plannedDate"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.<LocalDate>get("plannedDate"), to));
            }
            if (goalId != null) {
                predicates.add(cb.equal(root.get("goalId"), goalId));
            }
            if (hasGoal != null) {
                predicates.add(hasGoal ? cb.isNotNull(root.get("goalId")) : cb.isNull(root.get("goalId")));
            }
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (priority != null) {
                predicates.add(cb.equal(root.get("priority"), priority));
            }
            if (tagId != null) {
                // A Day joins several Tags, so the join can repeat the Day row.
                if (query != null) {
                    query.distinct(true);
                }
                predicates.add(cb.equal(root.join("tags").get("id"), tagId));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        List<Day> found = days.findAll(filter, Sort.by("createdAt"));
        Map<UUID, DaySchedule> schedulesByDay = schedules.findByDayIdIn(found.stream().map(Day::getId).toList())
                .stream()
                .collect(Collectors.toMap(DaySchedule::getDayId, Function.identity()));
        return found.stream().map(day -> DayResponse.from(day, schedulesByDay.get(day.getId()))).toList();
    }

    @Transactional(readOnly = true)
    public DayResponse get(UUID id) {
        Day day = find(id);
        return DayResponse.from(day, schedules.findByDayId(id).orElse(null));
    }

    /**
     * Changing plannedDate keeps an existing schedule on the same date: its timezone,
     * local start time and duration are kept. A null plannedDate removes the schedule.
     */
    public DayResponse update(UUID id, UpdateDayRequest request) {
        Day day = find(id);
        if (!Objects.equals(day.getVersion(), request.getVersion())) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT,
                    "The Day was changed by another request. Reload and try again.", "version");
        }
        if (!request.hasAnyChange()) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "At least one Day field must be provided.");
        }

        // An omitted goalId keeps the current Goal; an explicit null removes the link (DAY-001).
        Goal goal = findWeekGoal(request.hasGoalId() ? request.getGoalId() : day.getGoalId());
        LocalDate plannedDate = request.hasPlannedDate() ? request.getPlannedDate() : day.getPlannedDate();
        validateDateInGoal(plannedDate, goal, "plannedDate");

        DaySchedule schedule = schedules.findByDayId(id).orElse(null);
        if (schedule != null && !Objects.equals(plannedDate, day.getPlannedDate())) {
            if (plannedDate == null) {
                schedules.delete(schedule);
                schedule = null;
            } else {
                moveSchedule(schedule, plannedDate);
            }
        }

        day.setGoalId(goal == null ? null : goal.getId());
        day.setPlannedDate(plannedDate);
        if (request.getTitle() != null) {
            day.setTitle(request.getTitle().strip());
        }
        if (request.getStatus() != null) {
            day.setStatus(request.getStatus());
        }
        if (request.getPriority() != null) {
            day.setPriority(request.getPriority());
        }
        if (request.getEstimatedMinutes() != null) {
            day.setEstimatedMinutes(request.getEstimatedMinutes());
        }
        if (request.getPlanningMode() != null) {
            day.setPlanningMode(request.getPlanningMode());
        }
        if (request.getCoreDay() != null) {
            day.setCoreDay(request.getCoreDay());
        }
        // A sent list replaces the Tags; an empty list removes them all (DAY-005).
        if (request.getTagIds() != null) {
            day.setTags(dayTags.resolve(request.getTagIds()));
        }
        days.saveAndFlush(day);
        return DayResponse.from(day, schedule);
    }

    /** The schedule, if any, is removed with the Day by the database cascade. */
    public void delete(UUID id) {
        days.delete(find(id));
    }

    /**
     * Creates or replaces the Day's single schedule and aligns Day.plannedDate with the
     * schedule's local start date.
     */
    public DayResponse setSchedule(UUID dayId, SetDayScheduleRequest request) {
        Day day = find(dayId);
        ZoneId zone = parseZone(request.timezone());
        if (!request.endAt().isAfter(request.startAt())) {
            throw new ApiException(ErrorCode.INVALID_SCHEDULE_RANGE, "DaySchedule endAt must be after startAt.",
                    "endAt");
        }

        DaySchedule schedule = schedules.findByDayId(dayId).orElse(null);
        Long currentVersion = schedule == null ? null : schedule.getVersion();
        if (!Objects.equals(currentVersion, request.expectedVersion())) {
            throw new ApiException(ErrorCode.SCHEDULE_VERSION_CONFLICT,
                    "The schedule was changed by another request. Reload and try again.", "expectedVersion");
        }

        LocalDate scheduleDate = request.startAt().atZoneSameInstant(zone).toLocalDate();
        validateDateInGoal(scheduleDate, findWeekGoal(day.getGoalId()), "startAt");

        Instant startAt = request.startAt().toInstant();
        Instant endAt = request.endAt().toInstant();
        if (schedule == null) {
            schedule = new DaySchedule(dayId, startAt, endAt, request.timezone());
        } else {
            schedule.place(startAt, endAt, request.timezone());
        }
        day.setPlannedDate(scheduleDate);

        schedules.saveAndFlush(schedule);
        days.saveAndFlush(day);
        return DayResponse.from(day, schedule);
    }

    /** Removes only the placement; the Day and its plannedDate are kept. */
    public void deleteSchedule(UUID dayId) {
        find(dayId);
        DaySchedule schedule = schedules.findByDayId(dayId)
                .orElseThrow(() -> new ApiException(ErrorCode.SCHEDULE_NOT_FOUND,
                        "Day " + dayId + " has no schedule."));
        schedules.delete(schedule);
    }

    private Day find(UUID id) {
        return days.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.DAY_NOT_FOUND, "Day " + id + " was not found."));
    }

    /** null goalId means "no Goal" and is valid; any other value must be an existing WEEK Goal. */
    private Goal findWeekGoal(UUID goalId) {
        if (goalId == null) {
            return null;
        }
        return goals.findById(goalId)
                .filter(goal -> goal.getType() == GoalType.WEEK)
                .orElseThrow(() -> new ApiException(ErrorCode.DAY_REQUIRES_WEEK_GOAL,
                        "A Day can only belong directly to a WEEK Goal.", "goalId"));
    }

    /** Days without a Goal have no Goal period to stay inside (DAY-001). */
    private static void validateDateInGoal(LocalDate date, Goal goal, String field) {
        if (goal != null && date != null && !goal.contains(date)) {
            throw new ApiException(ErrorCode.DATE_OUTSIDE_WEEK_GOAL_PERIOD,
                    "The date must be within the WEEK Goal period " + goal.getStartDate() + " ~ "
                            + goal.getEndDate() + ".",
                    field);
        }
    }

    /** Only region-based IANA ids (e.g. Asia/Seoul) are accepted, not raw offsets. */
    private static ZoneId parseZone(String timezone) {
        if (!ZoneId.getAvailableZoneIds().contains(timezone)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "timezone must be a valid IANA timezone.",
                    "timezone");
        }
        return ZoneId.of(timezone);
    }

    /** Same local start time and duration on the new date, in the schedule's timezone. */
    private static void moveSchedule(DaySchedule schedule, LocalDate plannedDate) {
        ZoneId zone = schedule.zoneId();
        Duration duration = Duration.between(schedule.getStartAt(), schedule.getEndAt());
        Instant movedStart = ZonedDateTime
                .of(plannedDate, schedule.getStartAt().atZone(zone).toLocalTime(), zone)
                .toInstant();
        schedule.place(movedStart, movedStart.plus(duration), schedule.getTimezone());
    }
}
