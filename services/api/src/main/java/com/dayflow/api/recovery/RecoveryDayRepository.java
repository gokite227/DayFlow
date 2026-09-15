package com.dayflow.api.recovery;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecoveryDayRepository extends JpaRepository<RecoveryDay, UUID> {

    Optional<RecoveryDay> findByDate(LocalDate date);

    List<RecoveryDay> findByDateBetweenOrderByDate(LocalDate from, LocalDate to);
}
