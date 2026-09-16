package app.dayflow.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FocusPolicyTest {
  private val now = 1_800_000_000_000L
  private val instagram = "com.instagram.android"
  private val dayflow = "app.dayflow.mobile"
  private val launcher = "com.sec.android.app.launcher"
  private val deviceAllowed = setOf(dayflow, launcher)
  private val blockedList = FocusSession.NONE.copy(blockedPackages = setOf(instagram, dayflow, launcher, "com.android.settings"))

  @Test
  fun focusOffAllowsBlockedPackage() {
    assertFalse(FocusPolicy.shouldBlock(instagram, blockedList, now, deviceAllowed))
  }

  @Test
  fun focusOnBlocksBlockedPackage() {
    val session = FocusPolicy.start(blockedList, 5, now)
    assertTrue(FocusPolicy.shouldBlock(instagram, session, now + 60_000L, deviceAllowed))
  }

  @Test
  fun focusOnAllowsPackageNotInList() {
    val session = FocusPolicy.start(blockedList, 5, now)
    assertFalse(FocusPolicy.shouldBlock("com.google.android.youtube", session, now, deviceAllowed))
  }

  @Test
  fun dayflowLauncherSettingsAndSystemUiAreAlwaysAllowed() {
    val session = FocusPolicy.start(blockedList.copy(blockedPackages = blockedList.blockedPackages + "com.android.systemui"), 5, now)
    for (packageName in listOf(dayflow, launcher, "com.android.settings", "com.android.systemui", "android")) {
      assertFalse(packageName, FocusPolicy.shouldBlock(packageName, session, now, deviceAllowed))
    }
    assertFalse(FocusPolicy.shouldBlock(null, session, now, deviceAllowed))
  }

  @Test
  fun expiredFocusAllows() {
    val session = FocusPolicy.start(blockedList, 5, now)
    assertTrue(FocusPolicy.shouldBlock(instagram, session, now + 5 * 60_000L - 1, deviceAllowed))
    assertFalse(FocusPolicy.shouldBlock(instagram, session, now + 5 * 60_000L, deviceAllowed))
  }

  @Test
  fun stopFocusAllowsImmediately() {
    val stopped = FocusPolicy.stop(FocusPolicy.start(blockedList, 5, now))
    assertFalse(FocusPolicy.shouldBlock(instagram, stopped, now + 1, deviceAllowed))
    assertEquals(blockedList.blockedPackages, stopped.blockedPackages)
  }

  @Test
  fun persistedSessionRestores() {
    val session = FocusPolicy.start(blockedList, 5, now)
    val restored = FocusSession.restore(session.active, session.endsAtMs, session.blockedPackagesText())
    assertEquals(session, restored)
    assertTrue(FocusPolicy.shouldBlock(instagram, restored, now + 1, deviceAllowed))
    assertEquals(FocusSession.NONE, FocusSession.restore(false, 0L, ""))
  }

  @Test(expected = IllegalArgumentException::class)
  fun rejectsInvalidPackageNames() {
    FocusPolicy.normalizePackages(listOf("com.instagram.android", "not a package"))
  }

  @Test(expected = IllegalArgumentException::class)
  fun rejectsInvalidDuration() {
    FocusPolicy.start(blockedList, 0, now)
  }
}
