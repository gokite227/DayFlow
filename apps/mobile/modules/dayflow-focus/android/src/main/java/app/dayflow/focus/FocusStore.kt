package app.dayflow.focus

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings

/**
 * Native SharedPreferences for the Focus session, shared by the React Native module and the
 * AccessibilityService (same app process), so blocking keeps working while the JS app is closed.
 */
class FocusStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun load(): FocusSession =
    FocusSession.restore(
      active = prefs.getBoolean(KEY_ACTIVE, false),
      endsAtMs = prefs.getLong(KEY_ENDS_AT_MS, 0L),
      blockedPackagesText = prefs.getString(KEY_BLOCKED_PACKAGES, "") ?: "",
    )

  fun save(session: FocusSession) {
    prefs.edit()
      .putBoolean(KEY_ACTIVE, session.active)
      .putLong(KEY_ENDS_AT_MS, session.endsAtMs)
      .putString(KEY_BLOCKED_PACKAGES, session.blockedPackagesText())
      .commit()
  }

  companion object {
    private const val PREFS_NAME = "dayflow_focus_poc"
    private const val KEY_ACTIVE = "focus_active"
    private const val KEY_ENDS_AT_MS = "focus_ends_at_ms"
    private const val KEY_BLOCKED_PACKAGES = "blocked_packages"
  }
}

/** DayFlow itself, every installed launcher and the Settings app: never blocked. */
@Suppress("DEPRECATION")
fun alwaysAllowedPackages(context: Context): Set<String> {
  val pm = context.packageManager
  val launchers = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY)
    .map { it.activityInfo.packageName }
  val settings = pm.resolveActivity(Intent(Settings.ACTION_SETTINGS), PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
  return (launchers + listOfNotNull(settings, context.packageName)).toSet()
}
