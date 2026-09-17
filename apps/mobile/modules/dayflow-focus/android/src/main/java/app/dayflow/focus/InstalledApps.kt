package app.dayflow.focus

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.util.Base64
import java.io.ByteArrayOutputStream

/** An app the user could choose to block. Pure data, so the filtering rules are unit-testable. */
data class InstalledAppCandidate(
  val packageName: String,
  val label: String,
  /** Preinstalled and never updated (e.g. Clock, Calculator); shown after the user's own apps. */
  val isSystemApp: Boolean,
  /** ApplicationInfo.category (Android 8+), or AppCategoryMapper.UNDEFINED. */
  val osCategory: Int = AppCategoryMapper.UNDEFINED,
  /** The deprecated FLAG_IS_GAME, set by older games instead of a category. */
  val legacyGame: Boolean = false,
) {
  val osCategoryName: String get() = AppCategoryMapper.resolve(osCategory, legacyGame)
}

/**
 * The OS category an app declares in its manifest (android:appCategory), as a stable name for JS. It is only a
 * hint: many apps declare nothing (UNDEFINED) or something broad, so DayFlow maps it to its own categories in JS
 * with an "기타" fallback and room for known-app and user overrides.
 * Values are the ApplicationInfo.CATEGORY_* constants, repeated here so the mapping is testable without Android.
 */
object AppCategoryMapper {
  const val UNDEFINED = -1
  private val NAMES = mapOf(
    0 to "GAME",
    1 to "AUDIO",
    2 to "VIDEO",
    3 to "IMAGE",
    4 to "SOCIAL",
    5 to "NEWS",
    6 to "MAPS",
    7 to "PRODUCTIVITY",
    8 to "ACCESSIBILITY",
  )

  fun osCategoryName(category: Int): String = NAMES[category] ?: "UNDEFINED"

  /** Old games only set the deprecated FLAG_IS_GAME. */
  fun resolve(category: Int, legacyGameFlag: Boolean): String =
    if (category == UNDEFINED && legacyGameFlag) "GAME" else osCategoryName(category)
}

object InstalledAppFilter {
  /** Never offered for blocking, on top of FocusPolicy.SYSTEM_ALLOWED and the device-resolved allow list. */
  val CORE_EXCLUDED: Set<String> = setOf(
    "com.android.packageinstaller",
    "com.google.android.packageinstaller",
    "com.android.permissioncontroller",
    "com.google.android.permissioncontroller",
    // Phone and emergency functions stay usable during Focus (the device dialer is also allowed at runtime).
    "com.android.phone",
    "com.android.server.telecom",
    "com.android.dialer",
    "com.google.android.dialer",
    "com.samsung.android.dialer",
    "com.android.emergency",
    "com.google.android.apps.safetyhub",
    "com.samsung.android.emergency",
  )

  /**
   * The selectable apps: launcher-visible apps minus DayFlow, launchers, Settings, System UI and core system
   * components (the same apps FocusPolicy never blocks). User apps first, then preinstalled apps, by label.
   */
  fun selectable(candidates: List<InstalledAppCandidate>, alwaysAllowed: Set<String>): List<InstalledAppCandidate> =
    candidates
      .filter { it.packageName !in alwaysAllowed && it.packageName !in FocusPolicy.SYSTEM_ALLOWED && it.packageName !in CORE_EXCLUDED }
      .distinctBy { it.packageName }
      .sortedWith(compareBy<InstalledAppCandidate> { it.isSystemApp }.thenBy(String.CASE_INSENSITIVE_ORDER) { it.label }.thenBy { it.packageName })
}

/**
 * Apps with a launcher entry. Android 11+ package visibility is satisfied by the MAIN/LAUNCHER `<queries>`
 * intent in the manifest, so QUERY_ALL_PACKAGES is not needed: an app without a launcher icon cannot be
 * opened by the user from the launcher anyway.
 */
@Suppress("DEPRECATION")
fun launcherAppCandidates(context: Context): List<InstalledAppCandidate> {
  val pm = context.packageManager
  val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
  return pm.queryIntentActivities(launcherIntent, 0).map { info ->
    val app = info.activityInfo.applicationInfo
    val flags = app.flags
    InstalledAppCandidate(
      packageName = info.activityInfo.packageName,
      label = app.loadLabel(pm).toString(),
      isSystemApp = flags and ApplicationInfo.FLAG_SYSTEM != 0 && flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP == 0,
      osCategory = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) app.category else AppCategoryMapper.UNDEFINED,
      legacyGame = flags and ApplicationInfo.FLAG_IS_GAME != 0,
    )
  }
}

/** A small PNG of the app icon as base64 (null when it cannot be drawn), for the app picker. */
fun appIconBase64(packageManager: PackageManager, packageName: String, sizePx: Int = 96): String? =
  try {
    val drawable = packageManager.getApplicationIcon(packageName)
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, sizePx, sizePx)
    drawable.draw(canvas)
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    bitmap.recycle()
    Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  } catch (error: Exception) {
    null
  }
