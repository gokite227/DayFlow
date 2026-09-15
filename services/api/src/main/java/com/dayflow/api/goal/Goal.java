package com.dayflow.api.goal;

import com.dayflow.api.common.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "goals")
public class Goal extends VersionedEntity {

    /** Plain id instead of an association: the hierarchy is navigated by queries. */
    @Column(name = "parent_goal_id")
    private UUID parentGoalId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, updatable = false)
    private GoalType type;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "why", nullable = false)
    private String why;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "priority", nullable = false)
    private int priority;

    @Enumerated(EnumType.STRING)
    @Column(name = "progress_policy", nullable = false)
    private ProgressPolicy progressPolicy;

    protected Goal() {
    }

    public Goal(UUID parentGoalId, GoalType type, String title, String why, LocalDate startDate,
            LocalDate endDate, int priority, ProgressPolicy progressPolicy) {
        this.parentGoalId = parentGoalId;
        this.type = type;
        this.title = title;
        this.why = why;
        this.startDate = startDate;
        this.endDate = endDate;
        this.priority = priority;
        this.progressPolicy = progressPolicy;
    }

    public UUID getParentGoalId() {
        return parentGoalId;
    }

    public void setParentGoalId(UUID parentGoalId) {
        this.parentGoalId = parentGoalId;
    }

    public GoalType getType() {
        return type;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getWhy() {
        return why;
    }

    public void setWhy(String why) {
        this.why = why;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public void setEndDate(LocalDate endDate) {
        this.endDate = endDate;
    }

    public int getPriority() {
        return priority;
    }

    public void setPriority(int priority) {
        this.priority = priority;
    }

    public ProgressPolicy getProgressPolicy() {
        return progressPolicy;
    }

    public void setProgressPolicy(ProgressPolicy progressPolicy) {
        this.progressPolicy = progressPolicy;
    }

    public boolean contains(LocalDate date) {
        return !date.isBefore(startDate) && !date.isAfter(endDate);
    }
}
