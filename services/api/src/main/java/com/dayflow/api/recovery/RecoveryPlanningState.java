package com.dayflow.api.recovery;

import com.dayflow.api.day.Day;
import com.dayflow.api.day.DaySchedule;
import java.util.Objects;

/**
 * REC-005 "planning state": the Day values a Recovery decision is about. A decision is stored with the
 * state right after it; while the Day still has exactly that state it is not offered as missed again.
 * Any change of date, time placement, Goal link, status or estimate makes it a candidate again. Title,
 * Tags, priority and core flag are not part of it: renaming a Day does not change whether it was missed.
 * There is no time-based re-surfacing.
 */
public final class RecoveryPlanningState {

    private RecoveryPlanningState() {
    }

    public static String of(Day day, DaySchedule schedule) {
        return String.join("|",
                Objects.toString(day.getPlannedDate(), "-"),
                schedule == null ? "-" : schedule.getStartAt() + "~" + schedule.getEndAt(),
                Objects.toString(day.getGoalId(), "-"),
                day.getStatus().name(),
                Integer.toString(day.getEstimatedMinutes()));
    }
}
