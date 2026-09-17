import { describe, expect, it } from "vitest";
import manifest from "../../app/manifest";
import { detectInstallContext, shouldShowIosInstallHint, type BrowserSignals } from "./install-context";
import { isNewerBuild } from "./use-new-version";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.0.0 Mobile/15E148 Safari/604.1";
const IPHONE_KAKAOTALK =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.6.0";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const signals = (overrides: Partial<BrowserSignals>): BrowserSignals => ({
  userAgent: IPHONE_SAFARI,
  maxTouchPoints: 5,
  navigatorStandalone: false,
  displayModeStandalone: false,
  ...overrides,
});

describe("install context", () => {
  it("iPhone Safari tab: shows the home screen steps", () => {
    const context = detectInstallContext(signals({}));
    expect(context).toEqual({ standalone: false, platform: "ios-safari" });
    expect(shouldShowIosInstallHint(context, false)).toBe(true);
    expect(shouldShowIosInstallHint(context, true)).toBe(false);
  });

  it("opened from the iPhone home screen: standalone, no hint", () => {
    const fromNavigator = detectInstallContext(signals({ navigatorStandalone: true }));
    const fromMediaQuery = detectInstallContext(signals({ navigatorStandalone: undefined, displayModeStandalone: true }));
    expect(fromNavigator).toEqual({ standalone: true, platform: "ios-safari" });
    expect(fromMediaQuery.standalone).toBe(true);
    expect(shouldShowIosInstallHint(fromNavigator, false)).toBe(false);
  });

  it("other iOS browsers and in-app browsers are told to open Safari, not shown the Safari steps", () => {
    for (const userAgent of [IPHONE_CHROME, IPHONE_KAKAOTALK]) {
      const context = detectInstallContext(signals({ userAgent }));
      expect(context.platform).toBe("ios-other");
      expect(shouldShowIosInstallHint(context, false)).toBe(false);
    }
  });

  it("iPad in desktop mode counts as iOS; a real Mac does not", () => {
    expect(detectInstallContext(signals({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5 })).platform).toBe("ios-safari");
    expect(detectInstallContext(signals({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 0 })).platform).toBe("other");
  });

  it("Android and desktop never get the iOS hint", () => {
    const android = detectInstallContext(signals({ userAgent: ANDROID_CHROME, navigatorStandalone: undefined }));
    expect(android).toEqual({ standalone: false, platform: "android" });
    expect(shouldShowIosInstallHint(android, false)).toBe(false);
    expect(shouldShowIosInstallHint(null, false)).toBe(false);
  });
});

describe("new version notice", () => {
  it("only when the server serves a different, real deployment", () => {
    expect(isNewerBuild("abc123", "def456")).toBe(true);
    expect(isNewerBuild("abc123", "abc123")).toBe(false);
    expect(isNewerBuild("local", "def456")).toBe(false);
    expect(isNewerBuild("abc123", "local")).toBe(false);
    expect(isNewerBuild("abc123", undefined)).toBe(false);
    expect(isNewerBuild("abc123", "")).toBe(false);
  });
});

describe("web app manifest", () => {
  it("opens DayFlow standalone from / with the existing background color and PNG icons", () => {
    const result = manifest();
    expect(result).toMatchObject({
      name: "DayFlow",
      short_name: "DayFlow",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#fff8fb",
      theme_color: "#fff8fb",
    });
    expect(result.icons).toEqual([
      { src: "/app-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
  });
});
