package com.dayflow.api.day;

import com.dayflow.api.common.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "days")
public class Day extends VersionedEntity {

    /** The WEEK Goal this Day belongs to. */
    @Column(name = "goal_id", nullable = false)
    private UUID goalId;

    @Column(name = "title", nullable = false)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private DayStatus status;

    @Column(name = "priority", nullable = false)
    private int priority;

    @Column(name = "estimated_minutes", nullable = false)
    private int estimatedMinutes;

    /** Null means the date is not decided yet (DAY-001). */
    @Column(name = "planned_date")
    private LocalDate plannedDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "planning_mode", nullable = false)
    private DayPlanningMode planningMode;

    @Column(name = "core_day", nullable = false)
    private boolean coreDay;

    protected Day() {
    }

    public Day(UUID goalId, String title, DayStatus status, int priority, int estimatedMinutes,
            LocalDate plannedDate, DayPlanningMode planningMode, boolean coreDay) {
        this.goalId = goalId;
        this.title = title;
        this.status = status;
        this.priority = priority;
        this.estimatedMinutes = estimatedMinutes;
        this.plannedDate = plannedDate;
        this.planningMode = planningMode;
        this.coreDay = coreDay;
    }

    public UUID getGoalId() {
        return goalId;
    }

    public void setGoalId(UUID goalId) {
        this.goalId = goalId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public DayStatus getStatus() {
        return status;
    }

    public void setStatus(DayStatus status) {
        this.status = status;
    }

    public int getPriority() {
        return priority;
    }

    public void setPriority(int priority) {
        this.priority = priority;
    }

    public int getEstimatedMinutes() {
        return estimatedMinutes;
    }

    public void setEstimatedMinutes(int estimatedMinutes) {
        this.estimatedMinutes = estimatedMinutes;
    }

    public LocalDate getPlannedDate() {
        return plannedDate;
    }

    public void setPlannedDate(LocalDate plannedDate) {
        this.plannedDate = plannedDate;
    }

    public DayPlanningMode getPlanningMode() {
        return planningMode;
    }

    public void setPlanningMode(DayPlanningMode planningMode) {
        this.planningMode = planningMode;
    }

    public boolean isCoreDay() {
        return coreDay;
    }

    public void setCoreDay(boolean coreDay) {
        this.coreDay = coreDay;
    }
}
