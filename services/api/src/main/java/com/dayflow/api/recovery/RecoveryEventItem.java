package com.dayflow.api.recovery;

import com.dayflow.api.day.DayStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;

/** What one decision changed on one Day (before → after). */
@Entity
@Table(name = "recovery_event_items")
public class RecoveryEventItem {

    @Id
    private UUID id = UUID.randomUUID();

    @Column(name = "day_id", updatable = false)
    private UUID dayId;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false, updatable = false)
    private RecoveryAction action;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_status", nullable = false, updatable = false)
    private DayStatus previousStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_status", nullable = false, updatable = false)
    private DayStatus newStatus;

    @Column(name = "previous_planned_date", updatable = false)
    private LocalDate previousPlannedDate;

    @Column(name = "new_planned_date", updatable = false)
    private LocalDate newPlannedDate;

    @Column(name = "previous_estimated_minutes", nullable = false, updatable = false)
    private int previousEstimatedMinutes;

    @Column(name = "new_estimated_minutes", nullable = false, updatable = false)
    private int newEstimatedMinutes;

    protected RecoveryEventItem() {
    }

    public RecoveryEventItem(UUID dayId, RecoveryAction action, DayStatus previousStatus, DayStatus newStatus,
            LocalDate previousPlannedDate, LocalDate newPlannedDate, int previousEstimatedMinutes,
            int newEstimatedMinutes) {
        this.dayId = dayId;
        this.action = action;
        this.previousStatus = previousStatus;
        this.newStatus = newStatus;
        this.previousPlannedDate = previousPlannedDate;
        this.newPlannedDate = newPlannedDate;
        this.previousEstimatedMinutes = previousEstimatedMinutes;
        this.newEstimatedMinutes = newEstimatedMinutes;
    }

    public UUID getDayId() {
        return dayId;
    }

    public RecoveryAction getAction() {
        return action;
    }
}
