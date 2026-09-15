package com.dayflow.api.recovery;

/** REC-001 decisions for an unfinished Day (requirements §4.3). */
public enum RecoveryAction {
    /** Leave the Day as it is. */
    KEEP,
    /** Shrink it to a doable size: fewer estimated minutes, optionally a new title. */
    REDUCE,
    /** Give it another date inside its WEEK Goal; the time placement is removed. */
    MOVE,
    /** Let it go for this plan: status SKIPPED, so the record stays for Review. */
    DROP
}
