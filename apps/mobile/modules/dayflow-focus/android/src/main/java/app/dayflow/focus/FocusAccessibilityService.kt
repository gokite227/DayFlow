package app.dayflow.focus

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.accessibility.AccessibilityEvent
import android.view.inputmethod.InputMethodManager

/**
 * Watches which app comes to the foreground (window state changes only, never window content) and shows
 * FocusBlockActivity when FocusPolicy says so. An accessibility service is bound by the system, so it may start an
 * activity from the background without the overlay permission.
 *
 * Besides reacting to window changes, it keeps the current foreground app in memory (also while no Focus runs), so
 * a Focus that starts while a blocked app is already open — e.g. an AUTO schedule fired by FocusScheduleReceiver —
 * blocks it at once via [requestRecheck] instead of waiting for the next window change.
 */
class FocusAccessibilityService : AccessibilityService() {
  private lateinit var store: FocusStore
  private var alwaysAllowed: Set<String> = emptySet()
  private var inputMethodPackages: Set<String> = emptySet()
  /** The app the user is in, as last observed by this service instance; never persisted. */
  @Volatile private var foregroundPackage: String? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  /** Screen on without a lock, or unlocked: the tracked app is visible again, so check it. */
  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      recheckForeground()
    }
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    store = FocusStore(this)
    alwaysAllowed = alwaysAllowedPackages(this)
    inputMethodPackages = enabledInputMethodPackages()
    foregroundPackage = null
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(screenReceiver, filter)
    }
    instance = this
    connected = true
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val packageName = event.packageName?.toString() ?: return
    lastForegroundPackage = packageName
    foregroundPackage = ForegroundRecheck.nextForeground(foregroundPackage, packageName, inputMethodPackages)
    if (!::store.isInitialized) return
    // Unchanged: the package of the window change itself is checked, as the POC did.
    if (!FocusPolicy.shouldBlock(packageName, store.load(), System.currentTimeMillis(), alwaysAllowed)) return
    showBlockScreen(packageName)
  }

  /** Re-evaluates the tracked foreground app against the stored session (main thread). */
  private fun recheckForeground() {
    if (!::store.isInitialized) return
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    val target = ForegroundRecheck.packageToBlock(
      foreground = foregroundPackage,
      interactive = power.isInteractive,
      keyguardLocked = keyguard.isKeyguardLocked,
      session = store.load(),
      nowMs = System.currentTimeMillis(),
      alwaysAllowed = alwaysAllowed,
    ) ?: return
    showBlockScreen(target)
  }

  private fun showBlockScreen(packageName: String) {
    lastBlockedPackage = packageName
    startActivity(
      Intent(this, FocusBlockActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        .putExtra(FocusBlockActivity.EXTRA_BLOCKED_PACKAGE, packageName),
    )
  }

  private fun enabledInputMethodPackages(): Set<String> =
    try {
      (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).enabledInputMethodList.map { it.packageName }.toSet()
    } catch (error: RuntimeException) {
      emptySet()
    }

  override fun onInterrupt() = Unit

  override fun onUnbind(intent: Intent?): Boolean {
    disconnect()
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    disconnect()
    super.onDestroy()
  }

  private fun disconnect() {
    if (instance === this) instance = null
    connected = false
    foregroundPackage = null
    try {
      unregisterReceiver(screenReceiver)
    } catch (error: IllegalArgumentException) {
      // Not registered (never connected, or already unregistered).
    }
  }

  companion object {
    /** Debug info for the native debug screen (same process as the React Native module). */
    @Volatile var connected: Boolean = false
    @Volatile var lastForegroundPackage: String? = null
    @Volatile var lastBlockedPackage: String? = null
    @Volatile private var instance: FocusAccessibilityService? = null

    /**
     * A Focus session started or its block list changed (FocusStore was just saved): if the service is running,
     * check the app that is open right now. Safe to call from any thread and when the service is off (no-op).
     */
    fun requestRecheck() {
      val service = instance ?: return
      service.mainHandler.post { service.recheckForeground() }
    }
  }
}
