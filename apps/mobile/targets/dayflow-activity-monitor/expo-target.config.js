/**
 * DayFlow Screen Time: DeviceActivityMonitor app extension, generated into ios/ by @bacons/apple-targets on every
 * `expo prebuild` (the ios/ folder itself is not committed). It ends a Focus shield when its schedule ends, also
 * while DayFlow is not running. See modules/dayflow-screen-time.
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: "device-activity-monitor",
  name: "DayFlowActivityMonitor",
  bundleIdentifier: ".activity-monitor",
  deploymentTarget: "16.4",
  frameworks: ["ManagedSettings", "FamilyControls"],
  entitlements: {
    // Same capability as the app: Family Controls (development builds need the Development variant enabled on the
    // Apple Developer App ID of this extension as well).
    "com.apple.developer.family-controls": true,
  },
});
