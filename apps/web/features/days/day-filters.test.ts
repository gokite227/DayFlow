import type { DayPriority, DayResponse, DayTagResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { countByView, emptyDaysFilters, filterDays, sortDays } from "./day-filters";

const TODAY = "2026-09-16";

const tag = (id: string, name: string, sortOrder = 0): DayTagResponse => ({
  id,
  name,
  color: "#ee749d",
  sortOrder,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 0,
});

const home = tag("tag-home", "집안일");
const work = tag("tag-work", "본업", 1);

let created = 0;
function day(overrides: Partial<DayResponse>): DayResponse {
  created += 1;
  return {
    id: `day-${created}`,
    goalId: null,
    title: "Task",
    status: "NOT_STARTED",
    priority: "NONE" as DayPriority,
    estimatedMinutes: 30,
    plannedDate: null,
    planningMode: "ANYTIME",
    carriedFromDayId: null,
    coreDay: false,
    tags: [],
    createdAt: `2026-09-01T00:00:0${created}Z`,
    updatedAt: "2026-09-01T00:00:00Z",
    version: 0,
    schedule: null,
    ...overrides,
  };
}

const laundry = day({ title: "빨래", tags: [home], priority: "LOW" });
const todayTask = day({ title: "알고리즘 3문제", plannedDate: TODAY, goalId: "week", tags: [work], priority: "HIGH" });
const later = day({ title: "블로그", plannedDate: "2026-09-20", tags: [work, home] });
const past = day({ title: "지난 계획", plannedDate: "2026-09-10" });
const finished = day({ title: "완료한 일", plannedDate: "2026-09-15", status: "DONE" });
const days = [laundry, todayTask, later, past, finished];

describe("DAY-006 Days views", () => {
  it("전체 keeps every Day, including today's and finished ones", () => {
    expect(filterDays(days, emptyDaysFilters("all"), TODAY)).toHaveLength(5);
  });

  it("예정 keeps open Days planned today or later", () => {
    expect(filterDays(days, emptyDaysFilters("upcoming"), TODAY).map((entry) => entry.title)).toEqual([
      "알고리즘 3문제",
      "블로그",
    ]);
  });

  it("미배치 keeps Days without a date", () => {
    expect(filterDays(days, emptyDaysFilters("unplanned"), TODAY).map((entry) => entry.title)).toEqual(["빨래"]);
  });

  it("완료 keeps DONE Days", () => {
    expect(filterDays(days, emptyDaysFilters("done"), TODAY).map((entry) => entry.title)).toEqual(["완료한 일"]);
  });

  it("counts each view", () => {
    expect(countByView(days, TODAY)).toEqual({ all: 5, upcoming: 2, unplanned: 1, done: 1 });
  });
});

describe("DAY-006 Days filters", () => {
  const base = emptyDaysFilters("all");

  it("filters by Goal presence and by one Goal", () => {
    expect(filterDays(days, { ...base, goal: "without" }, TODAY)).toHaveLength(4);
    expect(filterDays(days, { ...base, goal: "with" }, TODAY).map((entry) => entry.title)).toEqual([
      "알고리즘 3문제",
    ]);
    expect(filterDays(days, { ...base, goal: { goalId: "week" } }, TODAY).map((entry) => entry.title)).toEqual([
      "알고리즘 3문제",
    ]);
  });

  it("matches any of the selected Tags (OR)", () => {
    expect(filterDays(days, { ...base, tagIds: [home.id] }, TODAY).map((entry) => entry.title)).toEqual([
      "빨래",
      "블로그",
    ]);
    expect(filterDays(days, { ...base, tagIds: [home.id, work.id] }, TODAY).map((entry) => entry.title)).toEqual([
      "빨래",
      "알고리즘 3문제",
      "블로그",
    ]);
  });

  it("filters by priority, status and title search", () => {
    expect(filterDays(days, { ...base, priority: "HIGH" }, TODAY).map((entry) => entry.title)).toEqual([
      "알고리즘 3문제",
    ]);
    expect(filterDays(days, { ...base, status: "DONE" }, TODAY).map((entry) => entry.title)).toEqual(["완료한 일"]);
    expect(filterDays(days, { ...base, search: "블로" }, TODAY).map((entry) => entry.title)).toEqual(["블로그"]);
  });
});

describe("DAY-006 Days order", () => {
  it("puts dated Days first, then undated ones, higher priority first", () => {
    const sameDate = [
      day({ title: "낮음", plannedDate: TODAY, priority: "LOW" }),
      day({ title: "높음", plannedDate: TODAY, priority: "HIGH" }),
      day({ title: "날짜 없음", priority: "HIGH" }),
    ];

    expect(sortDays(sameDate).map((entry) => entry.title)).toEqual(["높음", "낮음", "날짜 없음"]);
  });
});
