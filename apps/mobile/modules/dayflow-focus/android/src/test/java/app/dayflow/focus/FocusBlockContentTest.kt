package app.dayflow.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class FocusBlockContentTest {
  private val seoul = TimeZone.getTimeZone("Asia/Seoul")
  private val start = Calendar.getInstance(seoul).apply { clear(); set(2026, Calendar.SEPTEMBER, 18, 15, 30) }.timeInMillis
  private val end = start + 50 * 60_000L

  private fun session(lockMode: FocusLockMode, dayTitle: String? = "수학 공부") =
    FocusPolicy.startUntil(
      FocusSession.NONE,
      end,
      start,
      setOf("com.google.android.youtube"),
      FocusStartInfo(sessionId = "s", lockMode = lockMode, dayId = "d", dayTitle = dayTitle, origin = FocusOrigin.MANUAL),
    )

  @Test
  fun flexibleOffersStop() {
    val content = FocusBlockContent.from(session(FocusLockMode.FLEXIBLE), start + 2 * 60_000L, seoul)
    assertEquals("집중 중이에요", content.title)
    assertEquals("이 앱은 집중 시간 동안 차단되어 있어요.", content.message)
    assertEquals("수학 공부\n약 48분 남았어요 · 오후 4:20 종료", content.detail)
    assertTrue(content.showStopButton)
  }

  @Test
  fun strictNeverOffersStop() {
    val content = FocusBlockContent.from(session(FocusLockMode.STRICT, dayTitle = null), start + 2 * 60_000L, seoul)
    assertEquals("🔒 강제 집중 중", content.title)
    assertEquals("오후 4:20에 자동으로 해제돼요.", content.message)
    assertEquals("약 48분 남았어요 · 오후 4:20 종료", content.detail)
    assertFalse(content.showStopButton)
  }

  @Test
  fun stopFromTheBlockScreenFollowsTheNativeLockPolicy() {
    val flexible = session(FocusLockMode.FLEXIBLE)
    assertFalse(FocusPolicy.stop(flexible, start + 60_000L).isRunning(start + 60_000L))
    try {
      FocusPolicy.stop(session(FocusLockMode.STRICT), start + 60_000L)
      throw AssertionError("STRICT must not stop early")
    } catch (expected: FocusLockedException) {
      // refused
    }
  }

  @Test
  fun koreanClock() {
    val midnight = Calendar.getInstance(seoul).apply { clear(); set(2026, Calendar.SEPTEMBER, 18, 0, 5) }.timeInMillis
    assertEquals("오전 12:05", FocusBlockContent.koreanClock(midnight, seoul))
    assertEquals("오후 12:00", FocusBlockContent.koreanClock(midnight + (11 * 60 + 55) * 60_000L, seoul))
  }
}
