package com.dayflow.api.review;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Every lookup is scoped to the owner (AUTH-003). */
public interface ReviewRepository extends JpaRepository<Review, UUID> {

    Optional<Review> findByUserIdAndTypeAndPeriodStart(UUID userId, ReviewType type, LocalDate periodStart);

    Optional<Review> findByUserIdAndItems_Id(UUID userId, UUID itemId);
}
