package com.dayflow.api.goal;

import java.time.LocalDate;

/** Pure date helpers shared by future Goal UIs without adding mutable status to the database. */
public final class GoalStatuses {

    private GoalStatuses() {
    }

    public static GoalStatus derive(LocalDate startDate, LocalDate endDate, LocalDate today) {
        if (today.isBefore(startDate)) {
            return GoalStatus.UPCOMING;
        }
        if (today.isAfter(endDate)) {
            return GoalStatus.ENDED;
        }
        return GoalStatus.ACTIVE;
    }
}
