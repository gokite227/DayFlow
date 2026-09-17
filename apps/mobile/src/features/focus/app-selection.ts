import { APP_CATEGORIES, appCategoryLabel, categorizeApp, categorySelectionState } from "./app-categories";
import type { SelectableApp } from "./blocking-adapter";
import type { BlockedAppRef, FocusAppSelection } from "./focus-model";

/** App picker helpers (pure). The selection is a list of apps; category and "모든 앱" states are derived from it. */

/** Search by app name, ignoring case and spaces; the package name is not searched (it is not shown either). */
export function searchApps(apps: readonly SelectableApp[], query: string): SelectableApp[] {
  const needle = query.trim().toLocaleLowerCase().replace(/\s+/g, "");
  if (needle === "") return [...apps];
  return apps.filter((app) => app.label.toLocaleLowerCase().replace(/\s+/g, "").includes(needle));
}

/** The stored reference of an app: id, name and its DayFlow category (for summaries without the installed list). */
export function toBlockedApp(app: SelectableApp): BlockedAppRef {
  return { id: app.id, label: app.label, category: categorizeApp(app) };
}

export function toggleApp(selected: readonly BlockedAppRef[], app: SelectableApp): BlockedAppRef[] {
  return selected.some((entry) => entry.id === app.id) ? selected.filter((entry) => entry.id !== app.id) : [...selected, toBlockedApp(app)];
}

/** A category row (or "모든 앱"): ALL → every app of it is removed; NONE / PARTIAL → every app of it is added. */
export function toggleApps(selected: readonly BlockedAppRef[], apps: readonly SelectableApp[]): BlockedAppRef[] {
  const selectedIds = new Set(selected.map((entry) => entry.id));
  if (categorySelectionState(apps, selectedIds) === "ALL") {
    const ids = new Set(apps.map((app) => app.id));
    return selected.filter((entry) => !ids.has(entry.id));
  }
  return [...selected, ...apps.filter((app) => !selectedIds.has(app.id)).map(toBlockedApp)];
}

/**
 * The saved selection limited to apps still offered: an uninstalled app, or one that became always allowed,
 * silently drops out. Names and categories are refreshed from the installed list.
 */
export function selectionForInstalledApps(selection: Pick<FocusAppSelection, "apps">, installed: readonly SelectableApp[]): BlockedAppRef[] {
  const byId = new Map(installed.map((app) => [app.id, app]));
  return selection.apps.flatMap((app) => {
    const current = byId.get(app.id);
    return current ? [toBlockedApp(current)] : [];
  });
}

/** Distinct categories and apps of a selection, e.g. for "카테고리 3 · 앱 12". */
export function selectionCounts(apps: readonly BlockedAppRef[]): { categories: number; apps: number } {
  return { categories: new Set(apps.map((app) => app.category ?? "OTHER")).size, apps: apps.length };
}

/** "차단 앱 없음" / "소셜 미디어 · 3개 앱" / "소셜 미디어 외 2개 카테고리 · 12개 앱" */
export function selectionSummary(apps: readonly BlockedAppRef[]): string {
  if (apps.length === 0) return "차단 앱 없음";
  // iOS: one opaque Screen Time selection, already labelled like "앱 2개 · 카테고리 1개" (no names, no DayFlow category).
  if (apps.length === 1 && apps[0]!.category === undefined && apps[0]!.id.startsWith("ios:")) return apps[0]!.label;
  const order = new Map(APP_CATEGORIES.map((category, index) => [category.id as string, index]));
  const categories = [...new Set(apps.map((app) => app.category ?? "OTHER"))].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  const first = appCategoryLabel(categories[0]);
  const head = categories.length > 1 ? `${first} 외 ${categories.length - 1}개 카테고리` : first;
  return `${head} · ${apps.length}개 앱`;
}
