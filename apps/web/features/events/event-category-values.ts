import type {
  CreateEventCategoryRequest,
  EventCategoryResponse,
  EventCategorySummary,
  UpdateEventCategoryRequest,
} from "@dayflow/api-client";

/**
 * EVT-006: Category colors come from the Event palette (the former fixed type colors plus two more).
 * The same list is validated server-side (EventCategoryColors.java). `soft` is the light background.
 */
export const EVENT_CATEGORY_COLORS: readonly { value: string; label: string; soft: string }[] = [
  { value: "#66707a", label: "슬레이트", soft: "#eff1f3" },
  { value: "#d9822b", label: "오렌지", soft: "#fdf1e4" },
  { value: "#3a78b8", label: "블루", soft: "#e8f1fa" },
  { value: "#7453c2", label: "퍼플", soft: "#f0ebfa" },
  { value: "#cf3f5c", label: "레드", soft: "#fdeaee" },
  { value: "#2a927f", label: "틸", soft: "#e6f5f1" },
  { value: "#c2549a", label: "마젠타", soft: "#f9eaf3" },
  { value: "#8a6d3b", label: "브라운", soft: "#f4efe6" },
];

export const DEFAULT_EVENT_CATEGORY_COLOR = EVENT_CATEGORY_COLORS[0]!.value;
export const MAX_EVENT_CATEGORY_NAME_LENGTH = 30;
export const UNCATEGORIZED_LABEL = "미분류";

/** Neutral look of an Event without a Category. */
const UNCATEGORIZED_STYLE = { "--event-color": "#9a939c", "--event-soft": "#f3f1f3" };

export type EventCategoryStyle = { "--event-color": string; "--event-soft": string };

export function categoryLabel(category: EventCategorySummary | null): string {
  return category?.name ?? UNCATEGORIZED_LABEL;
}

/** CSS variables for Event rows, chips and blocks. */
export function categoryStyle(category: EventCategorySummary | null): EventCategoryStyle {
  if (!category) return UNCATEGORIZED_STYLE;
  const soft = EVENT_CATEGORY_COLORS.find((color) => color.value === category.color)?.soft;
  return { "--event-color": category.color, "--event-soft": soft ?? `color-mix(in srgb, ${category.color} 12%, #fff)` };
}

/** Next unused palette color, so new Categories do not all look the same. */
export function suggestCategoryColor(categories: readonly EventCategoryResponse[]): string {
  const used = new Set(categories.map((category) => category.color));
  return EVENT_CATEGORY_COLORS.find((color) => !used.has(color.value))?.value ?? DEFAULT_EVENT_CATEGORY_COLOR;
}

/** Local check for the server rule (names are unique ignoring case). */
export function isDuplicateCategoryName(
  categories: readonly EventCategoryResponse[],
  name: string,
  selfId?: string,
): boolean {
  const normalized = name.trim().toLocaleLowerCase();
  return categories.some((category) => category.id !== selfId && category.name.toLocaleLowerCase() === normalized);
}

export function toCreateEventCategoryRequest(name: string, color: string): CreateEventCategoryRequest {
  return { name: name.trim(), color, sortOrder: null };
}

export function toUpdateEventCategoryRequest(
  changes: { name?: string; color?: string; sortOrder?: number },
  version: number,
): UpdateEventCategoryRequest {
  return {
    ...(changes.name === undefined ? {} : { name: changes.name.trim() }),
    ...(changes.color === undefined ? {} : { color: changes.color }),
    ...(changes.sortOrder === undefined ? {} : { sortOrder: changes.sortOrder }),
    version,
  };
}

/** Display order (sortOrder, then name), matching the server's list order. */
export function sortCategories(categories: readonly EventCategoryResponse[]): EventCategoryResponse[] {
  return [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Events screen filter: every Event, only uncategorized ones, or one Category id. */
export type EventCategoryFilter = "ALL" | "UNCATEGORIZED" | { categoryId: string };

export function matchesCategoryFilter(category: EventCategorySummary | null, filter: EventCategoryFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "UNCATEGORIZED") return category === null;
  return category?.id === filter.categoryId;
}

/** Number of Events per Category id, with uncategorized Events under `null`. */
export function countByCategory(events: readonly { category: EventCategorySummary | null }[]): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  for (const event of events) {
    const key = event.category?.id ?? null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
