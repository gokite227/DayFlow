package com.dayflow.api.recovery;

import com.dayflow.api.common.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;

/** REC-002: a date the user chose to rest on, with an optional date to come back. Not a failure record. */
@Entity
@Table(name = "recovery_days")
public class RecoveryDay extends VersionedEntity {

    @Column(name = "recovery_date", nullable = false, updatable = false)
    private LocalDate date;

    @Column(name = "return_date")
    private LocalDate returnDate;

    @Column(name = "note", nullable = false)
    private String note;

    protected RecoveryDay() {
    }

    public RecoveryDay(LocalDate date) {
        this.date = date;
    }

    public void update(LocalDate returnDate, String note) {
        this.returnDate = returnDate;
        this.note = note;
    }

    public LocalDate getDate() {
        return date;
    }

    public LocalDate getReturnDate() {
        return returnDate;
    }

    public String getNote() {
        return note;
    }
}
