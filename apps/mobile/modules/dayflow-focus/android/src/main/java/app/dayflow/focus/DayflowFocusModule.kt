package app.dayflow.focus

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Minimal React Native API for the Android App Blocking POC. */
class DayflowFocusModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("DayflowFocus")

    Function("getPermissionStatus") {
      mapOf(
        "accessibilityServiceEnabled" to isAccessibilityServiceEnabled(),
        "serviceConnected" to FocusAccessibilityService.connected,
      )
    }

    Function("openAccessibilitySettings") {
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("setBlockedPackages") { packageNames: List<String> ->
      val normalized = try {
        FocusPolicy.normalizePackages(packageNames)
      } catch (error: IllegalArgumentException) {
        throw CodedException("ERR_INVALID_PACKAGE", error.message, error)
      }
      val store = FocusStore(context)
      store.save(store.load().copy(blockedPackages = normalized))
      status(store)
    }

    Function("startFocus") { durationMinutes: Int ->
      val store = FocusStore(context)
      val started = try {
        FocusPolicy.start(store.load(), durationMinutes, System.currentTimeMillis())
      } catch (error: IllegalArgumentException) {
        throw CodedException("ERR_INVALID_DURATION", error.message, error)
      }
      store.save(started)
      status(store)
    }

    Function("stopFocus") {
      val store = FocusStore(context)
      store.save(FocusPolicy.stop(store.load()))
      status(store)
    }

    Function("getFocusStatus") {
      status(FocusStore(context))
    }
  }

  private fun status(store: FocusStore): Map<String, Any?> {
    val session = store.load()
    val now = System.currentTimeMillis()
    val running = session.isRunning(now)
    return mapOf(
      "active" to running,
      "endsAt" to (if (running) session.endsAtMs.toDouble() else null),
      "remainingSeconds" to (if (running) ((session.endsAtMs - now) / 1000L).toInt() else 0),
      "blockedPackages" to session.blockedPackages.sorted(),
      "lastForegroundPackage" to FocusAccessibilityService.lastForegroundPackage,
      "lastBlockedPackage" to FocusAccessibilityService.lastBlockedPackage,
    )
  }

  private fun isAccessibilityServiceEnabled(): Boolean {
    val expected = ComponentName(context, FocusAccessibilityService::class.java)
    val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == expected }
  }
}
