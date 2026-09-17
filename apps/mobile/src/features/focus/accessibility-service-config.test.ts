import { describe, expect, it } from "vitest";
import manifest from "../../../modules/dayflow-focus/android/src/main/AndroidManifest.xml?raw";
import automationKt from "../../../modules/dayflow-focus/android/src/main/java/app/dayflow/focus/FocusAutomation.kt?raw";
import serviceKt from "../../../modules/dayflow-focus/android/src/main/java/app/dayflow/focus/FocusAccessibilityService.kt?raw";
import blockActivityKt from "../../../modules/dayflow-focus/android/src/main/java/app/dayflow/focus/FocusBlockActivity.kt?raw";
import moduleKt from "../../../modules/dayflow-focus/android/src/main/java/app/dayflow/focus/DayflowFocusModule.kt?raw";
import serviceXml from "../../../modules/dayflow-focus/android/src/main/res/xml/dayflow_focus_accessibility_service.xml?raw";

/**
 * Guards the Android AccessibilityService declaration of modules/dayflow-focus: DayFlow only needs to know which app
 * came to the foreground. It must not ask for the system accessibility (floating) button or read window content.
 */
const kotlinSources = [serviceKt, moduleKt, blockActivityKt, automationKt];

const attribute = (name: string) => serviceXml.match(new RegExp(`android:${name}="([^"]*)"`))?.[1];

describe("DayFlow Focus accessibility service config", () => {
  it("does not request the accessibility button (no floating shortcut)", () => {
    expect(attribute("accessibilityFlags")).toBe("flagDefault");
    expect(serviceXml).not.toMatch(/flagRequestAccessibilityButton/);
    for (const source of kotlinSources) {
      expect(source).not.toMatch(/FLAG_REQUEST_ACCESSIBILITY_BUTTON|accessibilityButtonController|AccessibilityButtonCallback|setServiceInfo/);
    }
  });

  it("keeps only the window-change events blocking needs, without window content", () => {
    expect(attribute("accessibilityEventTypes")).toBe("typeWindowStateChanged");
    expect(attribute("canRetrieveWindowContent")).toBe("false");
  });

  it("declares exactly one service, bound only by the system", () => {
    expect(manifest.match(/BIND_ACCESSIBILITY_SERVICE/g)).toHaveLength(1);
    expect(manifest).toMatch(/android:resource="@xml\/dayflow_focus_accessibility_service"/);
  });
});
