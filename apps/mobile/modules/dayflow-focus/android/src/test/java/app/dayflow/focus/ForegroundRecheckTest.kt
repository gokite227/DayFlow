package app.dayflow.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ForegroundRecheckTest {
  private val now = 1_800_000_000_000L
  private val youtube = "com.google.android.youtube"
  private val dayflow = "app.dayflow.mobile"
  private val launcher = "com.sec.android.app.launcher"
  private val settings = "com.android.settings"
  private val keyboard = "com.samsung.android.honeyboard"
  private val allowed = setOf(dayflow, launcher, settings)
  private val ime = setOf(keyboard)

  private fun autoStart(packages: Set<String> = setOf(youtube), lockMode: FocusLockMode = FocusLockMode.FLEXIBLE) =
    FocusPolicy.startUntil(
      FocusSession.NONE,
      now + 90 * 60_000L,
      now,
      packages,
      FocusStartInfo(sessionId = "s", lockMode = lockMode, dayId = "d", dayTitle = "수학 공부", origin = FocusOrigin.AUTO),
    )

  private fun recheck(foreground: String?, session: FocusSession, interactive: Boolean = true, locked: Boolean = false) =
    ForegroundRecheck.packageToBlock(foreground, interactive, locked, session, now + 1_000L, allowed)

  /** A. YouTube is open → AUTO Focus starts → blocked at once, without a window change. */
  @Test
  fun openBlockedAppIsBlockedWhenFocusStarts() {
    assertEquals(youtube, recheck(youtube, autoStart()))
    assertEquals(youtube, recheck(youtube, autoStart(lockMode = FocusLockMode.STRICT)))
  }

  /** B. DayFlow / Settings / launcher open → Focus starts → nothing is blocked (even if listed). */
  @Test
  fun allowedAppsAreNotBlocked() {
    val listedAnyway = autoStart(setOf(youtube, dayflow, settings, launcher))
    for (packageName in listOf(dayflow, settings, launcher, "com.android.systemui")) {
      assertNull(packageName, recheck(packageName, listedAnyway))
    }
  }

  /** C. An app that is not selected is open → Focus starts → not blocked. */
  @Test
  fun unselectedAppIsNotBlocked() {
    assertNull(recheck("com.android.chrome", autoStart()))
  }

  /** D. YouTube in use while Focus is off → not blocked; the moment Focus turns on → blocked. */
  @Test
  fun focusOffDoesNotBlockButTurningItOnDoes() {
    val off = FocusSession.NONE.copy(blockedPackages = setOf(youtube))
    assertNull(recheck(youtube, off))
    assertEquals(youtube, recheck(youtube, autoStart()))
    val ended = FocusPolicy.stop(autoStart(), now + 1_000L)
    assertNull(recheck(youtube, ended))
  }

  @Test
  fun nothingObservedSinceTheServiceConnectedBlocksNothing() {
    assertNull(recheck(null, autoStart()))
  }

  @Test
  fun screenOffOrLockedDeviceIsNotBlockedFromAStaleForeground() {
    assertNull(recheck(youtube, autoStart(), interactive = false))
    assertNull(recheck(youtube, autoStart(), locked = true))
  }

  @Test
  fun expiredSessionBlocksNothing() {
    val session = autoStart()
    assertNull(ForegroundRecheck.packageToBlock(youtube, true, false, session, session.endsAtMs, allowed))
  }

  @Test
  fun shadeAndKeyboardDoNotReplaceTheForegroundApp() {
    var foreground = ForegroundRecheck.nextForeground(null, youtube, ime)
    foreground = ForegroundRecheck.nextForeground(foreground, "com.android.systemui", ime)
    foreground = ForegroundRecheck.nextForeground(foreground, keyboard, ime)
    foreground = ForegroundRecheck.nextForeground(foreground, null, ime)
    assertEquals(youtube, foreground)
    // Leaving YouTube for another app replaces it, so a later Focus start does not block YouTube.
    foreground = ForegroundRecheck.nextForeground(foreground, launcher, ime)
    assertEquals(launcher, foreground)
    assertNull(recheck(foreground, autoStart()))
  }
}
