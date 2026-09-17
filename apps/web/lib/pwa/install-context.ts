/**
 * How DayFlow is running, for the "DayFlow를 앱처럼 사용하기" guidance only. Nothing in the app is enabled or
 * disabled by this.
 */
export type InstallPlatform =
  /** iPhone / iPad Safari: "공유 → 홈 화면에 추가". */
  | "ios-safari"
  /** Another browser or an in-app browser on iOS (Chrome, KakaoTalk, Instagram …): open in Safari first. */
  | "ios-other"
  /** Android: browser menu or the install prompt. */
  | "android"
  /** Desktop or anything else. */
  | "other";

export interface InstallContext {
  /** Opened from the home screen (no browser UI). */
  standalone: boolean;
  platform: InstallPlatform;
}

export interface BrowserSignals {
  userAgent: string;
  maxTouchPoints: number;
  /** iOS Safari's non-standard navigator.standalone. */
  navigatorStandalone: boolean | undefined;
  /** matchMedia("(display-mode: standalone)").matches */
  displayModeStandalone: boolean;
}

const IOS_DEVICE = /iPhone|iPad|iPod/;
/** Chrome, Firefox, Edge, Opera on iOS and common in-app browsers. */
const IOS_NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|KAKAOTALK|Instagram|FBAN|FBAV|Line\/|NAVER|DaumApps|Whale/;

export function detectInstallContext(signals: BrowserSignals): InstallContext {
  const standalone = signals.navigatorStandalone === true || signals.displayModeStandalone;
  // iPadOS reports a Mac user agent; a touch screen tells it apart from a real Mac.
  const ios = IOS_DEVICE.test(signals.userAgent) || (/Macintosh/.test(signals.userAgent) && signals.maxTouchPoints > 1);
  if (ios) return { standalone, platform: IOS_NOT_SAFARI.test(signals.userAgent) ? "ios-other" : "ios-safari" };
  if (/Android/.test(signals.userAgent)) return { standalone, platform: "android" };
  return { standalone, platform: "other" };
}

/** The iOS home screen hint is for Safari tabs only; an installed app never sees it. */
export function shouldShowIosInstallHint(context: InstallContext | null, dismissed: boolean): boolean {
  return context !== null && !context.standalone && context.platform === "ios-safari" && !dismissed;
}
