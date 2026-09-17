package com.dayflow.api.day;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * Lookups by id always include the owner (AUTH-003). Queries by goalId or carriedFromDayId start from a Goal
 * or Day already loaded for its owner; linked rows always share that owner.
 */
public interface DayRepository extends JpaRepository<Day, UUID>, JpaSpecificationExecutor<Day> {

    Optional<Day> findByIdAndUserId(UUID id, UUID userId);

    boolean existsByIdAndUserId(UUID id, UUID userId);

    List<Day> findByUserIdAndIdIn(UUID userId, Collection<UUID> ids);

    boolean existsByGoalId(UUID goalId);

    boolean existsByGoalIdAndPlannedDateBefore(UUID goalId, LocalDate date);

    boolean existsByGoalIdAndPlannedDateAfter(UUID goalId, LocalDate date);

    /** REC-001 candidates are unfinished Days planned on or before the user's today. */
    List<Day> findByUserIdAndStatusInAndPlannedDateLessThanEqual(UUID userId, Collection<DayStatus> statuses,
            LocalDate date);

    List<Day> findByGoalIdOrderByPlannedDateAscCreatedAtAsc(UUID goalId);

    /** AI Coach context: the user's Days planned in an inclusive date range. */
    List<Day> findByUserIdAndPlannedDateBetween(UUID userId, LocalDate from, LocalDate to);

    /** REC-003: whether a later Day already continues this Day. */
    boolean existsByCarriedFromDayId(UUID carriedFromDayId);
}
