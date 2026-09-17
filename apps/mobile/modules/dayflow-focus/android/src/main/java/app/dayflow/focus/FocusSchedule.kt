package app.dayflow.focus

/** What happens when a Day schedule starts. MANUAL Days are never sent to native. */
enum class FocusTrigger {
  NOTIFY_ONLY,
  ASK,
  AUTO;

  companion object {
    fun parse(value: String?): FocusTrigger? = entries.firstOrNull { it.name == value }
  }
}

/**
 * Lifecycle of one scheduled Focus:
 * SCHEDULED → alarm armed; NOTIFIED (NOTIFY_ONLY) / ASKED (ASK, waiting for the answer) / STARTED (AUTO, or ASK
 * accepted) / DISMISSED ("나중에") / SKIPPED (another Focus was running, or it could not start) / MISSED (the
 * schedule was registered after its start time, so it is never fired late).
 */
enum class FocusScheduleStatus {
  SCHEDULED,
  NOTIFIED,
  ASKED,
  STARTED,
  DISMISSED,
  SKIPPED,
  MISSED;

  companion object {
    fun parse(value: String?): FocusScheduleStatus = entries.firstOrNull { it.name == value } ?: SCHEDULED
  }
}

/** One Day schedule the native layer acts on at its start time, even when DayFlow is not running. */
data class ScheduledFocus(
  /** Stable per Day ("day:<dayId>"): a changed schedule replaces its alarm instead of adding a second one. */
  val id: String,
  val dayId: String,
  val title: String,
  val startAtMs: Long,
  val endAtMs: Long,
  val trigger: FocusTrigger,
  val lockMode: FocusLockMode,
  val packages: List<String>,
  val appLabels: Map<String, String> = emptyMap(),
  val status: FocusScheduleStatus = FocusScheduleStatus.SCHEDULED,
) {
  /** Everything that, when changed, makes this a new schedule to act on again. */
  val fingerprint: String
    get() = listOf(startAtMs, endAtMs, trigger.name, lockMode.name, packages.sorted().joinToString(","), title).joinToString("|")
}

data class SchedulePlan(
  /** Alarms (and any prompt notification) to remove: the Day, its schedule or its automation is gone. */
  val toCancel: List<String>,
  /** Prompt/start notifications to remove: their Day, schedule or automation changed or is gone. */
  val outdatedNotifications: List<String>,
  /** Alarms to (re)arm. Arming the same id again replaces the previous alarm. */
  val toArm: List<ScheduledFocus>,
  /** The registry to store. */
  val next: List<ScheduledFocus>,
)

sealed interface ScheduleAction {
  data object None : ScheduleAction
  data object Expired : ScheduleAction
  data object Notify : ScheduleAction
  data object Ask : ScheduleAction
  data object Start : ScheduleAction
  /** Only one Focus at a time: a running session is left alone. */
  data object Busy : ScheduleAction
}

object FocusSchedulePolicy {
  /** A schedule registered this long after its start still fires (e.g. created for "now"); older ones are MISSED. */
  const val LATE_REGISTRATION_GRACE_MS = 60_000L

  fun identifier(dayId: String): String = "day:$dayId"

  fun isValid(entry: ScheduledFocus): Boolean =
    entry.id == identifier(entry.dayId) &&
      entry.endAtMs > entry.startAtMs &&
      entry.endAtMs - entry.startAtMs <= FocusPolicy.MAX_DURATION_MINUTES * 60_000L

  /**
   * The desired schedules (from JS) against the stored registry. Unchanged entries keep their status, so a
   * schedule that already fired never fires twice; a changed one starts over. Ended or invalid schedules are
   * dropped, duplicates keep the first entry.
   */
  fun plan(current: List<ScheduledFocus>, desired: List<ScheduledFocus>, nowMs: Long): SchedulePlan {
    val currentById = current.associateBy { it.id }
    val next = desired
      .filter { isValid(it) && it.endAtMs > nowMs }
      .distinctBy { it.id }
      .map { wanted ->
        val existing = currentById[wanted.id]
        when {
          existing != null && existing.fingerprint == wanted.fingerprint -> existing
          wanted.startAtMs < nowMs - LATE_REGISTRATION_GRACE_MS -> wanted.copy(status = FocusScheduleStatus.MISSED)
          else -> wanted.copy(status = FocusScheduleStatus.SCHEDULED)
        }
      }
    val nextIds = next.map { it.id }.toSet()
    val armed = next.filter { it.status == FocusScheduleStatus.SCHEDULED }.map { it.id }.toSet()
    val toCancel = current.map { it.id }.filter { it !in nextIds || it !in armed }.distinct()
    val nextById = next.associateBy { it.id }
    val outdated = current.filter { nextById[it.id]?.fingerprint != it.fingerprint }.map { it.id }.distinct()
    return SchedulePlan(toCancel = toCancel, outdatedNotifications = outdated, toArm = next.filter { it.id in armed }, next = next)
  }

  /** What to do when the alarm of `entry` fires (or when a due schedule is found while DayFlow is open). */
  fun onStart(entry: ScheduledFocus, session: FocusSession, nowMs: Long): ScheduleAction {
    if (entry.status != FocusScheduleStatus.SCHEDULED) return ScheduleAction.None
    if (nowMs >= entry.endAtMs) return ScheduleAction.Expired
    if (nowMs < entry.startAtMs) return ScheduleAction.None
    return when (entry.trigger) {
      FocusTrigger.NOTIFY_ONLY -> ScheduleAction.Notify
      FocusTrigger.ASK -> ScheduleAction.Ask
      FocusTrigger.AUTO -> if (session.isRunning(nowMs)) ScheduleAction.Busy else ScheduleAction.Start
    }
  }

  /** The user chose "집중 시작" for an ASK schedule (notification action or in-app prompt). */
  fun onAccept(entry: ScheduledFocus, session: FocusSession, nowMs: Long): ScheduleAction {
    if (entry.trigger != FocusTrigger.ASK) return ScheduleAction.None
    if (entry.status != FocusScheduleStatus.ASKED && entry.status != FocusScheduleStatus.SCHEDULED) return ScheduleAction.None
    if (nowMs >= entry.endAtMs) return ScheduleAction.Expired
    if (session.isRunning(nowMs)) return ScheduleAction.Busy
    return ScheduleAction.Start
  }

  /** Schedules whose start has passed but that have not fired yet (an inexact alarm that is still pending). */
  fun due(entries: List<ScheduledFocus>, nowMs: Long): List<ScheduledFocus> =
    entries.filter { it.status == FocusScheduleStatus.SCHEDULED && it.startAtMs <= nowMs && nowMs < it.endAtMs }

  /** The session an accepted or automatic schedule starts: it ends with the Day schedule. */
  fun startInfo(entry: ScheduledFocus, sessionId: String): FocusStartInfo =
    FocusStartInfo(
      sessionId = sessionId,
      lockMode = entry.lockMode,
      dayId = entry.dayId,
      dayTitle = entry.title,
      origin = if (entry.trigger == FocusTrigger.AUTO) FocusOrigin.AUTO else FocusOrigin.ASK,
      appLabels = entry.appLabels,
    )
}
