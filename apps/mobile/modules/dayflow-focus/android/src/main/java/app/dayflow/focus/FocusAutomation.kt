package app.dayflow.focus

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * The scheduled-Focus registry (SharedPreferences, JSON). JS replaces it with syncFocusSchedules; the receiver
 * updates each entry's status when its alarm fires or the user answers a prompt.
 */
class FocusScheduleStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun load(): List<ScheduledFocus> =
    try {
      val array = JSONArray(prefs.getString(KEY_ENTRIES, "[]"))
      (0 until array.length()).mapNotNull { index -> fromJson(array.getJSONObject(index)) }
    } catch (error: Exception) {
      emptyList()
    }

  fun save(entries: List<ScheduledFocus>) {
    prefs.edit().putString(KEY_ENTRIES, JSONArray(entries.map { toJson(it) }).toString()).commit()
  }

  fun update(id: String, status: FocusScheduleStatus) {
    save(load().map { if (it.id == id) it.copy(status = status) else it })
  }

  private fun toJson(entry: ScheduledFocus) = JSONObject()
    .put("id", entry.id)
    .put("dayId", entry.dayId)
    .put("title", entry.title)
    .put("startAtMs", entry.startAtMs)
    .put("endAtMs", entry.endAtMs)
    .put("trigger", entry.trigger.name)
    .put("lockMode", entry.lockMode.name)
    .put("packages", JSONArray(entry.packages))
    .put("appLabels", JSONObject(entry.appLabels))
    .put("status", entry.status.name)

  private fun fromJson(json: JSONObject): ScheduledFocus? {
    val trigger = FocusTrigger.parse(json.optString("trigger")) ?: return null
    val packages = json.optJSONArray("packages") ?: JSONArray()
    val labels = json.optJSONObject("appLabels") ?: JSONObject()
    return ScheduledFocus(
      id = json.getString("id"),
      dayId = json.getString("dayId"),
      title = json.optString("title"),
      startAtMs = json.getLong("startAtMs"),
      endAtMs = json.getLong("endAtMs"),
      trigger = trigger,
      lockMode = FocusLockMode.parse(json.optString("lockMode")),
      packages = (0 until packages.length()).map { packages.getString(it) },
      appLabels = labels.keys().asSequence().associateWith { labels.optString(it) },
      status = FocusScheduleStatus.parse(json.optString("status")),
    )
  }

  companion object {
    private const val PREFS_NAME = "dayflow_focus_schedules"
    private const val KEY_ENTRIES = "entries"
  }
}

/**
 * Day-schedule automation on Android, independent of the JS app: AlarmManager wakes FocusScheduleReceiver at a
 * schedule's start, which posts the notification (NOTIFY_ONLY / ASK) or starts the Focus (AUTO) itself.
 *
 * Timing: an exact alarm when the user allowed "알람 및 리마인더" (SCHEDULE_EXACT_ALARM; Android 12+ asks for it,
 * Android 14+ does not grant it by default), otherwise an inexact setAndAllowWhileIdle alarm that Android may
 * deliver a few minutes late. A late alarm still starts the Focus until the schedule ends, and DayFlow also runs
 * due schedules whenever it syncs (app start, foreground, Day changes).
 */
object FocusAutomation {
  const val ACTION_FIRE = "app.dayflow.focus.SCHEDULE_FIRE"
  const val ACTION_ACCEPT = "app.dayflow.focus.SCHEDULE_ACCEPT"
  const val ACTION_DISMISS = "app.dayflow.focus.SCHEDULE_DISMISS"
  const val EXTRA_SCHEDULE_ID = "scheduleId"
  private const val CHANNEL_ID = "dayflow-focus"

  /** Replaces the registry with the schedules JS wants, (re)arms alarms and runs any that are due now. */
  fun sync(context: Context, desired: List<ScheduledFocus>): List<ScheduledFocus> {
    val store = FocusScheduleStore(context)
    val plan = FocusSchedulePolicy.plan(store.load(), desired, System.currentTimeMillis())
    plan.toCancel.forEach { cancelAlarm(context, it) }
    plan.outdatedNotifications.forEach { cancelNotification(context, it) }
    store.save(plan.next)
    plan.toArm.forEach { arm(context, it) }
    runDue(context)
    return store.load()
  }

  /** After a reboot or an app update Android has dropped the alarms: arm them again from the registry. */
  fun rearm(context: Context) {
    FocusScheduleStore(context).load().filter { it.status == FocusScheduleStatus.SCHEDULED }.forEach { arm(context, it) }
    runDue(context)
  }

  fun runDue(context: Context) {
    FocusSchedulePolicy.due(FocusScheduleStore(context).load(), System.currentTimeMillis()).forEach { fire(context, it.id) }
  }

  fun fire(context: Context, id: String) {
    val scheduleStore = FocusScheduleStore(context)
    val entry = scheduleStore.load().firstOrNull { it.id == id } ?: return
    val focusStore = FocusStore(context)
    val now = System.currentTimeMillis()
    when (FocusSchedulePolicy.onStart(entry, focusStore.load(), now)) {
      ScheduleAction.None -> Unit
      ScheduleAction.Expired -> scheduleStore.update(id, FocusScheduleStatus.MISSED)
      ScheduleAction.Notify -> {
        scheduleStore.update(id, FocusScheduleStatus.NOTIFIED)
        notify(context, entry, "${entry.title} 시작할 시간이에요", timeRange(entry), withActions = false)
      }
      ScheduleAction.Ask -> {
        scheduleStore.update(id, FocusScheduleStatus.ASKED)
        notify(context, entry, "${entry.title}을(를) 시작할까요?", timeRange(entry), withActions = true)
      }
      ScheduleAction.Start -> start(context, entry, now)
      ScheduleAction.Busy -> {
        scheduleStore.update(id, FocusScheduleStatus.SKIPPED)
        notify(context, entry, "${entry.title} 시작할 시간이에요", "이미 진행 중인 집중이 있어 자동으로 시작하지 않았어요.", withActions = false)
      }
    }
  }

  /** "집중 시작" on an ASK prompt: an explicit user action. */
  fun accept(context: Context, id: String): FocusScheduleStatus? {
    val scheduleStore = FocusScheduleStore(context)
    val entry = scheduleStore.load().firstOrNull { it.id == id } ?: return null
    val focusStore = FocusStore(context)
    val now = System.currentTimeMillis()
    when (FocusSchedulePolicy.onAccept(entry, focusStore.load(), now)) {
      ScheduleAction.Start -> start(context, entry, now)
      ScheduleAction.Expired -> {
        scheduleStore.update(id, FocusScheduleStatus.MISSED)
        cancelNotification(context, id)
      }
      ScheduleAction.Busy -> notify(context, entry, "${entry.title} 집중을 시작하지 못했어요", "이미 진행 중인 집중이 있어요.", withActions = false)
      else -> Unit
    }
    return scheduleStore.load().firstOrNull { it.id == id }?.status
  }

  /** "나중에": nothing starts, and the prompt is not shown again for this schedule. */
  fun dismiss(context: Context, id: String) {
    val scheduleStore = FocusScheduleStore(context)
    val entry = scheduleStore.load().firstOrNull { it.id == id } ?: return
    if (entry.status == FocusScheduleStatus.ASKED || entry.status == FocusScheduleStatus.SCHEDULED) {
      scheduleStore.update(id, FocusScheduleStatus.DISMISSED)
      cancelAlarm(context, id)
    }
    cancelNotification(context, id)
  }

  private fun start(context: Context, entry: ScheduledFocus, now: Long) {
    val scheduleStore = FocusScheduleStore(context)
    val focusStore = FocusStore(context)
    val packages = FocusPolicy.blockablePackages(entry.packages.toSet(), alwaysAllowedPackages(context))
    try {
      focusStore.save(FocusPolicy.startUntil(focusStore.load(), entry.endAtMs, now, packages, FocusSchedulePolicy.startInfo(entry, UUID.randomUUID().toString())))
    } catch (error: RuntimeException) {
      scheduleStore.update(entry.id, FocusScheduleStatus.SKIPPED)
      cancelNotification(context, entry.id)
      return
    }
    scheduleStore.update(entry.id, FocusScheduleStatus.STARTED)
    // The user may be in a blocked app right now (e.g. YouTube when an AUTO schedule starts): block it at once.
    FocusAccessibilityService.requestRecheck()
    val until = clock(entry.endAtMs)
    val blocking = when {
      packages.isEmpty() -> "차단 앱 없이 ${until}까지 집중해요."
      !isAccessibilityServiceEnabled(context) -> "접근성 권한이 꺼져 있어 앱은 차단되지 않아요. ${until}까지 집중해요."
      entry.lockMode == FocusLockMode.STRICT -> "${until}에 자동으로 해제됩니다."
      else -> "${until}까지 선택한 앱을 차단합니다."
    }
    val title = if (entry.lockMode == FocusLockMode.STRICT) "${entry.title} 강제 집중이 시작됐어요" else "${entry.title} 집중 모드가 시작됐어요"
    notify(context, entry, title, blocking, withActions = false)
  }

  private fun alarmIntent(context: Context, id: String): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, FocusScheduleReceiver::class.java).setAction(ACTION_FIRE).setData(scheduleUri(id)).putExtra(EXTRA_SCHEDULE_ID, id),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  /** The data URI makes each schedule's PendingIntent distinct, so the same id always replaces its own alarm. */
  private fun scheduleUri(id: String): Uri = Uri.parse("dayflow-focus://schedule/${Uri.encode(id)}")

  fun canScheduleExactAlarms(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
  }

  private fun arm(context: Context, entry: ScheduledFocus) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pendingIntent = alarmIntent(context, entry.id)
    val triggerAt = maxOf(entry.startAtMs, System.currentTimeMillis())
    try {
      if (canScheduleExactAlarms(context)) {
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
      } else {
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
      }
    } catch (error: SecurityException) {
      // The exact-alarm permission was revoked between the check and the call.
      alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
    }
  }

  private fun cancelAlarm(context: Context, id: String) {
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(alarmIntent(context, id))
  }

  private fun notificationId(id: String): Int = id.hashCode()

  private fun cancelNotification(context: Context, id: String) {
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_TAG, notificationId(id))
  }

  private const val NOTIFICATION_TAG = "dayflow-focus-schedule"

  private fun notify(context: Context, entry: ScheduledFocus, title: String, body: String, withActions: Boolean) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    // Android 13+: without the notification permission nothing is shown (an AUTO Focus still starts).
    if (!manager.areNotificationsEnabled()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "DayFlow 집중", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "일정 시작 시 집중 알림 (Focus)"
        },
      )
    }
    @Suppress("DEPRECATION")
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context)
    builder
      .setSmallIcon(smallIcon(context))
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setAutoCancel(true)
      .setContentIntent(openFocusScreen(context, entry))
    if (withActions) {
      builder.setTimeoutAfterCompat(entry.endAtMs - System.currentTimeMillis())
      builder
        // STRICT needs the final confirmation, which only the Focus screen can show: "집중 시작" opens it there.
        // FLEXIBLE starts right from the notification.
        .addAction(
          Notification.Action.Builder(
            null as Icon?,
            "집중 시작",
            if (entry.lockMode == FocusLockMode.STRICT) openFocusScreen(context, entry) else receiverIntent(context, ACTION_ACCEPT, entry.id),
          ).build(),
        )
        .addAction(Notification.Action.Builder(null as Icon?, "나중에", receiverIntent(context, ACTION_DISMISS, entry.id)).build())
    }
    manager.notify(NOTIFICATION_TAG, notificationId(entry.id), builder.build())
  }

  /**
   * The monochrome icon expo-notifications generates when one is configured, otherwise a system alarm icon. The
   * launcher icon is not used: an adaptive icon as a small icon breaks notifications on some Android 8.0 devices.
   */
  @Suppress("DiscouragedApi")
  private fun smallIcon(context: Context): Int {
    val generated = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (generated != 0) generated else android.R.drawable.ic_popup_reminder
  }

  private fun Notification.Builder.setTimeoutAfterCompat(durationMs: Long) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && durationMs > 0) setTimeoutAfter(durationMs)
  }

  private fun receiverIntent(context: Context, action: String, id: String): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, FocusScheduleReceiver::class.java).setAction(action).setData(scheduleUri(id)).putExtra(EXTRA_SCHEDULE_ID, id),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  /** Tapping the notification opens DayFlow's Focus screen for the Day (expo-router `/open/focus`). */
  private fun openFocusScreen(context: Context, entry: ScheduledFocus): PendingIntent {
    val uri = Uri.parse("dayflow://open/focus?dayId=${Uri.encode(entry.dayId)}&scheduleId=${Uri.encode(entry.id)}")
    val intent = Intent(Intent.ACTION_VIEW, uri).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(context, notificationId(entry.id), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun clock(epochMs: Long): String = SimpleDateFormat("HH:mm", Locale.KOREA).format(Date(epochMs))

  private fun timeRange(entry: ScheduledFocus): String = "${clock(entry.startAtMs)}–${clock(entry.endAtMs)}"
}

/** Alarm, notification actions, and reboot/app update (re-arm). Not exported: only the system and DayFlow send these. */
class FocusScheduleReceiver : BroadcastReceiver() {
  private companion object {
    /** AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED (Android 12+): exact alarms became allowed. */
    const val ACTION_EXACT_ALARM_PERMISSION_CHANGED = "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(FocusAutomation.EXTRA_SCHEDULE_ID)
    when (intent.action) {
      FocusAutomation.ACTION_FIRE -> id?.let { FocusAutomation.fire(context, it) }
      FocusAutomation.ACTION_ACCEPT -> id?.let { FocusAutomation.accept(context, it) }
      FocusAutomation.ACTION_DISMISS -> id?.let { FocusAutomation.dismiss(context, it) }
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, ACTION_EXACT_ALARM_PERMISSION_CHANGED -> FocusAutomation.rearm(context)
    }
  }
}
