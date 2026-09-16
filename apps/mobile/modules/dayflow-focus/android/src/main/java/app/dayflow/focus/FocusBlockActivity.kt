package app.dayflow.focus

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.window.OnBackInvokedDispatcher

/** Plain block screen (POC). Back and "홈으로" go to the launcher, never back into the blocked app. */
class FocusBlockActivity : Activity() {
  private lateinit var message: TextView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val padding = (24 * resources.displayMetrics.density).toInt()
    message = TextView(this).apply {
      textSize = 16f
      setTextColor(Color.DKGRAY)
      gravity = Gravity.CENTER
      setPadding(0, padding / 2, 0, padding)
    }
    val title = TextView(this).apply {
      text = "Focus 중이에요"
      textSize = 24f
      setTextColor(Color.BLACK)
      gravity = Gravity.CENTER
    }
    val home = Button(this).apply {
      text = "홈으로"
      setOnClickListener { goHome() }
    }
    val openDayFlow = Button(this).apply {
      text = "DayFlow 열기"
      setOnClickListener {
        packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        finish()
      }
    }
    setContentView(
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(Color.WHITE)
        setPadding(padding, padding, padding, padding)
        addView(title)
        addView(message)
        addView(home)
        addView(openDayFlow)
      },
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goHome() }
    }
    render(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    render(intent)
  }

  override fun onResume() {
    super.onResume()
    // Focus stopped or expired while this screen was in the background: nothing to block anymore.
    if (!FocusStore(this).load().isRunning(System.currentTimeMillis())) finish()
  }

  @Deprecated("Android 12 and lower; Android 13+ uses the OnBackInvokedCallback above")
  override fun onBackPressed() {
    goHome()
  }

  private fun render(intent: Intent?) {
    val blocked = intent?.getStringExtra(EXTRA_BLOCKED_PACKAGE) ?: "이 앱"
    val remainingMinutes = ((FocusStore(this).load().endsAtMs - System.currentTimeMillis()) / 60_000L).coerceAtLeast(0L) + 1
    message.text = "$blocked 은(는) Focus가 끝날 때까지 쓸 수 없어요.\n약 ${remainingMinutes}분 남았어요."
  }

  private fun goHome() {
    startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    finish()
  }

  companion object {
    const val EXTRA_BLOCKED_PACKAGE = "blockedPackage"
  }
}
