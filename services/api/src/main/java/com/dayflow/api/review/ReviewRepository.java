package com.dayflow.api.review;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewRepository extends JpaRepository<Review, UUID> {

    Optional<Review> findByTypeAndPeriodStart(ReviewType type, LocalDate periodStart);

    Optional<Review> findByItems_Id(UUID itemId);
}
