package com.dayflow.api.day;

import com.dayflow.api.common.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import org.hibernate.annotations.BatchSize;

@Entity
@Table(name = "days")
public class Day extends VersionedEntity {

    /** The WEEK Goal this Day belongs to, or null when the Day has no Goal (DAY-001). */
    @Column(name = "goal_id")
    private UUID goalId;

    @Column(name = "title", nullable = false)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private DayStatus status;

    /** Stored as the existing integer column (DAY-004); the converter maps it to the enum. */
    @Convert(converter = DayPriorityConverter.class)
    @Column(name = "priority", nullable = false)
    private DayPriority priority;

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

    /**
     * REC-003: the Day this one continues after a Carry Over, or null. The source keeps its own date and
     * status as the record of the earlier plan; deleting it only clears this link.
     */
    @Column(name = "carried_from_day_id", updatable = false)
    private UUID carriedFromDayId;

    /**
     * DAY-005 Tags. BatchSize loads the Tags of a Day list in a few queries instead of one per Day,
     * so the Days screen stays a single request.
     */
    @ManyToMany
    @JoinTable(name = "day_tag_links",
            joinColumns = @JoinColumn(name = "day_id"),
            inverseJoinColumns = @JoinColumn(name = "tag_id"))
    @OrderBy("sortOrder asc, name asc")
    @BatchSize(size = 50)
    private Set<DayTag> tags = new LinkedHashSet<>();

    protected Day() {
    }

    public Day(UUID goalId, String title, DayStatus status, DayPriority priority, int estimatedMinutes,
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

    public DayPriority getPriority() {
        return priority;
    }

    public void setPriority(DayPriority priority) {
        this.priority = priority;
    }

    public UUID getCarriedFromDayId() {
        return carriedFromDayId;
    }

    public void setCarriedFromDayId(UUID carriedFromDayId) {
        this.carriedFromDayId = carriedFromDayId;
    }

    public Set<DayTag> getTags() {
        return tags;
    }

    public void setTags(Set<DayTag> tags) {
        this.tags = new LinkedHashSet<>(tags);
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
