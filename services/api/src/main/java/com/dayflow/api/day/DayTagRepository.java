package com.dayflow.api.day;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DayTagRepository extends JpaRepository<DayTag, UUID> {

    List<DayTag> findAllByOrderBySortOrderAscNameAsc();

    /** DAY-005: names are unique regardless of case. */
    Optional<DayTag> findFirstByNameIgnoreCase(String name);
}
