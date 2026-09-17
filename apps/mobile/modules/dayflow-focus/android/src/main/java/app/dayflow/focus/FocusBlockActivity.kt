package app.dayflow.focus

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.window.OnBackInvokedDispatcher

/**
 * The block screen. Everything it shows comes from FocusStore (lock mode, end time, Day title), so it is correct
 * even when DayFlow's app UI is not running:
 * - FLEXIBLE: [집중 계속하기] (home) and [집중 종료] (confirmation → FocusPolicy.stop → blocking lifted → closes).
 * - STRICT: only [집중 계속하기]; there is no way to end it here, and FocusPolicy.stop refuses it regardless.
 * Back goes home, never back into the blocked app.
 */
class FocusBlockActivity : Activity() {
  private lateinit var titleView: TextView
  private lateinit var appNameView: TextView
  private lateinit var messageView: TextView
  private lateinit var detailView: TextView
  private lateinit var stopButton: Button
  private var confirmation: AlertDialog? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val padding = (24 * resources.displayMetrics.density).toInt()
    titleView = TextView(this).apply {
      textSize = 24f
      setTextColor(Color.BLACK)
      gravity = Gravity.CENTER
    }
    appNameView = TextView(this).apply {
      textSize = 14f
      setTextColor(Color.GRAY)
      gravity = Gravity.CENTER
      setPadding(0, padding / 3, 0, 0)
    }
    messageView = TextView(this).apply {
      textSize = 16f
      setTextColor(Color.DKGRAY)
      gravity = Gravity.CENTER
      setPadding(0, padding / 2, 0, padding / 3)
    }
    detailView = TextView(this).apply {
      textSize = 14f
      setTextColor(Color.GRAY)
      gravity = Gravity.CENTER
      setPadding(0, 0, 0, padding)
    }
    val keepFocusing = Button(this).apply {
      text = FocusBlockContent.CONTINUE_LABEL
      setOnClickListener { goHome() }
    }
    stopButton = Button(this).apply {
      text = FocusBlockContent.STOP_LABEL
      visibility = View.GONE
      setOnClickListener { confirmStop() }
    }
    setContentView(
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(Color.WHITE)
        setPadding(padding, padding, padding, padding)
        addView(titleView)
        addView(appNameView)
        addView(messageView)
        addView(detailView)
        addView(keepFocusing)
        addView(stopButton)
      },
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goHome() }
    }
    render()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    render()
  }

  override fun onResume() {
    super.onResume()
    render()
  }

  override fun onDestroy() {
    confirmation?.dismiss()
    super.onDestroy()
  }

  @Deprecated("Android 12 and lower; Android 13+ uses the OnBackInvokedCallback above")
  override fun onBackPressed() {
    goHome()
  }

  /** Reads the session again every time: it may have expired, been stopped, or been replaced meanwhile. */
  private fun render() {
    val session = FocusStore(this).load()
    val now = System.currentTimeMillis()
    // Focus stopped or expired: nothing to block anymore.
    if (!session.isRunning(now)) {
      finish()
      return
    }
    val content = FocusBlockContent.from(session, now)
    titleView.text = content.title
    messageView.text = content.message
    detailView.text = content.detail
    stopButton.visibility = if (content.showStopButton) View.VISIBLE else View.GONE
    if (!content.showStopButton) confirmation?.dismiss()
    appNameView.text = intent?.getStringExtra(EXTRA_BLOCKED_PACKAGE)?.let { appLabel(it) } ?: ""
  }

  private fun confirmStop() {
    confirmation?.dismiss()
    confirmation = AlertDialog.Builder(this)
      .setTitle(FocusBlockContent.STOP_CONFIRM_TITLE)
      .setMessage(FocusBlockContent.STOP_CONFIRM_MESSAGE)
      .setNegativeButton("취소", null)
      .setPositiveButton(FocusBlockContent.STOP_LABEL) { _, _ -> stopFocus() }
      .show()
  }

  /** The same native stop policy as the Focus screen: FLEXIBLE ends now, STRICT is refused (FocusLockedException). */
  private fun stopFocus() {
    val store = FocusStore(this)
    try {
      store.save(FocusPolicy.stop(store.load(), System.currentTimeMillis()))
    } catch (error: FocusLockedException) {
      render()
      return
    }
    // The blocked app underneath is usable again; DayFlow marks its session CANCELLED on its next reconcile.
    finish()
  }

  /** The app's display name (visible through the LAUNCHER `<queries>` intent); the package name if unknown. */
  private fun appLabel(packageName: String): String =
    try {
      packageManager.getApplicationLabel(packageManager.getApplicationInfo(packageName, 0)).toString()
    } catch (error: Exception) {
      packageName
    }

  private fun goHome() {
    startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    finish()
  }

  companion object {
    const val EXTRA_BLOCKED_PACKAGE = "blockedPackage"
  }
}
