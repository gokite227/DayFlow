package com.dayflow.api.recovery;

/** REC-001 decisions for an unfinished Day (requirements §4.3). */
public enum RecoveryAction {
    /** Leave the Day as it is. */
    KEEP,
    /** Shrink it to a doable size: fewer estimated minutes, optionally a new title. */
    REDUCE,
    /**
     * Give it another date: inside its WEEK Goal when it has one, otherwise today or later. The time
     * placement is removed.
     */
    MOVE,
    /**
     * Continue it in a later period as a new Day (REC-003). The source Day keeps its date and status as
     * the record of the earlier plan; only the new Day points back at it.
     */
    CARRY_OVER,
    /** Let it go for this plan: status SKIPPED, so the record stays for Review. */
    DROP
}
