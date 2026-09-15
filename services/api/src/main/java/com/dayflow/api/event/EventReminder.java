package com.dayflow.api.event;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/** Minutes before an occurrence start (NOTI-001). Part of an {@link Event}; versioned through it. */
@Entity
@Table(name = "event_reminders")
public class EventReminder {

    @Id
    private UUID id = UUID.randomUUID();

    @Column(name = "offset_minutes", nullable = false, updatable = false)
    private int offsetMinutes;

    protected EventReminder() {
    }

    public EventReminder(int offsetMinutes) {
        this.offsetMinutes = offsetMinutes;
    }

    public int getOffsetMinutes() {
        return offsetMinutes;
    }
}
