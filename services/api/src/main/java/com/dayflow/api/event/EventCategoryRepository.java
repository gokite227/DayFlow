package com.dayflow.api.event;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Every lookup is scoped to the owner (AUTH-003). */
public interface EventCategoryRepository extends JpaRepository<EventCategory, UUID> {

    List<EventCategory> findAllByUserIdOrderBySortOrderAscNameAsc(UUID userId);

    Optional<EventCategory> findByIdAndUserId(UUID id, UUID userId);

    /** EVT-006: names are unique regardless of case, per user. */
    Optional<EventCategory> findFirstByUserIdAndNameIgnoreCase(UUID userId, String name);
}
