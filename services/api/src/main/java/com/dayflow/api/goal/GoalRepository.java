package com.dayflow.api.goal;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface GoalRepository extends JpaRepository<Goal, UUID>, JpaSpecificationExecutor<Goal> {

    boolean existsByParentGoalId(UUID parentGoalId);

    boolean existsByParentGoalIdAndStartDateBefore(UUID parentGoalId, LocalDate date);

    boolean existsByParentGoalIdAndEndDateAfter(UUID parentGoalId, LocalDate date);

    /** Goals covering exactly one canonical period (REC-004 target Goal lookup). */
    List<Goal> findByTypeAndStartDateAndEndDateOrderByCreatedAt(GoalType type, LocalDate startDate, LocalDate endDate);

    /** Existing WEEK Goals containing a date. */
    List<Goal> findByTypeAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByCreatedAt(
            GoalType type, LocalDate date, LocalDate sameDate);
}
