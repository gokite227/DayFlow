package app.dayflow.focus

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import org.json.JSONObject

/**
 * Native SharedPreferences for the Focus session, shared by the React Native module, the AccessibilityService
 * and the schedule receiver (same app process), so blocking keeps working while the JS app is closed.
 */
class FocusStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun load(): FocusSession =
    FocusSession.restore(
      active = prefs.getBoolean(KEY_ACTIVE, false),
      endsAtMs = prefs.getLong(KEY_ENDS_AT_MS, 0L),
      blockedPackagesText = prefs.getString(KEY_BLOCKED_PACKAGES, "") ?: "",
    ).copy(
      lockMode = FocusLockMode.parse(prefs.getString(KEY_LOCK_MODE, null)),
      sessionId = prefs.getString(KEY_SESSION_ID, null),
      dayId = prefs.getString(KEY_DAY_ID, null),
      dayTitle = prefs.getString(KEY_DAY_TITLE, null),
      origin = FocusOrigin.parse(prefs.getString(KEY_ORIGIN, null)),
      startedAtMs = prefs.getLong(KEY_STARTED_AT_MS, 0L),
      appLabels = parseLabels(prefs.getString(KEY_APP_LABELS, null)),
    )

  fun save(session: FocusSession) {
    prefs.edit()
      .putBoolean(KEY_ACTIVE, session.active)
      .putLong(KEY_ENDS_AT_MS, session.endsAtMs)
      .putString(KEY_BLOCKED_PACKAGES, session.blockedPackagesText())
      .putString(KEY_LOCK_MODE, session.lockMode.name)
      .putString(KEY_SESSION_ID, session.sessionId)
      .putString(KEY_DAY_ID, session.dayId)
      .putString(KEY_DAY_TITLE, session.dayTitle)
      .putString(KEY_ORIGIN, session.origin.name)
      .putLong(KEY_STARTED_AT_MS, session.startedAtMs)
      .putString(KEY_APP_LABELS, JSONObject(session.appLabels).toString())
      .commit()
  }

  private fun parseLabels(raw: String?): Map<String, String> =
    try {
      val json = JSONObject(raw ?: "{}")
      json.keys().asSequence().associateWith { json.optString(it) }
    } catch (error: Exception) {
      emptyMap()
    }

  companion object {
    private const val PREFS_NAME = "dayflow_focus_poc"
    private const val KEY_ACTIVE = "focus_active"
    private const val KEY_ENDS_AT_MS = "focus_ends_at_ms"
    private const val KEY_BLOCKED_PACKAGES = "blocked_packages"
    private const val KEY_LOCK_MODE = "lock_mode"
    private const val KEY_SESSION_ID = "session_id"
    private const val KEY_DAY_ID = "day_id"
    private const val KEY_DAY_TITLE = "day_title"
    private const val KEY_ORIGIN = "origin"
    private const val KEY_STARTED_AT_MS = "started_at_ms"
    private const val KEY_APP_LABELS = "app_labels"
  }
}

/** DayFlow itself, every installed launcher, the Settings app and the phone dialer: never blocked. */
@Suppress("DEPRECATION")
fun alwaysAllowedPackages(context: Context): Set<String> {
  val pm = context.packageManager
  val launchers = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY)
    .map { it.activityInfo.packageName }
  val settings = pm.resolveActivity(Intent(Settings.ACTION_SETTINGS), PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
  // Phone calls (including emergency calls) must stay possible during Focus.
  val dialers = pm.queryIntentActivities(Intent(Intent.ACTION_DIAL), PackageManager.MATCH_DEFAULT_ONLY).map { it.activityInfo.packageName }
  return (launchers + dialers + listOfNotNull(settings, context.packageName)).toSet()
}

/** The DayFlow Focus service is switched on in Android Accessibility settings. */
fun isAccessibilityServiceEnabled(context: Context): Boolean {
  val expected = ComponentName(context, FocusAccessibilityService::class.java)
  val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
  return enabled.split(':').any { ComponentName.unflattenFromString(it) == expected }
}
