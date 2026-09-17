package app.dayflow.focus

import java.util.Calendar
import java.util.TimeZone

/**
 * What the block screen shows, decided only from the native FocusStore session (DayFlow's JS app may not be running).
 * Pure Kotlin, so "STRICT never offers 집중 종료" is unit-testable.
 */
data class FocusBlockContent(
  val title: String,
  val message: String,
  /** Day title, remaining time and end time. */
  val detail: String,
  /** FLEXIBLE only. Ending still goes through FocusPolicy.stop, which refuses a STRICT session anyway. */
  val showStopButton: Boolean,
) {
  companion object {
    const val CONTINUE_LABEL = "집중 계속하기"
    const val STOP_LABEL = "집중 종료"
    const val STOP_CONFIRM_TITLE = "집중을 종료할까요?"
    const val STOP_CONFIRM_MESSAGE = "종료하면 선택한 앱을 다시 사용할 수 있어요."

    fun from(session: FocusSession, nowMs: Long, timeZone: TimeZone = TimeZone.getDefault()): FocusBlockContent {
      val end = koreanClock(session.endsAtMs, timeZone)
      val remainingMinutes = ((session.endsAtMs - nowMs).coerceAtLeast(0L) + 59_999L) / 60_000L
      val detail = listOfNotNull(
        session.dayTitle?.takeIf { it.isNotBlank() },
        "약 ${remainingMinutes}분 남았어요 · $end 종료",
      ).joinToString("\n")
      return if (session.lockMode == FocusLockMode.STRICT) {
        FocusBlockContent(title = "🔒 강제 집중 중", message = "${end}에 자동으로 해제돼요.", detail = detail, showStopButton = false)
      } else {
        FocusBlockContent(title = "집중 중이에요", message = "이 앱은 집중 시간 동안 차단되어 있어요.", detail = detail, showStopButton = true)
      }
    }

    /** "오후 4:20" */
    fun koreanClock(epochMs: Long, timeZone: TimeZone): String {
      val calendar = Calendar.getInstance(timeZone).apply { timeInMillis = epochMs }
      val hour = calendar.get(Calendar.HOUR_OF_DAY)
      val displayHour = if (hour % 12 == 0) 12 else hour % 12
      return "${if (hour < 12) "오전" else "오후"} $displayHour:${calendar.get(Calendar.MINUTE).toString().padStart(2, '0')}"
    }
  }
}
