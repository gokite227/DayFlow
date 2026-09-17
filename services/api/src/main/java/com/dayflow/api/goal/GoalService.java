package com.dayflow.api.goal;

import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ApiException.FieldViolation;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.day.DayRepository;
import com.dayflow.api.goal.GoalDtos.CreateGoalRequest;
import com.dayflow.api.goal.GoalDtos.GoalResponse;
import com.dayflow.api.goal.GoalDtos.UpdateGoalRequest;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Server-side enforcement of the Goal rules in packages/domain (GOAL-001, GOAL-002). Every Goal read or
 * written belongs to the current user (AUTH-003); another user's Goal id behaves like an unknown id.
 */
@Service
@Transactional
public class GoalService {

    private final GoalRepository goals;
    private final DayRepository days;
    private final CurrentUser currentUser;

    public GoalService(GoalRepository goals, DayRepository days, CurrentUser currentUser) {
        this.goals = goals;
        this.days = days;
        this.currentUser = currentUser;
    }

    public GoalResponse create(CreateGoalRequest request) {
        GoalKind kind = request.kind() == null ? GoalKind.CALENDAR : request.kind();
        validatePeriod(request.startDate(), request.endDate());
        validateKindShape(kind, request.type(), request.parentGoalId());
        if (kind == GoalKind.CALENDAR) {
            validateParent(request.type(), request.parentGoalId(), request.startDate(), request.endDate());
            validateCanonicalPeriod(request.type(), request.startDate(), request.endDate());
        }

        Goal goal = new Goal(currentUser.id(), request.parentGoalId(), kind, request.type(), request.title().strip(),
                request.why().strip(), request.startDate(), request.endDate(), request.priority(),
                request.progressPolicy());
        return GoalResponse.from(goals.saveAndFlush(goal));
    }

    /**
     * REC-004: a Goal of a later canonical period continuing {@code template} (title, why, priority and
     * progress policy are copied). The same parent, period and canonical rules as {@link #create} apply.
     * {@code continuedFrom} is the Goal of the same level being continued, or null when there is none.
     */
    public Goal createContinuation(Goal template, UUID continuedFrom, GoalType type, UUID parentGoalId,
            LocalDate startDate, LocalDate endDate) {
        validatePeriod(startDate, endDate);
        validateParent(type, parentGoalId, startDate, endDate);
        validateCanonicalPeriod(type, startDate, endDate);

        Goal goal = new Goal(currentUser.id(), parentGoalId, GoalKind.CALENDAR, type, template.getTitle(), template.getWhy(), startDate,
                endDate, template.getPriority(), template.getProgressPolicy());
        goal.setContinuedFromGoalId(continuedFrom);
        return goals.saveAndFlush(goal);
    }

    /** Goals of a type and/or overlapping the from..to period. */
    @Transactional(readOnly = true)
    public List<GoalResponse> list(GoalKind kind, GoalType type, LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "from must be on or before to.", "from");
        }
        UUID userId = currentUser.id();
        Specification<Goal> filter = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("userId"), userId));
            if (kind != null) {
                predicates.add(cb.equal(root.get("kind"), kind));
            }
            if (type != null) {
                predicates.add(cb.equal(root.get("type"), type));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("endDate"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("startDate"), to));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        return goals.findAll(filter, Sort.by("startDate", "createdAt")).stream().map(GoalResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public GoalResponse get(UUID id) {
        return GoalResponse.from(find(id));
    }

    public GoalResponse update(UUID id, UpdateGoalRequest request) {
        Goal goal = find(id);
        if (!Objects.equals(goal.getVersion(), request.getVersion())) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT,
                    "The Goal was changed by another request. Reload and try again.", "version");
        }
        if (!request.hasAnyChange()) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "At least one Goal field must be provided.");
        }

        UUID parentGoalId = request.hasParentGoalId() ? request.getParentGoalId() : goal.getParentGoalId();
        LocalDate startDate = valueOr(request.getStartDate(), goal.getStartDate());
        LocalDate endDate = valueOr(request.getEndDate(), goal.getEndDate());

        validatePeriod(startDate, endDate);
        validateKindShape(goal.getKind(), goal.getType(), parentGoalId);
        if (goal.isCalendar()) {
            validateParent(goal.getType(), parentGoalId, startDate, endDate);
            validateCanonicalPeriod(goal.getType(), startDate, endDate);
        }
        validateContentsStayInside(goal, startDate, endDate);

        goal.setParentGoalId(parentGoalId);
        goal.setStartDate(startDate);
        goal.setEndDate(endDate);
        if (request.getTitle() != null) {
            goal.setTitle(request.getTitle().strip());
        }
        if (request.getWhy() != null) {
            goal.setWhy(request.getWhy().strip());
        }
        if (request.getPriority() != null) {
            goal.setPriority(request.getPriority());
        }
        if (request.getProgressPolicy() != null) {
            goal.setProgressPolicy(request.getProgressPolicy());
        }
        return GoalResponse.from(goals.saveAndFlush(goal));
    }

    /** Deletion never cascades through the hierarchy; child Goals and Days must be removed first. */
    public void delete(UUID id) {
        Goal goal = find(id);
        if (goals.existsByParentGoalId(id) || days.existsByGoalId(id)) {
            throw new ApiException(ErrorCode.GOAL_IN_USE, "The Goal still has child Goals or Days.");
        }
        goals.delete(goal);
    }

    public Goal find(UUID id) {
        return goals.findByIdAndUserId(id, currentUser.id())
                .orElseThrow(() -> new ApiException(ErrorCode.GOAL_NOT_FOUND, "Goal " + id + " was not found."));
    }

    private static void validatePeriod(LocalDate startDate, LocalDate endDate) {
        if (startDate.isAfter(endDate)) {
            throw new ApiException(ErrorCode.INVALID_GOAL_PERIOD, "Goal endDate must be on or after startDate.",
                    "endDate");
        }
    }

    private static void validateKindShape(GoalKind kind, GoalType type, UUID parentGoalId) {
        if (kind == GoalKind.PERIOD) {
            if (type != null) {
                throw new ApiException(ErrorCode.VALIDATION_ERROR,
                        "A PERIOD Goal must not have a calendar type.", "type");
            }
            if (parentGoalId != null) {
                throw new ApiException(ErrorCode.INVALID_GOAL_PARENT,
                        "A PERIOD Goal cannot have a parent Goal.", "parentGoalId");
            }
        } else if (type == null) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR,
                    "A CALENDAR Goal requires YEAR, QUARTER, MONTH or WEEK type.", "type");
        }
    }

    /**
     * GOAL-004: the range must be exactly one calendar period of the type. Checked after the parent
     * rules, so a WEEK is also known to lie inside its parent MONTH.
     */
    private static void validateCanonicalPeriod(GoalType type, LocalDate startDate, LocalDate endDate) {
        if (!GoalPeriods.isCanonical(type, startDate, endDate)) {
            LocalDate[] expected = GoalPeriods.containing(type, startDate);
            throw new ApiException(ErrorCode.INVALID_GOAL_PERIOD,
                    "A " + type + " Goal must cover exactly one calendar period (for this startDate: "
                            + expected[0] + " ~ " + expected[1] + ").",
                    List.of(new FieldViolation("startDate", "must start a calendar " + type + " period"),
                            new FieldViolation("endDate", "must end the same calendar " + type + " period")));
        }
    }

    /** The parent must be exactly one level above and contain the child period. */
    private void validateParent(GoalType type, UUID parentGoalId, LocalDate startDate, LocalDate endDate) {
        GoalType expectedParentType = type.expectedParentType();
        if (expectedParentType == null) {
            if (parentGoalId != null) {
                throw new ApiException(ErrorCode.INVALID_GOAL_PARENT, "A YEAR Goal cannot have a parent Goal.",
                        "parentGoalId");
            }
            return;
        }
        String wrongParent = "A " + type + " Goal must have a " + expectedParentType + " Goal as its parent.";
        if (parentGoalId == null) {
            throw new ApiException(ErrorCode.INVALID_GOAL_PARENT, wrongParent, "parentGoalId");
        }
        // Another user's Goal is not a possible parent: it is reported like an unknown parent.
        Goal parent = goals.findByIdAndUserId(parentGoalId, currentUser.id())
                .filter(Goal::isCalendar)
                .filter(candidate -> candidate.getType() == expectedParentType)
                .orElseThrow(() -> new ApiException(ErrorCode.INVALID_GOAL_PARENT, wrongParent, "parentGoalId"));

        List<FieldViolation> violations = new ArrayList<>();
        if (startDate.isBefore(parent.getStartDate())) {
            violations.add(new FieldViolation("startDate", "A child Goal must not start before its parent Goal."));
        }
        if (endDate.isAfter(parent.getEndDate())) {
            violations.add(new FieldViolation("endDate", "A child Goal must not end after its parent Goal."));
        }
        if (!violations.isEmpty()) {
            throw new ApiException(ErrorCode.GOAL_OUTSIDE_PARENT_PERIOD,
                    "A child Goal period must be within its parent Goal period.", violations);
        }
    }

    /** Changing a period must not leave existing child Goals or Day dates outside of it. */
    private void validateContentsStayInside(Goal goal, LocalDate startDate, LocalDate endDate) {
        List<FieldViolation> violations = new ArrayList<>();
        if (goals.existsByParentGoalIdAndStartDateBefore(goal.getId(), startDate)
                || days.existsByGoalIdAndPlannedDateBefore(goal.getId(), startDate)) {
            violations.add(new FieldViolation("startDate", "Existing child Goals or Days start before this date."));
        }
        if (goals.existsByParentGoalIdAndEndDateAfter(goal.getId(), endDate)
                || days.existsByGoalIdAndPlannedDateAfter(goal.getId(), endDate)) {
            violations.add(new FieldViolation("endDate", "Existing child Goals or Days end after this date."));
        }
        if (!violations.isEmpty()) {
            ErrorCode code = goal.isPeriod()
                    ? ErrorCode.DATE_OUTSIDE_GOAL_PERIOD
                    : goal.getType() == GoalType.WEEK
                            ? ErrorCode.DATE_OUTSIDE_WEEK_GOAL_PERIOD
                            : ErrorCode.GOAL_OUTSIDE_PARENT_PERIOD;
            throw new ApiException(code, "The new period would leave existing contents outside the Goal.",
                    violations);
        }
    }

    private static <T> T valueOr(T value, T fallback) {
        return value != null ? value : fallback;
    }
}
