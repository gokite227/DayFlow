import type { SelectableApp } from "./blocking-adapter";
import type { BlockedAppRef } from "./focus-model";

/**
 * DayFlow's own app categories for the block-app picker. The OS category (Android ApplicationInfo.category) is
 * only a hint: many apps declare none, and Android has no shopping, education, health or travel category. So an
 * app's category is decided in this order, and anything unclear ends up in 기타:
 * 1. a manual override (not editable in the UI yet; the parameter keeps room for it),
 * 2. a short list of well-known apps,
 * 3. the OS category,
 * 4. OTHER.
 */
export type AppCategoryId =
  | "SOCIAL"
  | "GAMES"
  | "ENTERTAINMENT"
  | "SHOPPING_FOOD"
  | "PRODUCTIVITY"
  | "EDUCATION"
  | "HEALTH"
  | "TRAVEL"
  | "NEWS"
  | "OTHER";

export const APP_CATEGORIES: readonly { id: AppCategoryId; label: string }[] = [
  { id: "SOCIAL", label: "소셜 미디어" },
  { id: "GAMES", label: "게임" },
  { id: "ENTERTAINMENT", label: "영상 · 엔터테인먼트" },
  { id: "SHOPPING_FOOD", label: "쇼핑 · 음식" },
  { id: "PRODUCTIVITY", label: "생산성" },
  { id: "EDUCATION", label: "교육" },
  { id: "HEALTH", label: "건강 · 피트니스" },
  { id: "TRAVEL", label: "여행" },
  { id: "NEWS", label: "뉴스" },
  { id: "OTHER", label: "기타" },
];

const CATEGORY_LABEL = new Map(APP_CATEGORIES.map((category) => [category.id, category.label]));

export function appCategoryLabel(id: string | undefined): string {
  return CATEGORY_LABEL.get(id as AppCategoryId) ?? "기타";
}

/** Android ApplicationInfo.category names → DayFlow categories. IMAGE, ACCESSIBILITY and UNDEFINED stay unknown. */
const OS_CATEGORY: Readonly<Record<string, AppCategoryId>> = {
  GAME: "GAMES",
  AUDIO: "ENTERTAINMENT",
  VIDEO: "ENTERTAINMENT",
  SOCIAL: "SOCIAL",
  NEWS: "NEWS",
  MAPS: "TRAVEL",
  PRODUCTIVITY: "PRODUCTIVITY",
};

/** Well-known apps whose OS category is missing or too broad (e.g. messengers without a category). */
const KNOWN_APPS: Readonly<Record<string, AppCategoryId>> = {
  "com.instagram.android": "SOCIAL",
  "com.instagram.barcelona": "SOCIAL",
  "com.facebook.katana": "SOCIAL",
  "com.twitter.android": "SOCIAL",
  "com.discord": "SOCIAL",
  "com.kakao.talk": "SOCIAL",
  "jp.naver.line.android": "SOCIAL",
  "com.zhiliaoapp.musically": "SOCIAL",
  "com.ss.android.ugc.trill": "SOCIAL",
  "com.reddit.frontpage": "SOCIAL",
  "com.snapchat.android": "SOCIAL",
  "org.telegram.messenger": "SOCIAL",
  "com.whatsapp": "SOCIAL",
  "com.nhn.android.band": "SOCIAL",
  "com.google.android.youtube": "ENTERTAINMENT",
  "com.netflix.mediaclient": "ENTERTAINMENT",
  "tv.twitch.android.app": "ENTERTAINMENT",
  "com.spotify.music": "ENTERTAINMENT",
  "com.disney.disneyplus": "ENTERTAINMENT",
  "net.cj.cjhv.gs.tving": "ENTERTAINMENT",
  "kr.co.captv.pooqV2": "ENTERTAINMENT",
  "com.coupang.mobile": "SHOPPING_FOOD",
  // 배달의민족
  "com.sampleapp": "SHOPPING_FOOD",
  "com.fineapp.yogiyo": "SHOPPING_FOOD",
  "com.coupang.mobile.eats": "SHOPPING_FOOD",
  "com.amazon.mShop.android.shopping": "SHOPPING_FOOD",
  "com.elevenst": "SHOPPING_FOOD",
  "com.ebay.mobile": "SHOPPING_FOOD",
  "com.duolingo": "EDUCATION",
  "com.google.android.apps.classroom": "EDUCATION",
  "com.sec.android.app.shealth": "HEALTH",
  "com.google.android.apps.fitness": "HEALTH",
  "com.strava": "HEALTH",
  "com.airbnb.android": "TRAVEL",
  "com.booking": "TRAVEL",
  "com.nhn.android.nmap": "TRAVEL",
  "net.daum.android.map": "TRAVEL",
  "com.google.android.apps.maps": "TRAVEL",
};

export function categorizeApp(
  app: Pick<SelectableApp, "id" | "osCategory">,
  overrides: Readonly<Record<string, AppCategoryId>> = {},
): AppCategoryId {
  return overrides[app.id] ?? KNOWN_APPS[app.id] ?? (app.osCategory ? OS_CATEGORY[app.osCategory] : undefined) ?? "OTHER";
}

export interface AppCategoryGroup {
  id: AppCategoryId;
  label: string;
  apps: SelectableApp[];
}

/** Non-empty categories in the fixed order; apps keep the order they came in (user apps first, by name). */
export function groupAppsByCategory(apps: readonly SelectableApp[], overrides: Readonly<Record<string, AppCategoryId>> = {}): AppCategoryGroup[] {
  return APP_CATEGORIES.map((category) => ({
    ...category,
    apps: apps.filter((app) => categorizeApp(app, overrides) === category.id),
  })).filter((group) => group.apps.length > 0);
}

export type CategorySelectionState = "NONE" | "PARTIAL" | "ALL";

export function categorySelectionState(apps: readonly Pick<BlockedAppRef, "id">[], selectedIds: ReadonlySet<string>): CategorySelectionState {
  const selected = apps.filter((app) => selectedIds.has(app.id)).length;
  if (selected === 0) return "NONE";
  return selected === apps.length ? "ALL" : "PARTIAL";
}

export function categorySelectionLabel(apps: readonly Pick<BlockedAppRef, "id">[], selectedIds: ReadonlySet<string>): string {
  const state = categorySelectionState(apps, selectedIds);
  if (state === "ALL") return "전체 선택";
  if (state === "NONE") return "선택 안 함";
  return `${apps.filter((app) => selectedIds.has(app.id)).length}개 선택`;
}
