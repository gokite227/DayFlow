package com.dayflow.api.day;

/**
 * DAY-004 task priority. The database keeps the existing integer column, so the level is part of
 * the enum and DayPriorityConverter translates both ways. Priority is the importance of the task
 * itself and is independent of Day.coreDay (today's must-do).
 */
public enum DayPriority {
    NONE(0),
    LOW(1),
    MEDIUM(2),
    HIGH(3);

    private final int level;

    DayPriority(int level) {
        this.level = level;
    }

    public int level() {
        return level;
    }

    public static DayPriority ofLevel(int level) {
        for (DayPriority priority : values()) {
            if (priority.level == level) {
                return priority;
            }
        }
        throw new IllegalArgumentException("Unknown Day priority level: " + level);
    }
}
