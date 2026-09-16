package app.dayflow.focus

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent

/**
 * Watches which app comes to the foreground (window state changes only) and shows FocusBlockActivity when
 * FocusPolicy says so. An accessibility service is bound by the system, so it may start an activity from
 * the background without the overlay permission.
 */
class FocusAccessibilityService : AccessibilityService() {
  private lateinit var store: FocusStore
  private var alwaysAllowed: Set<String> = emptySet()

  override fun onServiceConnected() {
    super.onServiceConnected()
    store = FocusStore(this)
    alwaysAllowed = alwaysAllowedPackages(this)
    connected = true
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val packageName = event.packageName?.toString() ?: return
    lastForegroundPackage = packageName
    if (!::store.isInitialized) return
    if (!FocusPolicy.shouldBlock(packageName, store.load(), System.currentTimeMillis(), alwaysAllowed)) return
    lastBlockedPackage = packageName
    startActivity(
      Intent(this, FocusBlockActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        .putExtra(FocusBlockActivity.EXTRA_BLOCKED_PACKAGE, packageName),
    )
  }

  override fun onInterrupt() = Unit

  override fun onUnbind(intent: Intent?): Boolean {
    connected = false
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    connected = false
    super.onDestroy()
  }

  companion object {
    /** Debug info for the POC screen (same process as the React Native module). */
    @Volatile var connected: Boolean = false
    @Volatile var lastForegroundPackage: String? = null
    @Volatile var lastBlockedPackage: String? = null
  }
}
