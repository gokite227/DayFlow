package app.dayflow.focus

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** A session start from the Focus screen: ends at `endsAt` (epoch ms), with its lock mode and Day metadata. */
class StartSessionRequest : Record {
  @Field val sessionId: String? = null
  @Field val packageNames: List<String> = emptyList()
  @Field val appLabels: Map<String, String> = emptyMap()
  @Field val endsAt: Double = 0.0
  @Field val lockMode: String = FocusLockMode.FLEXIBLE.name
  @Field val dayId: String? = null
  @Field val dayTitle: String? = null
  @Field val origin: String = FocusOrigin.MANUAL.name
}

/** One Day schedule to automate (see FocusSchedulePolicy). */
class ScheduleEntryRecord : Record {
  @Field val id: String = ""
  @Field val dayId: String = ""
  @Field val title: String = ""
  @Field val startAt: Double = 0.0
  @Field val endAt: Double = 0.0
  @Field val trigger: String = ""
  @Field val lockMode: String = FocusLockMode.FLEXIBLE.name
  @Field val packageNames: List<String> = emptyList()
  @Field val appLabels: Map<String, String> = emptyMap()
}

/**
 * React Native API of DayFlow Focus on Android. This module, FocusAccessibilityService and FocusScheduleReceiver
 * share FocusStore (the running session: whether blocking is on, until when, STRICT or not) and
 * FocusScheduleStore (Day schedule automation). Session history and settings live in JS.
 */
class DayflowFocusModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("DayflowFocus")

    Function("getPermissionStatus") {
      mapOf(
        "accessibilityServiceEnabled" to isAccessibilityServiceEnabled(context),
        "serviceConnected" to FocusAccessibilityService.connected,
      )
    }

    Function("openAccessibilitySettings") {
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // Launcher-visible apps that may be blocked (DayFlow, launchers, Settings, System UI, phone are left out).
    AsyncFunction("getInstalledApps") {
      val pm = context.packageManager
      InstalledAppFilter.selectable(launcherAppCandidates(context), alwaysAllowedPackages(context)).map { app ->
        mapOf(
          "packageName" to app.packageName,
          "label" to app.label,
          "isSystemApp" to app.isSystemApp,
          "osCategory" to app.osCategoryName,
          "iconBase64" to appIconBase64(pm, app.packageName),
        )
      }
    }

    // Debug screen: stores a block list for startFocus.
    Function("setBlockedPackages") { packageNames: List<String> ->
      val store = FocusStore(context)
      locked {
        store.save(FocusPolicy.withBlockedPackages(store.load(), blockable(packageNames), System.currentTimeMillis()))
      }
      FocusAccessibilityService.requestRecheck()
      status(store)
    }

    // Debug screen: a FLEXIBLE session for `durationMinutes` with the stored block list.
    Function("startFocus") { durationMinutes: Int ->
      val store = FocusStore(context)
      val started = locked {
        try {
          FocusPolicy.start(store.load(), durationMinutes, System.currentTimeMillis())
        } catch (error: IllegalArgumentException) {
          throw CodedException("ERR_INVALID_DURATION", error.message, error)
        }
      }
      store.save(started)
      // An app that is already open and now blocked is blocked at once, not at its next window change.
      FocusAccessibilityService.requestRecheck()
      status(store)
    }

    // Product start: block list, end time, lock mode and Day metadata in one write.
    Function("startSession") { request: StartSessionRequest ->
      val store = FocusStore(context)
      val info = FocusStartInfo(
        sessionId = request.sessionId,
        lockMode = FocusLockMode.parse(request.lockMode),
        dayId = request.dayId,
        dayTitle = request.dayTitle,
        origin = FocusOrigin.parse(request.origin),
        appLabels = request.appLabels,
      )
      val started = locked {
        try {
          FocusPolicy.startUntil(store.load(), request.endsAt.toLong(), System.currentTimeMillis(), blockable(request.packageNames), info)
        } catch (error: IllegalArgumentException) {
          throw CodedException("ERR_INVALID_DURATION", error.message, error)
        }
      }
      store.save(started)
      // An app that is already open and now blocked is blocked at once, not at its next window change.
      FocusAccessibilityService.requestRecheck()
      status(store)
    }

    // FLEXIBLE: stops at once. STRICT before its end: ERR_FOCUS_LOCKED.
    Function("stopFocus") {
      val store = FocusStore(context)
      store.save(locked { FocusPolicy.stop(store.load(), System.currentTimeMillis()) })
      status(store)
    }

    Function("getFocusStatus") {
      status(FocusStore(context))
    }

    // Replaces the Day schedule automation with `entries`; returns the stored registry.
    Function("syncFocusSchedules") { entries: List<ScheduleEntryRecord> ->
      val desired = entries.mapNotNull { record ->
        val trigger = FocusTrigger.parse(record.trigger) ?: return@mapNotNull null
        ScheduledFocus(
          id = record.id,
          dayId = record.dayId,
          title = record.title,
          startAtMs = record.startAt.toLong(),
          endAtMs = record.endAt.toLong(),
          trigger = trigger,
          lockMode = if (trigger == FocusTrigger.NOTIFY_ONLY) FocusLockMode.FLEXIBLE else FocusLockMode.parse(record.lockMode),
          packages = if (trigger == FocusTrigger.NOTIFY_ONLY) emptyList() else record.packageNames.map { it.trim() }.filter { it.isNotEmpty() },
          appLabels = record.appLabels,
        )
      }
      FocusAutomation.sync(context, desired).map { scheduleMap(it) }
    }

    Function("getFocusSchedules") {
      FocusScheduleStore(context).load().map { scheduleMap(it) }
    }

    // The in-app "집중 시작" for an ASK schedule: same path as the notification action.
    Function("acceptScheduledFocus") { id: String ->
      FocusAutomation.accept(context, id)
      status(FocusStore(context))
    }

    Function("dismissScheduledFocus") { id: String ->
      FocusAutomation.dismiss(context, id)
    }

    Function("getExactAlarmStatus") {
      mapOf(
        // Android 12+ has a user-controlled "알람 및 리마인더" permission; older versions always allow exact alarms.
        "userControlled" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S),
        "exact" to FocusAutomation.canScheduleExactAlarms(context),
      )
    }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.startActivity(
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      }
    }

    // After the user changed "알람 및 리마인더": re-arm with the new precision.
    Function("rearmFocusSchedules") {
      FocusAutomation.rearm(context)
    }
  }

  private fun <T> locked(block: () -> T): T =
    try {
      block()
    } catch (error: FocusLockedException) {
      throw CodedException("ERR_FOCUS_LOCKED", error.message, error)
    }

  private fun blockable(packageNames: List<String>): Set<String> {
    val normalized = try {
      FocusPolicy.normalizePackages(packageNames)
    } catch (error: IllegalArgumentException) {
      throw CodedException("ERR_INVALID_PACKAGE", error.message, error)
    }
    return FocusPolicy.blockablePackages(normalized, alwaysAllowedPackages(context))
  }

  private fun scheduleMap(entry: ScheduledFocus): Map<String, Any?> =
    mapOf(
      "id" to entry.id,
      "dayId" to entry.dayId,
      "title" to entry.title,
      "startAt" to entry.startAtMs.toDouble(),
      "endAt" to entry.endAtMs.toDouble(),
      "trigger" to entry.trigger.name,
      "lockMode" to entry.lockMode.name,
      "packageNames" to entry.packages,
      "status" to entry.status.name,
    )

  private fun status(store: FocusStore): Map<String, Any?> {
    val session = store.load()
    val now = System.currentTimeMillis()
    val running = session.isRunning(now)
    return mapOf(
      "active" to running,
      "endsAt" to (if (running) session.endsAtMs.toDouble() else null),
      "remainingSeconds" to (if (running) ((session.endsAtMs - now) / 1000L).toInt() else 0),
      "blockedPackages" to session.blockedPackages.sorted(),
      "lockMode" to session.lockMode.name,
      "sessionId" to session.sessionId,
      "dayId" to session.dayId,
      "dayTitle" to session.dayTitle,
      "origin" to session.origin.name,
      "startedAt" to (if (session.startedAtMs > 0L) session.startedAtMs.toDouble() else null),
      "appLabels" to session.appLabels,
      "lastForegroundPackage" to FocusAccessibilityService.lastForegroundPackage,
      "lastBlockedPackage" to FocusAccessibilityService.lastBlockedPackage,
    )
  }
}
