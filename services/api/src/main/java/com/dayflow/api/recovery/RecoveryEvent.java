package com.dayflow.api.recovery;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;

/** An applied recovery plan. Append-only: kept as data for later Recovery metrics. */
@Entity
@Table(name = "recovery_events")
public class RecoveryEvent {

    @Id
    private UUID id = UUID.randomUUID();

    /** The user's local date when the plan was applied. */
    @Column(name = "local_date", nullable = false, updatable = false)
    private LocalDate localDate;

    @CreationTimestamp
    @Column(name = "applied_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant appliedAt;

    @OneToMany(cascade = CascadeType.ALL)
    @JoinColumn(name = "event_id", nullable = false, updatable = false)
    private List<RecoveryEventItem> items = new ArrayList<>();

    protected RecoveryEvent() {
    }

    public RecoveryEvent(LocalDate localDate) {
        this.localDate = localDate;
    }

    public void addItem(RecoveryEventItem item) {
        items.add(item);
    }

    public UUID getId() {
        return id;
    }

    public LocalDate getLocalDate() {
        return localDate;
    }

    public Instant getAppliedAt() {
        return appliedAt;
    }

    public List<RecoveryEventItem> getItems() {
        return items;
    }
}
