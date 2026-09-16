package app.dayflow.focus

/**
 * The persisted Focus session. Pure Kotlin (no Android types) so the blocking decision is unit-testable.
 * A session is running only while `active` and before `endsAtMs`; after that everything is allowed again,
 * even if nobody called stopFocus.
 */
data class FocusSession(
  val active: Boolean,
  val endsAtMs: Long,
  val blockedPackages: Set<String>,
) {
  fun isRunning(nowMs: Long): Boolean = active && nowMs < endsAtMs

  /** Primitive values for SharedPreferences. */
  fun blockedPackagesText(): String = blockedPackages.sorted().joinToString("\n")

  companion object {
    val NONE = FocusSession(active = false, endsAtMs = 0L, blockedPackages = emptySet())

    fun restore(active: Boolean, endsAtMs: Long, blockedPackagesText: String): FocusSession =
      FocusSession(active, endsAtMs, blockedPackagesText.split("\n").map { it.trim() }.filter { it.isNotEmpty() }.toSet())
  }
}

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

  fun start(session: FocusSession, durationMinutes: Int, nowMs: Long): FocusSession {
    require(durationMinutes in 1..MAX_DURATION_MINUTES) { "durationMinutes must be between 1 and $MAX_DURATION_MINUTES" }
    return session.copy(active = true, endsAtMs = nowMs + durationMinutes * 60_000L)
  }

  fun stop(session: FocusSession): FocusSession = session.copy(active = false, endsAtMs = 0L)

  /** Trimmed, de-duplicated package names; throws when one is not a valid Android package name. */
  fun normalizePackages(packageNames: List<String>): Set<String> {
    val trimmed = packageNames.map { it.trim() }.filter { it.isNotEmpty() }
    val invalid = trimmed.filterNot { PACKAGE_NAME.matches(it) }
    require(invalid.isEmpty()) { "Invalid package name: ${invalid.joinToString(", ")}" }
    return trimmed.toSet()
  }
}
