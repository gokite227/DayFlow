package com.dayflow.api.day;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Every lookup is scoped to the owner (AUTH-003). */
public interface DayTagRepository extends JpaRepository<DayTag, UUID> {

    List<DayTag> findAllByUserIdOrderBySortOrderAscNameAsc(UUID userId);

    Optional<DayTag> findByIdAndUserId(UUID id, UUID userId);

    List<DayTag> findByUserIdAndIdIn(UUID userId, Collection<UUID> ids);

    /** DAY-005: names are unique regardless of case, per user. */
    Optional<DayTag> findFirstByUserIdAndNameIgnoreCase(UUID userId, String name);
}
