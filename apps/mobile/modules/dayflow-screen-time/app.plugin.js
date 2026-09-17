const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * Adds the Family Controls entitlement to the DayFlow app target on every `expo prebuild`, so FamilyControls /
 * ManagedSettings / DeviceActivity work without editing ios/ by hand. The capability must also be enabled for the
 * App ID in the Apple Developer account (Family Controls (Development) for development builds; distribution needs
 * Apple's approval).
 */
module.exports = function withDayflowScreenTime(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.developer.family-controls"] = true;
    return mod;
  });
};
