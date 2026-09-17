package app.dayflow.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FocusSchedulePolicyTest {
  private val now = 1_800_000_000_000L
  private val minute = 60_000L

  private fun entry(
    dayId: String = "day-1",
    start: Long = now + 10 * minute,
    end: Long = now + 100 * minute,
    trigger: FocusTrigger = FocusTrigger.ASK,
    status: FocusScheduleStatus = FocusScheduleStatus.SCHEDULED,
  ) = ScheduledFocus(
    id = FocusSchedulePolicy.identifier(dayId),
    dayId = dayId,
    title = "수학 공부",
    startAtMs = start,
    endAtMs = end,
    trigger = trigger,
    lockMode = FocusLockMode.FLEXIBLE,
    packages = listOf("com.instagram.android"),
    status = status,
  )

  @Test
  fun identifierIsStablePerDay() {
    assertEquals("day:abc", FocusSchedulePolicy.identifier("abc"))
    assertEquals(entry().id, entry(start = now + 30 * minute).id)
  }

  @Test
  fun newScheduleIsArmedOnceEvenWhenSentTwice() {
    val plan = FocusSchedulePolicy.plan(emptyList(), listOf(entry(), entry()), now)
    assertEquals(listOf("day:day-1"), plan.toArm.map { it.id })
    assertEquals(1, plan.next.size)
    assertTrue(plan.toCancel.isEmpty())
  }

  @Test
  fun changedStartTimeReplacesTheAlarmAndStartsOver() {
    val asked = entry(status = FocusScheduleStatus.ASKED)
    val plan = FocusSchedulePolicy.plan(listOf(asked), listOf(entry(start = now + 20 * minute)), now)
    assertEquals(listOf("day:day-1"), plan.toArm.map { it.id })
    assertEquals(FocusScheduleStatus.SCHEDULED, plan.next.single().status)
    assertEquals(now + 20 * minute, plan.next.single().startAtMs)
    assertEquals(listOf("day:day-1"), plan.outdatedNotifications)
  }

  @Test
  fun unchangedFiredScheduleIsNotArmedAgain() {
    val started = entry(status = FocusScheduleStatus.STARTED)
    val plan = FocusSchedulePolicy.plan(listOf(started), listOf(entry()), now)
    assertTrue(plan.toArm.isEmpty())
    assertEquals(FocusScheduleStatus.STARTED, plan.next.single().status)
    assertTrue(plan.outdatedNotifications.isEmpty())
  }

  @Test
  fun removedScheduleIsCancelled() {
    val plan = FocusSchedulePolicy.plan(listOf(entry(), entry(dayId = "day-2")), listOf(entry()), now)
    assertEquals(listOf("day:day-2"), plan.toCancel)
    assertEquals(listOf("day:day-2"), plan.outdatedNotifications)
    assertEquals(listOf("day:day-1"), plan.next.map { it.id })
  }

  @Test
  fun endedAndInvalidSchedulesAreDropped() {
    val ended = entry(dayId = "ended", start = now - 90 * minute, end = now)
    val reversed = entry(dayId = "reversed", start = now + 20 * minute, end = now + 10 * minute)
    val tooLong = entry(dayId = "long", end = now + 10 * minute + (12 * 60 + 1) * minute)
    val wrongId = entry().copy(id = "other")
    val plan = FocusSchedulePolicy.plan(emptyList(), listOf(ended, reversed, tooLong, wrongId), now)
    assertTrue(plan.next.isEmpty())
    assertTrue(plan.toArm.isEmpty())
  }

  @Test
  fun scheduleRegisteredLongAfterItsStartIsMissedNotFiredLate() {
    val late = FocusSchedulePolicy.plan(emptyList(), listOf(entry(start = now - 5 * minute)), now)
    assertEquals(FocusScheduleStatus.MISSED, late.next.single().status)
    assertTrue(late.toArm.isEmpty())
    val justNow = FocusSchedulePolicy.plan(emptyList(), listOf(entry(start = now - 30_000L)), now)
    assertEquals(FocusScheduleStatus.SCHEDULED, justNow.next.single().status)
  }

  @Test
  fun startActionFollowsTheTrigger() {
    val idle = FocusSession.NONE
    val at = now + 10 * minute
    assertEquals(ScheduleAction.Notify, FocusSchedulePolicy.onStart(entry(trigger = FocusTrigger.NOTIFY_ONLY), idle, at))
    assertEquals(ScheduleAction.Ask, FocusSchedulePolicy.onStart(entry(trigger = FocusTrigger.ASK), idle, at))
    assertEquals(ScheduleAction.Start, FocusSchedulePolicy.onStart(entry(trigger = FocusTrigger.AUTO), idle, at))
    assertEquals(ScheduleAction.None, FocusSchedulePolicy.onStart(entry(trigger = FocusTrigger.AUTO), idle, at - 1))
    assertEquals(ScheduleAction.None, FocusSchedulePolicy.onStart(entry(status = FocusScheduleStatus.STARTED), idle, at))
  }

  @Test
  fun lateOrBusyStart() {
    val running = FocusSession(active = true, endsAtMs = now + 30 * minute, blockedPackages = emptySet())
    assertEquals(ScheduleAction.Expired, FocusSchedulePolicy.onStart(entry(trigger = FocusTrigger.AUTO), FocusSession.NONE, now + 100 * minute))
    assertEquals(ScheduleAction.Busy, FocusSchedulePolicy.onStart(entry(trigger = FocusTrigger.AUTO), running, now + 10 * minute))
  }

  @Test
  fun acceptStartsOnlyAnOpenAskPromptUntilTheScheduleEnd() {
    val asked = entry(status = FocusScheduleStatus.ASKED)
    val at = now + 15 * minute
    assertEquals(ScheduleAction.Start, FocusSchedulePolicy.onAccept(asked, FocusSession.NONE, at))
    assertEquals(ScheduleAction.None, FocusSchedulePolicy.onAccept(entry(status = FocusScheduleStatus.DISMISSED), FocusSession.NONE, at))
    assertEquals(
      ScheduleAction.None,
      FocusSchedulePolicy.onAccept(entry(trigger = FocusTrigger.NOTIFY_ONLY, status = FocusScheduleStatus.NOTIFIED), FocusSession.NONE, at),
    )
    assertEquals(ScheduleAction.Expired, FocusSchedulePolicy.onAccept(asked, FocusSession.NONE, now + 100 * minute))
    val info = FocusSchedulePolicy.startInfo(asked, "s")
    assertEquals(FocusOrigin.ASK, info.origin)
    assertEquals("day-1", info.dayId)
    val session = FocusPolicy.startUntil(FocusSession.NONE, asked.endAtMs, at, asked.packages.toSet(), info)
    assertEquals(now + 100 * minute, session.endsAtMs)
  }

  @Test
  fun dueListsOnlyUnfiredSchedulesInsideTheirTime() {
    val due = entry(dayId = "due", start = now - minute)
    val future = entry(dayId = "future")
    val fired = entry(dayId = "fired", start = now - minute, status = FocusScheduleStatus.NOTIFIED)
    assertEquals(listOf("day:due"), FocusSchedulePolicy.due(listOf(due, future, fired), now).map { it.id })
  }
}
