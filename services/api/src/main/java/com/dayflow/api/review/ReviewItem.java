package com.dayflow.api.review;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/** One KPT line. Part of a {@link Review}; versioned through its Review. */
@Entity
@Table(name = "review_items")
public class ReviewItem {

    @Id
    private UUID id = UUID.randomUUID();

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false)
    private ReviewItemKind kind;

    @Column(name = "content", nullable = false)
    private String content;

    @Column(name = "position", nullable = false)
    private int position;

    /** Set once a TRY item became a Day (REV-004). */
    @Column(name = "converted_day_id")
    private UUID convertedDayId;

    protected ReviewItem() {
    }

    public ReviewItem(ReviewItemKind kind, String content, int position) {
        update(kind, content, position);
    }

    public void update(ReviewItemKind kind, String content, int position) {
        this.kind = kind;
        this.content = content;
        this.position = position;
    }

    public UUID getId() {
        return id;
    }

    public ReviewItemKind getKind() {
        return kind;
    }

    public String getContent() {
        return content;
    }

    public int getPosition() {
        return position;
    }

    public UUID getConvertedDayId() {
        return convertedDayId;
    }

    public void setConvertedDayId(UUID convertedDayId) {
        this.convertedDayId = convertedDayId;
    }
}
