package com.dayflow.api.event;

import com.dayflow.api.common.VersionedEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;
import org.hibernate.annotations.BatchSize;

/**
 * A schedule that happens to the user (EVT-001). Either timed (startAt/endAt) or all-day
 * (startDate/endDateExclusive); the other pair is always null (events_time_shape_check).
 */
@Entity
@Table(name = "events")
public class Event extends VersionedEntity {

    @Column(name = "title", nullable = false)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false)
    private EventType type;

    @Column(name = "all_day", nullable = false)
    private boolean allDay;

    @Column(name = "start_at", columnDefinition = "timestamptz")
    private Instant startAt;

    @Column(name = "end_at", columnDefinition = "timestamptz")
    private Instant endAt;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date_exclusive")
    private LocalDate endDateExclusive;

    @Column(name = "timezone", nullable = false)
    private String timezone;

    @Column(name = "location")
    private String location;

    @Column(name = "notes")
    private String notes;

    @Enumerated(EnumType.STRING)
    @Column(name = "recurrence", nullable = false)
    private EventRecurrence recurrence;

    @Column(name = "linked_goal_id")
    private UUID linkedGoalId;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "event_id", nullable = false)
    @OrderBy("offsetMinutes")
    @BatchSize(size = 100)
    private List<EventReminder> reminders = new ArrayList<>();

    protected Event() {
    }

    public Event(String title, EventType type, String timezone, EventRecurrence recurrence) {
        this.title = title;
        this.type = type;
        this.timezone = timezone;
        this.recurrence = recurrence;
    }

    public void placeTimed(Instant startAt, Instant endAt) {
        this.allDay = false;
        this.startAt = startAt;
        this.endAt = endAt;
        this.startDate = null;
        this.endDateExclusive = null;
    }

    public void placeAllDay(LocalDate startDate, LocalDate endDateExclusive) {
        this.allDay = true;
        this.startDate = startDate;
        this.endDateExclusive = endDateExclusive;
        this.startAt = null;
        this.endAt = null;
    }

    /**
     * Keeps reminders whose offset stays, removes the others and adds new offsets. Never removing
     * and re-inserting the same offset avoids hitting the unique constraint during flush.
     */
    public void replaceReminders(Collection<Integer> offsets) {
        Set<Integer> wanted = new TreeSet<>(offsets);
        reminders.removeIf(reminder -> !wanted.contains(reminder.getOffsetMinutes()));
        Set<Integer> existing = reminders.stream().map(EventReminder::getOffsetMinutes).collect(Collectors.toSet());
        wanted.stream().filter(offset -> !existing.contains(offset))
                .forEach(offset -> reminders.add(new EventReminder(offset)));
    }

    public List<Integer> reminderOffsets() {
        return reminders.stream().map(EventReminder::getOffsetMinutes).sorted().toList();
    }

    public ZoneId zoneId() {
        return ZoneId.of(timezone);
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public EventType getType() {
        return type;
    }

    public void setType(EventType type) {
        this.type = type;
    }

    public boolean isAllDay() {
        return allDay;
    }

    public Instant getStartAt() {
        return startAt;
    }

    public Instant getEndAt() {
        return endAt;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getEndDateExclusive() {
        return endDateExclusive;
    }

    public String getTimezone() {
        return timezone;
    }

    public void setTimezone(String timezone) {
        this.timezone = timezone;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public EventRecurrence getRecurrence() {
        return recurrence;
    }

    public void setRecurrence(EventRecurrence recurrence) {
        this.recurrence = recurrence;
    }

    public UUID getLinkedGoalId() {
        return linkedGoalId;
    }

    public void setLinkedGoalId(UUID linkedGoalId) {
        this.linkedGoalId = linkedGoalId;
    }
}
