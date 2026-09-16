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

/** What one decision changed on one Day (before → after). Append-only history (REC-005). */
@Entity
@Table(name = "recovery_event_items")
public class RecoveryEventItem {

    @Id
    private UUID id = UUID.randomUUID();

    /** The Day the decision was about; null once that Day is deleted. */
    @Column(name = "day_id", updatable = false)
    private UUID dayId;

    /** The Day's title when the decision was made, so history stays readable after renames. */
    @Column(name = "day_title", updatable = false)
    private String dayTitle;

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

    /** CARRY_OVER: the new Day created in the later period. */
    @Column(name = "destination_day_id", updatable = false)
    private UUID destinationDayId;

    /** The source Day's planning values right after the decision ({@link RecoveryPlanningState}). */
    @Column(name = "planning_state", updatable = false)
    private String planningState;

    protected RecoveryEventItem() {
    }

    public RecoveryEventItem(UUID dayId, String dayTitle, RecoveryAction action, DayStatus previousStatus,
            DayStatus newStatus, LocalDate previousPlannedDate, LocalDate newPlannedDate,
            int previousEstimatedMinutes, int newEstimatedMinutes, UUID destinationDayId, String planningState) {
        this.dayId = dayId;
        this.dayTitle = dayTitle;
        this.action = action;
        this.previousStatus = previousStatus;
        this.newStatus = newStatus;
        this.previousPlannedDate = previousPlannedDate;
        this.newPlannedDate = newPlannedDate;
        this.previousEstimatedMinutes = previousEstimatedMinutes;
        this.newEstimatedMinutes = newEstimatedMinutes;
        this.destinationDayId = destinationDayId;
        this.planningState = planningState;
    }

    public UUID getId() {
        return id;
    }

    public UUID getDayId() {
        return dayId;
    }

    public String getDayTitle() {
        return dayTitle;
    }

    public RecoveryAction getAction() {
        return action;
    }

    public DayStatus getPreviousStatus() {
        return previousStatus;
    }

    public DayStatus getNewStatus() {
        return newStatus;
    }

    public LocalDate getPreviousPlannedDate() {
        return previousPlannedDate;
    }

    public LocalDate getNewPlannedDate() {
        return newPlannedDate;
    }

    public int getPreviousEstimatedMinutes() {
        return previousEstimatedMinutes;
    }

    public int getNewEstimatedMinutes() {
        return newEstimatedMinutes;
    }

    public UUID getDestinationDayId() {
        return destinationDayId;
    }

    public String getPlanningState() {
        return planningState;
    }
}
