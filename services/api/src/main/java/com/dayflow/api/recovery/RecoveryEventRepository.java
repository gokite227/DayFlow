package com.dayflow.api.recovery;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Every lookup is scoped to the owner (AUTH-003). */
public interface RecoveryEventRepository extends JpaRepository<RecoveryEvent, UUID> {

    /** Newest first, for the /recovery history. */
    List<RecoveryEvent> findAllByUserIdOrderByAppliedAtDesc(UUID userId, Pageable pageable);

    /**
     * The latest decision per Day among {@code dayIds}: rows are newest first, so the caller keeps the
     * first item seen for each Day.
     */
    @Query("""
            select i from RecoveryEvent e join e.items i
            where e.userId = :userId and i.dayId in :dayIds
            order by e.appliedAt desc
            """)
    List<RecoveryEventItem> findItemsNewestFirst(@Param("userId") UUID userId, @Param("dayIds") Collection<UUID> dayIds);
}
