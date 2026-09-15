package com.dayflow.api.day;

import com.dayflow.api.common.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

/** A Day's optional time placement (0..1 per Day). Removing it never removes the Day. */
@Entity
@Table(name = "day_schedules")
public class DaySchedule extends VersionedEntity {

    @Column(name = "day_id", nullable = false, updatable = false)
    private UUID dayId;

    /** Stored as a UTC instant; {@link #timezone} keeps the user's wall-clock context. */
    @Column(name = "start_at", nullable = false, columnDefinition = "timestamptz")
    private Instant startAt;

    @Column(name = "end_at", nullable = false, columnDefinition = "timestamptz")
    private Instant endAt;

    /** IANA timezone, e.g. Asia/Seoul. */
    @Column(name = "timezone", nullable = false)
    private String timezone;

    protected DaySchedule() {
    }

    public DaySchedule(UUID dayId, Instant startAt, Instant endAt, String timezone) {
        this.dayId = dayId;
        this.startAt = startAt;
        this.endAt = endAt;
        this.timezone = timezone;
    }

    public void place(Instant startAt, Instant endAt, String timezone) {
        this.startAt = startAt;
        this.endAt = endAt;
        this.timezone = timezone;
    }

    /** The calendar date on which the schedule starts, in its own timezone. */
    public LocalDate localDate() {
        return startAt.atZone(zoneId()).toLocalDate();
    }

    public ZoneId zoneId() {
        return ZoneId.of(timezone);
    }

    public UUID getDayId() {
        return dayId;
    }

    public Instant getStartAt() {
        return startAt;
    }

    public Instant getEndAt() {
        return endAt;
    }

    public String getTimezone() {
        return timezone;
    }
}
