package com.dayflow.api.goal;

import java.time.LocalDate;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface GoalRepository extends JpaRepository<Goal, UUID>, JpaSpecificationExecutor<Goal> {

    boolean existsByParentGoalId(UUID parentGoalId);

    boolean existsByParentGoalIdAndStartDateBefore(UUID parentGoalId, LocalDate date);

    boolean existsByParentGoalIdAndEndDateAfter(UUID parentGoalId, LocalDate date);
}
