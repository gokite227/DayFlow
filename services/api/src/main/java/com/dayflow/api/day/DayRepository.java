package com.dayflow.api.day;

import java.time.LocalDate;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface DayRepository extends JpaRepository<Day, UUID>, JpaSpecificationExecutor<Day> {

    boolean existsByGoalId(UUID goalId);

    boolean existsByGoalIdAndPlannedDateBefore(UUID goalId, LocalDate date);

    boolean existsByGoalIdAndPlannedDateAfter(UUID goalId, LocalDate date);
}
