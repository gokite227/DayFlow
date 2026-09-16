import type { CreateDayTagRequest, DayTagResponse, UpdateDayTagRequest } from "@dayflow/api-client";

/**
 * DAY-005: Tag colors are chosen from the DayFlow palette, not typed as free hex. The same list is
 * validated server-side (DayTagColors.java), so a color outside it is rejected there too.
 */
export const DAY_TAG_COLORS: readonly { value: string; label: string }[] = [
  { value: "#ee749d", label: "핑크" },
  { value: "#c78be7", label: "라벤더" },
  { value: "#8aa6ee", label: "블루" },
  { value: "#5fb7a5", label: "민트" },
  { value: "#7fb469", label: "그린" },
  { value: "#f0a45c", label: "살구" },
  { value: "#d7ae3c", label: "머스터드" },
  { value: "#9a8fa6", label: "그레이" },
];

export const DEFAULT_DAY_TAG_COLOR = DAY_TAG_COLORS[0]!.value;

export const MAX_DAY_TAG_NAME_LENGTH = 30;
export const MAX_TAGS_PER_DAY = 10;

/** Next color in the palette, so new Tags do not all look the same. */
export function suggestTagColor(tags: readonly DayTagResponse[]): string {
  const used = new Set(tags.map((tag) => tag.color));
  return DAY_TAG_COLORS.find((color) => !used.has(color.value))?.value ?? DEFAULT_DAY_TAG_COLOR;
}

/** Local check for the server rule, so the form can warn before sending (names are unique ignoring case). */
export function isDuplicateTagName(
  tags: readonly DayTagResponse[],
  name: string,
  selfId?: string,
): boolean {
  const normalized = name.trim().toLocaleLowerCase();
  return tags.some((tag) => tag.id !== selfId && tag.name.toLocaleLowerCase() === normalized);
}

export function toCreateDayTagRequest(name: string, color: string, sortOrder?: number): CreateDayTagRequest {
  return { name: name.trim(), color, sortOrder: sortOrder ?? null };
}

export function toUpdateDayTagRequest(
  changes: { name?: string; color?: string; sortOrder?: number },
  version: number,
): UpdateDayTagRequest {
  return {
    ...(changes.name === undefined ? {} : { name: changes.name.trim() }),
    ...(changes.color === undefined ? {} : { color: changes.color }),
    ...(changes.sortOrder === undefined ? {} : { sortOrder: changes.sortOrder }),
    version,
  };
}

/** Tags in display order (sortOrder, then name), matching the server's list order. */
export function sortTags(tags: readonly DayTagResponse[]): DayTagResponse[] {
  return [...tags].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
