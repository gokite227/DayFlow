package com.dayflow.api.goal;

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

/** Server-side enforcement of the Goal rules in packages/domain (GOAL-001, GOAL-002). */
@Service
@Transactional
public class GoalService {

    private final GoalRepository goals;
    private final DayRepository days;

    public GoalService(GoalRepository goals, DayRepository days) {
        this.goals = goals;
        this.days = days;
    }

    public GoalResponse create(CreateGoalRequest request) {
        validatePeriod(request.startDate(), request.endDate());
        validateParent(request.type(), request.parentGoalId(), request.startDate(), request.endDate());
        validateCanonicalPeriod(request.type(), request.startDate(), request.endDate());

        Goal goal = new Goal(request.parentGoalId(), request.type(), request.title().strip(), request.why().strip(),
                request.startDate(), request.endDate(), request.priority(), request.progressPolicy());
        return GoalResponse.from(goals.saveAndFlush(goal));
    }

    /** Goals of a type and/or overlapping the from..to period. */
    @Transactional(readOnly = true)
    public List<GoalResponse> list(GoalType type, LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "from must be on or before to.", "from");
        }
        Specification<Goal> filter = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
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
        validateParent(goal.getType(), parentGoalId, startDate, endDate);
        validateCanonicalPeriod(goal.getType(), startDate, endDate);
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
        return goals.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.GOAL_NOT_FOUND, "Goal " + id + " was not found."));
    }

    private static void validatePeriod(LocalDate startDate, LocalDate endDate) {
        if (startDate.isAfter(endDate)) {
            throw new ApiException(ErrorCode.INVALID_GOAL_PERIOD, "Goal endDate must be on or after startDate.",
                    "endDate");
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
        Goal parent = goals.findById(parentGoalId)
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
            ErrorCode code = goal.getType() == GoalType.WEEK
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
