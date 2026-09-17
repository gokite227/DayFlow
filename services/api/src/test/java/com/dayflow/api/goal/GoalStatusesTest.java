package com.dayflow.api.goal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class GoalStatusesTest {

    private static final LocalDate START = LocalDate.of(2026, 9, 21);
    private static final LocalDate END = LocalDate.of(2026, 10, 8);

    @Test
    void derivesUpcoming() {
        assertThat(GoalStatuses.derive(START, END, LocalDate.of(2026, 9, 20))).isEqualTo(GoalStatus.UPCOMING);
    }

    @Test
    void derivesActiveIncludingBoundaries() {
        assertThat(GoalStatuses.derive(START, END, START)).isEqualTo(GoalStatus.ACTIVE);
        assertThat(GoalStatuses.derive(START, END, END)).isEqualTo(GoalStatus.ACTIVE);
    }

    @Test
    void derivesEnded() {
        assertThat(GoalStatuses.derive(START, END, LocalDate.of(2026, 10, 9))).isEqualTo(GoalStatus.ENDED);
    }
}
