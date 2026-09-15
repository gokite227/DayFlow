package com.dayflow.api.goal;

/** Goal hierarchy YEAR → QUARTER → MONTH → WEEK (GOAL-001). */
public enum GoalType {
    YEAR,
    QUARTER,
    MONTH,
    WEEK;

    /** The only allowed parent type, or null for root YEAR Goals. */
    public GoalType expectedParentType() {
        return switch (this) {
            case YEAR -> null;
            case QUARTER -> YEAR;
            case MONTH -> QUARTER;
            case WEEK -> MONTH;
        };
    }
}
