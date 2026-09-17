package app.dayflow.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InstalledAppFilterTest {
  private val dayflow = "app.dayflow.mobile"
  private val launcher = "com.sec.android.app.launcher"
  private val deviceAllowed = setOf(dayflow, launcher, "com.android.settings")

  private fun app(packageName: String, label: String, system: Boolean = false) = InstalledAppCandidate(packageName, label, system)

  @Test
  fun leavesOutDayflowLauncherSettingsSystemUiAndCoreComponents() {
    val candidates = listOf(
      app("com.google.android.youtube", "YouTube"),
      app(dayflow, "DayFlow"),
      app(launcher, "One UI Home", system = true),
      app("com.android.settings", "설정", system = true),
      app("com.android.systemui", "System UI", system = true),
      app("com.google.android.packageinstaller", "Package installer", system = true),
    )
    assertEquals(listOf("com.google.android.youtube"), InstalledAppFilter.selectable(candidates, deviceAllowed).map { it.packageName })
  }

  @Test
  fun userAppsComeFirstThenPreinstalledAppsByLabelWithoutDuplicates() {
    val candidates = listOf(
      app("com.sec.android.app.clockpackage", "시계", system = true),
      app("com.instagram.android", "Instagram"),
      app("com.google.android.youtube", "YouTube"),
      app("com.google.android.youtube", "YouTube"),
      app("com.sec.android.app.popupcalculator", "계산기", system = true),
      app("com.android.chrome", "chrome"),
    )
    val result = InstalledAppFilter.selectable(candidates, deviceAllowed)
    assertEquals(
      listOf("com.android.chrome", "com.instagram.android", "com.google.android.youtube", "com.sec.android.app.popupcalculator", "com.sec.android.app.clockpackage"),
      result.map { it.packageName },
    )
  }

  @Test
  fun blockListNeverKeepsAllowedApps() {
    val requested = setOf("com.google.android.youtube", dayflow, launcher, "com.android.systemui", "android")
    val blockable = FocusPolicy.blockablePackages(requested, deviceAllowed)
    assertEquals(setOf("com.google.android.youtube"), blockable)
    assertTrue(FocusPolicy.blockablePackages(emptySet(), deviceAllowed).isEmpty())
  }

  @Test
  fun phoneAndEmergencyAppsAreNeverOffered() {
    val candidates = listOf(
      app("com.samsung.android.dialer", "전화", system = true),
      app("com.google.android.dialer", "Phone", system = true),
      app("com.android.emergency", "Emergency", system = true),
      app("com.instagram.android", "Instagram"),
    )
    assertEquals(listOf("com.instagram.android"), InstalledAppFilter.selectable(candidates, deviceAllowed).map { it.packageName })
    assertTrue(FocusPolicy.blockablePackages(setOf("com.google.android.dialer"), deviceAllowed).isEmpty())
  }

  @Test
  fun osCategoryNamesWithUnknownFallback() {
    assertEquals("SOCIAL", AppCategoryMapper.osCategoryName(4))
    assertEquals("GAME", AppCategoryMapper.osCategoryName(0))
    assertEquals("PRODUCTIVITY", AppCategoryMapper.osCategoryName(7))
    assertEquals("UNDEFINED", AppCategoryMapper.osCategoryName(-1))
    assertEquals("UNDEFINED", AppCategoryMapper.osCategoryName(42))
    assertEquals("GAME", AppCategoryMapper.resolve(-1, legacyGameFlag = true))
    assertEquals("VIDEO", AppCategoryMapper.resolve(2, legacyGameFlag = true))
    assertEquals("SOCIAL", InstalledAppCandidate("com.instagram.android", "Instagram", false, osCategory = 4).osCategoryName)
  }
}
