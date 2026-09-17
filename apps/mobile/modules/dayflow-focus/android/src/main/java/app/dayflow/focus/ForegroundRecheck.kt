package app.dayflow.focus

/**
 * The foreground app the AccessibilityService last saw, and whether it may be blocked right now without waiting for
 * the next window change. Pure Kotlin, so the "never block a stale or wrong app" rules are unit-testable.
 *
 * Only package names of TYPE_WINDOW_STATE_CHANGED events are used (no window content), exactly as before.
 */
object ForegroundRecheck {
  /**
   * Windows that appear on top of an app without replacing it: the notification shade / quick settings (System UI)
   * and the keyboard. They do not change which app the user is in, so they do not replace the tracked foreground
   * app (e.g. accepting "집중 시작" from the shade over YouTube still re-checks YouTube).
   */
  fun isOverlayPackage(packageName: String, inputMethodPackages: Set<String>): Boolean =
    packageName == "com.android.systemui" || packageName in inputMethodPackages

  /** The tracked foreground app after a window change (overlays keep the previous one). */
  fun nextForeground(current: String?, eventPackage: String?, inputMethodPackages: Set<String>): String? {
    if (eventPackage.isNullOrBlank()) return current
    return if (isOverlayPackage(eventPackage, inputMethodPackages)) current else eventPackage
  }

  /**
   * The package to block immediately when a Focus starts or changes, or null.
   * - Nothing is blocked unless the service observed a foreground app since it (re)connected (`foreground` is only
   *   kept in memory of the live service, never persisted, so it cannot come from an old process or boot).
   * - Nothing is blocked while the screen is off or the device is locked: the tracked app is not what the user
   *   sees; the service re-checks when the screen turns on unlocked / the user unlocks.
   * - Otherwise the normal FocusPolicy decision (running session, block list, allow list) applies.
   */
  fun packageToBlock(
    foreground: String?,
    interactive: Boolean,
    keyguardLocked: Boolean,
    session: FocusSession,
    nowMs: Long,
    alwaysAllowed: Set<String>,
  ): String? {
    if (foreground == null || !interactive || keyguardLocked) return null
    return if (FocusPolicy.shouldBlock(foreground, session, nowMs, alwaysAllowed)) foreground else null
  }
}
