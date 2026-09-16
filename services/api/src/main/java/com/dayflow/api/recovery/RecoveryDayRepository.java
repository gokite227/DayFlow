package com.dayflow.api.recovery;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Every lookup is scoped to the owner (AUTH-003). */
public interface RecoveryDayRepository extends JpaRepository<RecoveryDay, UUID> {

    Optional<RecoveryDay> findByUserIdAndDate(UUID userId, LocalDate date);

    List<RecoveryDay> findByUserIdAndDateBetweenOrderByDate(UUID userId, LocalDate from, LocalDate to);
}
