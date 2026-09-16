package com.dayflow.api.event;

import com.dayflow.api.common.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import org.hibernate.annotations.BatchSize;

/**
 * EVT-006 user defined Event Category: the kind of a schedule (일정, 생일, 면접, …). The defaults are
 * ordinary rows. It is a different axis from Day Tags (life/work areas) and is stored separately.
 * BatchSize loads the Categories of an Event list in one query.
 */
@Entity
@Table(name = "event_categories")
@BatchSize(size = 50)
public class EventCategory extends VersionedEntity {

    /** The owner (AUTH-003); names are unique per user. */
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "name", nullable = false)
    private String name;

    /** One of EventCategoryColors.PALETTE. */
    @Column(name = "color", nullable = false)
    private String color;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    protected EventCategory() {
    }

    public EventCategory(UUID userId, String name, String color, int sortOrder) {
        this.userId = userId;
        this.name = name;
        this.color = color;
        this.sortOrder = sortOrder;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getColor() {
        return color;
    }

    public void setColor(String color) {
        this.color = color;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
