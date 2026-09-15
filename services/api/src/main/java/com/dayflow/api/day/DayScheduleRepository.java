package com.dayflow.api.day;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DayScheduleRepository extends JpaRepository<DaySchedule, UUID> {

    Optional<DaySchedule> findByDayId(UUID dayId);

    List<DaySchedule> findByDayIdIn(Collection<UUID> dayIds);
}
