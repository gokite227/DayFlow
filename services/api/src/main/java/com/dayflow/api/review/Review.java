package com.dayflow.api.review;

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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** A KPT review of one period (REV-001, REV-003). Items are saved and versioned with the review. */
@Entity
@Table(name = "reviews")
public class Review extends VersionedEntity {

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, updatable = false)
    private ReviewType type;

    @Column(name = "period_start", nullable = false, updatable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false, updatable = false)
    private LocalDate periodEnd;

    @Column(name = "rating")
    private Integer rating;

    @Column(name = "completed", nullable = false)
    private boolean completed;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "review_id", nullable = false)
    @OrderBy("position")
    private List<ReviewItem> items = new ArrayList<>();

    protected Review() {
    }

    public Review(ReviewType type, LocalDate periodStart, LocalDate periodEnd) {
        this.type = type;
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
    }

    public ReviewType getType() {
        return type;
    }

    public LocalDate getPeriodStart() {
        return periodStart;
    }

    public LocalDate getPeriodEnd() {
        return periodEnd;
    }

    public Integer getRating() {
        return rating;
    }

    public void setRating(Integer rating) {
        this.rating = rating;
    }

    public boolean isCompleted() {
        return completed;
    }

    public void setCompleted(boolean completed) {
        this.completed = completed;
    }

    public List<ReviewItem> getItems() {
        return items;
    }
}
