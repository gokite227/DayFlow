import ExpoModulesCore

/**
 * iOS side of DayFlow Focus app blocking — SKELETON ONLY. It blocks nothing and reports `implemented: false`,
 * so the app keeps Focus as a timer on iOS.
 *
 * Planned implementation (needs the Family Controls entitlement from Apple, not granted today):
 * - FamilyControls: AuthorizationCenter.shared.requestAuthorization(for: .individual) for permission, and
 *   FamilyActivityPicker (SwiftUI) to choose apps. The picker returns a FamilyActivitySelection of opaque
 *   tokens; there are no bundle ids, so JS stores only an opaque serialized selection and a count.
 * - ManagedSettings: ManagedSettingsStore().shield.applications = selection.applicationTokens to block,
 *   and clearAllSettings() to stop.
 * - DeviceActivity: a DeviceActivityMonitor app extension with a schedule ending at the Focus end time, so the
 *   shield is removed even when DayFlow is not running (the iOS counterpart of Android's endsAt expiry).
 * Nothing below imports those frameworks yet, so this module builds without the entitlement.
 */
public class DayflowScreenTimeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DayflowScreenTime")

    Function("getStatus") { () -> [String: Any] in
      [
        "implemented": false,
        "authorization": "notDetermined",
        "active": false,
        "selectedCount": 0,
      ]
    }

    AsyncFunction("requestAuthorization") { () -> String in
      // TODO(FamilyControls): AuthorizationCenter.shared.requestAuthorization(for: .individual)
      "unsupported"
    }

    AsyncFunction("presentAppPicker") { () -> [String: Any]? in
      // TODO(FamilyControls): present FamilyActivityPicker and return { selection: <opaque>, count }
      nil
    }

    Function("startBlocking") { (selection: String?, durationMinutes: Int) -> [String: Any] in
      // TODO(ManagedSettings + DeviceActivity): shield the selection until now + durationMinutes
      ["implemented": false, "active": false]
    }

    Function("stopBlocking") { () -> [String: Any] in
      // TODO(ManagedSettings): ManagedSettingsStore().clearAllSettings()
      ["implemented": false, "active": false]
    }
  }
}
