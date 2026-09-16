import type { EventCategoryResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import {
  EVENT_CATEGORY_COLORS,
  categoryLabel,
  categoryStyle,
  countByCategory,
  isDuplicateCategoryName,
  matchesCategoryFilter,
  sortCategories,
  suggestCategoryColor,
  toCreateEventCategoryRequest,
  toUpdateEventCategoryRequest,
} from "./event-category-values";

const category = (overrides: Partial<EventCategoryResponse>): EventCategoryResponse => ({
  id: "c1",
  name: "면접",
  color: "#3a78b8",
  sortOrder: 0,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 0,
  ...overrides,
});

describe("EVT-006 Event Category values", () => {
  it("mirrors the server palette, including the former Event type colors", () => {
    expect(EVENT_CATEGORY_COLORS.map((color) => color.value)).toEqual([
      "#66707a",
      "#d9822b",
      "#3a78b8",
      "#7453c2",
      "#cf3f5c",
      "#2a927f",
      "#c2549a",
      "#8a6d3b",
    ]);
  });

  it("labels and colors uncategorized Events neutrally", () => {
    expect(categoryLabel(null)).toBe("미분류");
    expect(categoryLabel({ id: "c1", name: "시험", color: "#7453c2" })).toBe("시험");
    expect(categoryStyle(null)).toEqual({ "--event-color": "#9a939c", "--event-soft": "#f3f1f3" });
    expect(categoryStyle({ id: "c1", name: "시험", color: "#7453c2" })).toEqual({
      "--event-color": "#7453c2",
      "--event-soft": "#f0ebfa",
    });
  });

  it("checks duplicate names ignoring case and surrounding spaces", () => {
    const categories = [category({ id: "c1", name: "Work" }), category({ id: "c2", name: "생일" })];
    expect(isDuplicateCategoryName(categories, "  work ")).toBe(true);
    expect(isDuplicateCategoryName(categories, "WORK", "c1")).toBe(false);
    expect(isDuplicateCategoryName(categories, "Study")).toBe(false);
  });

  it("builds trimmed requests and sends only changed fields", () => {
    expect(toCreateEventCategoryRequest("  약속 ", "#2a927f")).toEqual({ name: "약속", color: "#2a927f", sortOrder: null });
    expect(toUpdateEventCategoryRequest({ name: " 약속들 " }, 2)).toEqual({ name: "약속들", version: 2 });
    expect(toUpdateEventCategoryRequest({ sortOrder: 3 }, 0)).toEqual({ sortOrder: 3, version: 0 });
  });

  it("sorts by sortOrder then name and suggests an unused color", () => {
    const sorted = sortCategories([
      category({ id: "b", name: "B", sortOrder: 1 }),
      category({ id: "a2", name: "A2", sortOrder: 0 }),
      category({ id: "a1", name: "A1", sortOrder: 0 }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["a1", "a2", "b"]);
    expect(suggestCategoryColor([category({ color: "#66707a" })])).toBe("#d9822b");
  });

  it("filters by all, uncategorized or one Category and counts Events per Category", () => {
    const work = { id: "c1", name: "Work", color: "#3a78b8" };
    expect(matchesCategoryFilter(null, "ALL")).toBe(true);
    expect(matchesCategoryFilter(null, "UNCATEGORIZED")).toBe(true);
    expect(matchesCategoryFilter(work, "UNCATEGORIZED")).toBe(false);
    expect(matchesCategoryFilter(work, { categoryId: "c1" })).toBe(true);
    expect(matchesCategoryFilter(null, { categoryId: "c1" })).toBe(false);

    const counts = countByCategory([{ category: work }, { category: work }, { category: null }]);
    expect(counts.get("c1")).toBe(2);
    expect(counts.get(null)).toBe(1);
  });
});
