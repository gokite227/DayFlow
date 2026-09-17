package com.dayflow.api.goal;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * Lookups by id always include the owner (AUTH-003): another user's Goal is simply "not found". The
 * parent-based checks start from a Goal already loaded for its owner, whose children share that owner.
 */
public interface GoalRepository extends JpaRepository<Goal, UUID>, JpaSpecificationExecutor<Goal> {

    Optional<Goal> findByIdAndUserId(UUID id, UUID userId);

    boolean existsByIdAndUserId(UUID id, UUID userId);

    boolean existsByParentGoalId(UUID parentGoalId);

    boolean existsByParentGoalIdAndStartDateBefore(UUID parentGoalId, LocalDate date);

    boolean existsByParentGoalIdAndEndDateAfter(UUID parentGoalId, LocalDate date);

    /** Goals covering exactly one canonical period (REC-004 target Goal lookup). */
    List<Goal> findByUserIdAndTypeAndStartDateAndEndDateOrderByCreatedAt(UUID userId, GoalType type,
            LocalDate startDate, LocalDate endDate);

    /** Existing WEEK Goals containing a date. */
    List<Goal> findByUserIdAndTypeAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByCreatedAt(
            UUID userId, GoalType type, LocalDate date, LocalDate sameDate);

    /** AI Coach context: Goals of both kinds whose period contains a date. */
    List<Goal> findByUserIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAscCreatedAtAsc(
            UUID userId, LocalDate date, LocalDate sameDate);

    /** AI Coach context: Goals of listed Days (scoped to the owner). */
    List<Goal> findByUserIdAndIdIn(UUID userId, Collection<UUID> ids);
}
