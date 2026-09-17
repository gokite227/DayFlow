import DeviceActivity
import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI

/**
 * iOS side of DayFlow Focus app blocking (Screen Time). POC scope: authorization, Apple's FamilyActivityPicker,
 * shielding the picked apps / categories with a DayFlow-only ManagedSettingsStore, stopping, status, and an automatic
 * end through a DeviceActivity schedule handled by the DayFlowActivityMonitor extension (targets/).
 *
 * Source of truth: the shield lives in ManagedSettings (kept by iOS while DayFlow is not running). The session
 * (end time, lock mode, Day metadata) is persisted in UserDefaults, so JS can reconcile after a restart.
 * App and category tokens are opaque: they are stored natively (Codable FamilyActivitySelection) and never sent to JS.
 *
 * Requires the Family Controls entitlement (com.apple.developer.family-controls), added by app.plugin.js.
 */
public class DayflowScreenTimeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DayflowScreenTime")

    Function("getStatus") { () -> [String: Any] in
      ScreenTimeBlocking.status()
    }

    AsyncFunction("requestAuthorization") { () async -> [String: Any] in
      do {
        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        return ["authorization": ScreenTimeBlocking.authorization()]
      } catch {
        // No entitlement, restricted device, Screen Time off, user declined: reported, never thrown.
        return ["authorization": ScreenTimeBlocking.authorization(), "error": String(describing: error)]
      }
    }

    // Apple's picker (apps and categories). Resolves the new counts, or null when cancelled.
    AsyncFunction("presentActivityPicker") { (promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject(PickerUnavailableException())
        return
      }
      var host: UIHostingController<DayflowActivityPickerView>?
      let view = DayflowActivityPickerView(
        initial: ScreenTimeStorage.loadSelection() ?? FamilyActivitySelection(),
        onDone: { selection in
          ScreenTimeStorage.saveSelection(selection)
          host?.dismiss(animated: true)
          host = nil
          promise.resolve(ScreenTimeBlocking.selectionCounts(selection))
        },
        onCancel: {
          host?.dismiss(animated: true)
          host = nil
          promise.resolve(nil)
        }
      )
      let controller = UIHostingController(rootView: view)
      // Only 완료 / 취소 close it, so the promise always settles.
      controller.isModalInPresentation = true
      host = controller
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    Function("getSelection") { () -> [String: Any] in
      ScreenTimeBlocking.selectionCounts(ScreenTimeStorage.loadSelection() ?? FamilyActivitySelection())
    }

    Function("clearSelection") { () -> [String: Any] in
      ScreenTimeStorage.saveSelection(FamilyActivitySelection())
      return ScreenTimeBlocking.selectionCounts(FamilyActivitySelection())
    }

    Function("startBlocking") { (request: ScreenTimeStartRequest) throws -> [String: Any] in
      try ScreenTimeBlocking.start(request)
    }

    // FLEXIBLE: ends now. STRICT before its end: ERR_FOCUS_LOCKED (same code as Android).
    Function("stopBlocking") { () throws -> [String: Any] in
      try ScreenTimeBlocking.stop()
    }
  }
}

struct ScreenTimeStartRequest: Record {
  @Field var sessionId: String? = nil
  /** Epoch ms; takes precedence over durationMinutes. */
  @Field var endsAt: Double? = nil
  @Field var durationMinutes: Int? = nil
  @Field var lockMode: String = "FLEXIBLE"
  @Field var dayId: String? = nil
  @Field var dayTitle: String? = nil
  @Field var origin: String = "MANUAL"
  /** false: a timer-only Focus (no apps chosen in the product) — nothing is shielded. */
  @Field var shield: Bool = true
  @Field var selectionLabel: String? = nil
}

final class FocusLockedException: Exception {
  override var reason: String { "집중 잠금 중에는 종료 시각 전까지 집중을 끝낼 수 없어요." }
}

final class NotAuthorizedException: Exception {
  override var reason: String { "Screen Time 권한이 없어 앱을 차단할 수 없어요." }
}

final class InvalidDurationException: Exception {
  override var reason: String { "집중 시간은 1분에서 720분 사이여야 해요." }
}

final class PickerUnavailableException: Exception {
  override var reason: String { "앱 선택 화면을 열 수 없어요." }
}

/** Names shared with the DayFlowActivityMonitor extension (targets/dayflow-activity-monitor). Keep in sync. */
enum ScreenTimeNames {
  static let store = ManagedSettingsStore.Name("dayflow.focus")
  static let activity = DeviceActivityName("dayflow.focus")
}

/** The persisted session and the opaque selection (standard UserDefaults of the app). */
enum ScreenTimeStorage {
  private static let selectionKey = "dayflow.screenTime.selection"
  private static let sessionKey = "dayflow.screenTime.session"

  static func loadSelection() -> FamilyActivitySelection? {
    guard let data = UserDefaults.standard.data(forKey: selectionKey) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  static func saveSelection(_ selection: FamilyActivitySelection) {
    if let data = try? JSONEncoder().encode(selection) {
      UserDefaults.standard.set(data, forKey: selectionKey)
    }
  }

  static func loadSession() -> [String: Any]? {
    UserDefaults.standard.dictionary(forKey: sessionKey)
  }

  static func saveSession(_ session: [String: Any]?) {
    if let session {
      UserDefaults.standard.set(session, forKey: sessionKey)
    } else {
      UserDefaults.standard.removeObject(forKey: sessionKey)
    }
  }
}

enum ScreenTimeBlocking {
  static let maxDurationMs: Double = 12 * 60 * 60 * 1000
  /** DeviceActivity refuses schedules shorter than this (DeviceActivityCenter.MonitoringError.intervalTooShort). */
  static let minimumScheduleSeconds: TimeInterval = 15 * 60

  static var store: ManagedSettingsStore { ManagedSettingsStore(named: ScreenTimeNames.store) }

  static func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

  static func authorization() -> String {
    switch AuthorizationCenter.shared.authorizationStatus {
    case .approved: return "approved"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unavailable"
    }
  }

  static func selectionCounts(_ selection: FamilyActivitySelection) -> [String: Any] {
    [
      "applicationCount": selection.applicationTokens.count,
      "categoryCount": selection.categoryTokens.count,
    ]
  }

  static func start(_ request: ScreenTimeStartRequest) throws -> [String: Any] {
    guard AuthorizationCenter.shared.authorizationStatus == .approved else { throw NotAuthorizedException() }
    let now = nowMs()
    if let session = runningSession(now: now), (session["lockMode"] as? String) == "STRICT" {
      throw FocusLockedException()
    }
    let endsAt = request.endsAt ?? now + Double(request.durationMinutes ?? 0) * 60_000
    guard endsAt > now, endsAt - now <= maxDurationMs else { throw InvalidDurationException() }

    let selection = ScreenTimeStorage.loadSelection() ?? FamilyActivitySelection()
    let shielded = request.shield && !(selection.applicationTokens.isEmpty && selection.categoryTokens.isEmpty)
    let settings = store
    settings.clearAllSettings()
    if shielded {
      settings.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
      settings.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
    }

    var session: [String: Any] = [
      "active": true,
      "startedAt": now,
      "endsAt": endsAt,
      "lockMode": request.lockMode == "STRICT" ? "STRICT" : "FLEXIBLE",
      "origin": request.origin,
      "shielded": shielded,
    ]
    if let value = request.sessionId { session["sessionId"] = value }
    if let value = request.dayId { session["dayId"] = value }
    if let value = request.dayTitle { session["dayTitle"] = value }
    if let value = request.selectionLabel { session["selectionLabel"] = value }
    session["autoEnd"] = scheduleAutoEnd(endsAtMs: endsAt)
    ScreenTimeStorage.saveSession(session)
    return status()
  }

  static func stop() throws -> [String: Any] {
    let now = nowMs()
    if let session = runningSession(now: now), (session["lockMode"] as? String) == "STRICT" {
      throw FocusLockedException()
    }
    clear()
    return status()
  }

  /** Removes only DayFlow's shield (its named store) and its schedule. */
  static func clear() {
    store.clearAllSettings()
    DeviceActivityCenter().stopMonitoring([ScreenTimeNames.activity])
    ScreenTimeStorage.saveSession(nil)
  }

  static func runningSession(now: Double) -> [String: Any]? {
    guard let session = ScreenTimeStorage.loadSession(), session["active"] as? Bool == true,
          let endsAt = session["endsAt"] as? Double, now < endsAt else { return nil }
    return session
  }

  /**
   * Automatic end while DayFlow is closed: a one-off DeviceActivity schedule ending at the Focus end; the monitor
   * extension clears the store in intervalDidEnd. The schedule must last at least 15 minutes, so a shorter Focus uses
   * an interval that starts in the past and still ends at endsAt. Returns "scheduled" or the error text.
   */
  static func scheduleAutoEnd(endsAtMs: Double) -> String {
    let end = Date(timeIntervalSince1970: endsAtMs / 1000)
    let start = min(Date(), end.addingTimeInterval(-minimumScheduleSeconds))
    let components: Set<Calendar.Component> = [.era, .year, .month, .day, .hour, .minute, .second]
    let schedule = DeviceActivitySchedule(
      intervalStart: Calendar.current.dateComponents(components, from: start),
      intervalEnd: Calendar.current.dateComponents(components, from: end),
      repeats: false
    )
    let center = DeviceActivityCenter()
    center.stopMonitoring([ScreenTimeNames.activity])
    do {
      try center.startMonitoring(ScreenTimeNames.activity, during: schedule)
      return "scheduled"
    } catch {
      return String(describing: error)
    }
  }

  /**
   * Current state. An expired session is cleared here as well, so the shield is lifted when DayFlow opens even if the
   * monitor extension did not run.
   */
  static func status() -> [String: Any] {
    let now = nowMs()
    let session = ScreenTimeStorage.loadSession()
    if let session, session["active"] as? Bool == true, let endsAt = session["endsAt"] as? Double, now >= endsAt {
      clear()
    }
    let running = runningSession(now: now)
    let selection = ScreenTimeStorage.loadSelection() ?? FamilyActivitySelection()
    let approved = AuthorizationCenter.shared.authorizationStatus == .approved
    // The store is only read with authorization (without the entitlement there is nothing to read).
    let settings = approved ? store : nil
    var result: [String: Any] = [
      "implemented": true,
      "authorization": authorization(),
      "active": running != nil,
      "shieldedApplicationCount": settings?.shield.applications?.count ?? 0,
      "shieldHasCategories": settings?.shield.applicationCategories != nil,
    ]
    result.merge(selectionCounts(selection)) { current, _ in current }
    if let running {
      for key in ["endsAt", "startedAt", "lockMode", "origin", "sessionId", "dayId", "dayTitle", "shielded", "autoEnd", "selectionLabel"] {
        if let value = running[key] { result[key] = value }
      }
    }
    return result
  }
}

/** Apple's FamilyActivityPicker in a sheet with 취소 / 완료. */
struct DayflowActivityPickerView: View {
  @State private var selection: FamilyActivitySelection
  let onDone: (FamilyActivitySelection) -> Void
  let onCancel: () -> Void

  init(initial: FamilyActivitySelection, onDone: @escaping (FamilyActivitySelection) -> Void, onCancel: @escaping () -> Void) {
    _selection = State(initialValue: initial)
    self.onDone = onDone
    self.onCancel = onCancel
  }

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle("차단할 앱 선택")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("취소", action: onCancel) }
          ToolbarItem(placement: .confirmationAction) { Button("완료") { onDone(selection) } }
        }
    }
  }
}
