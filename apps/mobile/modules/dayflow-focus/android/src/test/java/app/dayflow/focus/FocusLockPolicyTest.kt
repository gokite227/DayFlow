package app.dayflow.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FocusLockPolicyTest {
  private val now = 1_800_000_000_000L
  private val instagram = "com.instagram.android"
  private val allowed = setOf("app.dayflow.mobile")

  private fun info(lockMode: FocusLockMode) =
    FocusStartInfo(
      sessionId = "s1",
      lockMode = lockMode,
      dayId = "day-1",
      dayTitle = "수학 공부",
      origin = FocusOrigin.MANUAL,
      appLabels = mapOf(instagram to "Instagram", "gone.app" to "Gone"),
    )

  private fun started(lockMode: FocusLockMode) =
    FocusPolicy.startUntil(FocusSession.NONE, now + 50 * 60_000L, now, setOf(instagram), info(lockMode))

  @Test
  fun flexibleStopReleasesImmediately() {
    val stopped = FocusPolicy.stop(started(FocusLockMode.FLEXIBLE), now + 60_000L)
    assertFalse(stopped.isRunning(now + 60_000L))
    assertFalse(FocusPolicy.shouldBlock(instagram, stopped, now + 60_001L, allowed))
  }

  @Test(expected = FocusLockedException::class)
  fun strictCannotBeStoppedBeforeItsEnd() {
    FocusPolicy.stop(started(FocusLockMode.STRICT), now + 49 * 60_000L)
  }

  @Test(expected = FocusLockedException::class)
  fun strictBlockListCannotChange() {
    FocusPolicy.withBlockedPackages(started(FocusLockMode.STRICT), emptySet(), now + 60_000L)
  }

  @Test(expected = FocusLockedException::class)
  fun strictCannotBeReplacedByAnotherStart() {
    FocusPolicy.startUntil(started(FocusLockMode.STRICT), now + 5 * 60_000L, now + 60_000L, emptySet(), info(FocusLockMode.FLEXIBLE))
  }

  @Test(expected = FocusLockedException::class)
  fun strictCannotBeShortenedThroughTheDebugStart() {
    FocusPolicy.start(started(FocusLockMode.STRICT), 1, now + 60_000L)
  }

  @Test
  fun strictExpiresOnItsOwnAndCanThenBeCleared() {
    val session = started(FocusLockMode.STRICT)
    val end = now + 50 * 60_000L
    assertTrue(session.isLocked(end - 1))
    assertTrue(FocusPolicy.shouldBlock(instagram, session, end - 1, allowed))
    assertFalse(session.isLocked(end))
    assertFalse(FocusPolicy.shouldBlock(instagram, session, end, allowed))
    assertFalse(FocusPolicy.stop(session, end).active)
  }

  @Test
  fun startCarriesDayMetadataAndOnlyLabelsOfBlockedApps() {
    val session = started(FocusLockMode.STRICT)
    assertEquals("s1", session.sessionId)
    assertEquals("day-1", session.dayId)
    assertEquals(FocusLockMode.STRICT, session.lockMode)
    assertEquals(now, session.startedAtMs)
    assertEquals(mapOf(instagram to "Instagram"), session.appLabels)
  }

  @Test(expected = IllegalArgumentException::class)
  fun rejectsAnEndThatIsNotInTheFuture() {
    FocusPolicy.startUntil(FocusSession.NONE, now, now, emptySet(), info(FocusLockMode.FLEXIBLE))
  }

  @Test
  fun unknownStoredModesFallBackToFlexibleManual() {
    assertEquals(FocusLockMode.FLEXIBLE, FocusLockMode.parse("SOMETHING"))
    assertEquals(FocusOrigin.MANUAL, FocusOrigin.parse(null))
  }
}
