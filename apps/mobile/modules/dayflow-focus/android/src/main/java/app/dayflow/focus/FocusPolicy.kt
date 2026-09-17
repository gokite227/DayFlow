package app.dayflow.focus

/** FLEXIBLE: may be ended early. STRICT: may not be ended (or changed) before endsAt from DayFlow. */
enum class FocusLockMode {
  FLEXIBLE,
  STRICT;

  companion object {
    fun parse(value: String?): FocusLockMode = entries.firstOrNull { it.name == value } ?: FLEXIBLE
  }
}

/** How a session was started: in the Focus screen, by accepting a scheduled prompt, or automatically. */
enum class FocusOrigin {
  MANUAL,
  ASK,
  AUTO;

  companion object {
    fun parse(value: String?): FocusOrigin = entries.firstOrNull { it.name == value } ?: MANUAL
  }
}

/**
 * The persisted Focus session. Pure Kotlin (no Android types) so the blocking decision is unit-testable.
 * A session is running only while `active` and before `endsAtMs`; after that everything is allowed again,
 * even if nobody called stopFocus.
 *
 * `sessionId`, `dayId`, `dayTitle`, `origin`, `startedAtMs` and `appLabels` are product metadata the native
 * layer only carries, so a session started while DayFlow is closed (a scheduled Focus) can be restored in JS.
 */
data class FocusSession(
  val active: Boolean,
  val endsAtMs: Long,
  val blockedPackages: Set<String>,
  val lockMode: FocusLockMode = FocusLockMode.FLEXIBLE,
  val sessionId: String? = null,
  val dayId: String? = null,
  val dayTitle: String? = null,
  val origin: FocusOrigin = FocusOrigin.MANUAL,
  val startedAtMs: Long = 0L,
  val appLabels: Map<String, String> = emptyMap(),
) {
  fun isRunning(nowMs: Long): Boolean = active && nowMs < endsAtMs

  /** STRICT and still running: DayFlow must not stop it or change what it blocks. */
  fun isLocked(nowMs: Long): Boolean = isRunning(nowMs) && lockMode == FocusLockMode.STRICT

  /** Primitive values for SharedPreferences. */
  fun blockedPackagesText(): String = blockedPackages.sorted().joinToString("\n")

  companion object {
    val NONE = FocusSession(active = false, endsAtMs = 0L, blockedPackages = emptySet())

    fun restore(active: Boolean, endsAtMs: Long, blockedPackagesText: String): FocusSession =
      FocusSession(active, endsAtMs, blockedPackagesText.split("\n").map { it.trim() }.filter { it.isNotEmpty() }.toSet())
  }
}

/** What a session start carries besides its end time and block list. */
data class FocusStartInfo(
  val sessionId: String?,
  val lockMode: FocusLockMode,
  val dayId: String?,
  val dayTitle: String?,
  val origin: FocusOrigin,
  val appLabels: Map<String, String> = emptyMap(),
)

/** A STRICT session is running: stopping or changing it from DayFlow is refused. */
class FocusLockedException : IllegalStateException("집중 잠금 중에는 종료 시각 전까지 집중을 끝내거나 바꿀 수 없어요.")

object FocusPolicy {
  const val MAX_DURATION_MINUTES = 12 * 60

  /** Never blocked, whatever the list says: the system UI and core Android packages. */
  val SYSTEM_ALLOWED: Set<String> = setOf("android", "com.android.systemui", "com.android.settings")

  private val PACKAGE_NAME = Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$")

  /**
   * @param alwaysAllowed packages resolved on the device: DayFlow itself, the launcher(s), the Settings app.
   */
  fun shouldBlock(packageName: String?, session: FocusSession, nowMs: Long, alwaysAllowed: Set<String>): Boolean {
    if (packageName.isNullOrBlank()) return false
    if (packageName in SYSTEM_ALLOWED || packageName in alwaysAllowed) return false
    if (!session.isRunning(nowMs)) return false
    return packageName in session.blockedPackages
  }

  /** Debug start (FLEXIBLE, no metadata) for `durationMinutes` from now. */
  fun start(session: FocusSession, durationMinutes: Int, nowMs: Long): FocusSession {
    require(durationMinutes in 1..MAX_DURATION_MINUTES) { "durationMinutes must be between 1 and $MAX_DURATION_MINUTES" }
    if (session.isLocked(nowMs)) throw FocusLockedException()
    return session.copy(active = true, endsAtMs = nowMs + durationMinutes * 60_000L, lockMode = FocusLockMode.FLEXIBLE, startedAtMs = nowMs)
  }

  /**
   * Starts a session that ends at `endsAtMs` (a Day schedule's end, or now + the chosen minutes). A running
   * STRICT session can never be replaced; the caller decides whether a running FLEXIBLE one may be.
   */
  fun startUntil(session: FocusSession, endsAtMs: Long, nowMs: Long, packages: Set<String>, info: FocusStartInfo): FocusSession {
    require(endsAtMs > nowMs) { "endsAt must be in the future" }
    require(endsAtMs - nowMs <= MAX_DURATION_MINUTES * 60_000L) { "Focus can last at most $MAX_DURATION_MINUTES minutes" }
    if (session.isLocked(nowMs)) throw FocusLockedException()
    return FocusSession(
      active = true,
      endsAtMs = endsAtMs,
      blockedPackages = packages,
      lockMode = info.lockMode,
      sessionId = info.sessionId,
      dayId = info.dayId,
      dayTitle = info.dayTitle,
      origin = info.origin,
      startedAtMs = nowMs,
      appLabels = info.appLabels.filterKeys { it in packages },
    )
  }

  /** FLEXIBLE (or already ended): stops at once. STRICT before endsAt: refused. */
  fun stop(session: FocusSession, nowMs: Long): FocusSession {
    if (session.isLocked(nowMs)) throw FocusLockedException()
    return session.copy(active = false, endsAtMs = 0L)
  }

  /** Kept for the POC tests: a stop that ignores the lock (only valid for FLEXIBLE sessions). */
  fun stop(session: FocusSession): FocusSession = session.copy(active = false, endsAtMs = 0L)

  /** The block list may change only while no STRICT session runs. */
  fun withBlockedPackages(session: FocusSession, packages: Set<String>, nowMs: Long): FocusSession {
    if (session.isLocked(nowMs)) throw FocusLockedException()
    return session.copy(blockedPackages = packages)
  }

  /**
   * What is actually stored as the block list: DayFlow, launchers, Settings and System UI are dropped, so a
   * list sent by any caller can never contain an app that must stay usable.
   */
  fun blockablePackages(packageNames: Set<String>, alwaysAllowed: Set<String>): Set<String> =
    packageNames.filterNot { it in SYSTEM_ALLOWED || it in alwaysAllowed || it in InstalledAppFilter.CORE_EXCLUDED }.toSet()

  /** Trimmed, de-duplicated package names; throws when one is not a valid Android package name. */
  fun normalizePackages(packageNames: List<String>): Set<String> {
    val trimmed = packageNames.map { it.trim() }.filter { it.isNotEmpty() }
    val invalid = trimmed.filterNot { PACKAGE_NAME.matches(it) }
    require(invalid.isEmpty()) { "Invalid package name: ${invalid.joinToString(", ")}" }
    return trimmed.toSet()
  }
}
