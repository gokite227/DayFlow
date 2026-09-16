package com.dayflow.api.event;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/** Lookups by id include the owner; list specifications add the owner predicate (AUTH-003). */
public interface EventRepository extends JpaRepository<Event, UUID>, JpaSpecificationExecutor<Event> {

    Optional<Event> findByIdAndUserId(UUID id, UUID userId);
}
