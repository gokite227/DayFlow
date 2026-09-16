package com.dayflow.api.event;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventCategoryRepository extends JpaRepository<EventCategory, UUID> {

    List<EventCategory> findAllByOrderBySortOrderAscNameAsc();

    /** EVT-006: names are unique regardless of case. */
    Optional<EventCategory> findFirstByNameIgnoreCase(String name);
}
