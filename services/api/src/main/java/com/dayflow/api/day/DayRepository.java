package com.dayflow.api.day;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface DayRepository extends JpaRepository<Day, UUID>, JpaSpecificationExecutor<Day> {

    boolean existsByGoalId(UUID goalId);

    boolean existsByGoalIdAndPlannedDateBefore(UUID goalId, LocalDate date);

    boolean existsByGoalIdAndPlannedDateAfter(UUID goalId, LocalDate date);

    /** REC-001 candidates are unfinished Days planned on or before the user's today. */
    List<Day> findByStatusInAndPlannedDateLessThanEqual(Collection<DayStatus> statuses, LocalDate date);

    List<Day> findByGoalIdOrderByPlannedDateAscCreatedAtAsc(UUID goalId);

    /** REC-003: whether a later Day already continues this Day. */
    boolean existsByCarriedFromDayId(UUID carriedFromDayId);
}
