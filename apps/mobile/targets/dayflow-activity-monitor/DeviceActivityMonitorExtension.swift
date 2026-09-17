import DeviceActivity
import ManagedSettings

/**
 * Ends a DayFlow Focus when its DeviceActivity schedule ends, without DayFlow running: clears DayFlow's named
 * ManagedSettingsStore. The names must match ScreenTimeNames in modules/dayflow-screen-time/ios.
 * DayFlow also clears an expired session itself the next time it reads the status.
 */
class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  private let activity = DeviceActivityName("dayflow.focus")
  private let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("dayflow.focus"))

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    guard activity == self.activity else { return }
    store.clearAllSettings()
  }
}
