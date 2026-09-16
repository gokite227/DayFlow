package com.dayflow.api.day;

import com.dayflow.api.common.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * DAY-005 user defined Day Tag (life/work area). Tags are a different axis from Goals and are kept
 * separate from Event categories.
 */
@Entity
@Table(name = "day_tags")
public class DayTag extends VersionedEntity {

    @Column(name = "name", nullable = false)
    private String name;

    /** One of DayTagColors.PALETTE. */
    @Column(name = "color", nullable = false)
    private String color;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    protected DayTag() {
    }

    public DayTag(String name, String color, int sortOrder) {
        this.name = name;
        this.color = color;
        this.sortOrder = sortOrder;
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
