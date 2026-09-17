import type { ReviewArchiveEntry } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { goalFixture } from "../../test-fixtures";
import { goalChipLabel } from "../goals/goal-helpers";
import { DEFAULT_BOTTOM_TABS } from "../settings/settings-model";
import { OPEN_SCREEN_PARAM, RESERVED_NAVIGATION_PARAMS, screenLink } from "../navigation/app-routes";
import {
  ARCHIVE_PAGE_SIZE,
  ARCHIVE_TYPE_FILTERS,
  archiveCardCounts,
  archiveCardTitle,
  archiveEmptyMessage,
  archiveQuery,
  nextArchivePage,
  parseReviewDetailParams,
  ratingLabel,
  reviewDetailRoute,
} from "./review-archive";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const entry: ReviewArchiveEntry = {
  id: "r1",
  type: "WEEK",
  periodStart: "2026-09-14",
  periodEnd: "2026-09-20",
  rating: null,
  completed: false,
  preview: "알고리즘 루틴",
  keepCount: 1,
  problemCount: 0,
  tryCount: 2,
  linkedGoalCount: 1,
  updatedAt: "2026-09-20T12:00:00Z",
};

describe("Review archive (mobile)", () => {
  it("filters by every type and searches on the server, starting at page 0", () => {
    expect(ARCHIVE_TYPE_FILTERS).toEqual(["ALL", "DAY", "WEEK", "MONTH", "QUARTER", "YEAR"]);
    expect(archiveQuery({ type: "ALL", q: "" }, 0)).toEqual({ page: 0, size: ARCHIVE_PAGE_SIZE });
    expect(archiveQuery({ type: "WEEK", q: " 운동 " }, 0)).toEqual({ type: "WEEK", q: "운동", page: 0, size: ARCHIVE_PAGE_SIZE });
  });

  it("loads more while there is a next page", () => {
    expect(nextArchivePage({ page: 1, hasNext: true })).toBe(2);
    expect(nextArchivePage({ page: 1, hasNext: false })).toBeUndefined();
  });

  it("renders a compact card and distinguishes empty states", () => {
    expect(archiveCardTitle(entry)).toBe("주간 회고 · 9/14 ~ 9/20");
    expect(archiveCardCounts(entry)).toBe("Keep 1 · Problem 0 · Try 2 · 연결 목표 1");
    expect(ratingLabel(entry.rating)).toBe("만족도 없음");
    expect(archiveEmptyMessage({ type: "ALL", q: "" })).toBe("아직 작성한 회고가 없어요.");
    expect(archiveEmptyMessage({ type: "MONTH", q: "" })).toBe("해당 기간의 회고가 없어요.");
    expect(archiveEmptyMessage({ type: "ALL", q: "x" })).toBe("검색 결과가 없어요.");
  });

  it("opens a card as a stacked detail route that exists and uses no reserved param", () => {
    const route = reviewDetailRoute(entry);
    expect(route).toEqual({ pathname: "/review/detail", params: { type: "WEEK", periodStart: "2026-09-14" } });
    for (const key of Object.keys(route.params)) expect(RESERVED_NAVIGATION_PARAMS).not.toContain(key);
    const routes = Object.keys(import.meta.glob("../../../app/**/*.tsx")).map((file) => file.replace("../../../app/", ""));
    expect(routes).toContain("review/detail.tsx");
    expect(parseReviewDetailParams(route.params)).toEqual({ type: "WEEK", periodStart: "2026-09-14" });
    expect(parseReviewDetailParams({ type: "WEEKLY", periodStart: "2026-09-14" })).toBeNull();
    expect(parseReviewDetailParams({ type: "WEEK" })).toBeNull();
  });

  it("reaches Review as a tab or as a hidden stacked screen (Settings shortcut)", () => {
    expect(screenLink("review", ["today", "days", "calendar", "events"])).toEqual({
      method: "push",
      href: { pathname: "/open/[feature]", params: { [OPEN_SCREEN_PARAM]: "review" } },
    });
    const withReview = DEFAULT_BOTTOM_TABS.includes("review") ? DEFAULT_BOTTOM_TABS : [...DEFAULT_BOTTOM_TABS.slice(0, 3), "review" as const];
    expect(screenLink("review", withReview)).toEqual({ method: "navigate", href: { pathname: "/review" } });
  });

  it("labels CALENDAR and PERIOD Goal links in the opened review", () => {
    expect(goalChipLabel(goalFixture({ kind: "PERIOD", type: null, title: "중간고사 준비", startDate: "2026-09-21", endDate: "2026-10-08" }))).toBe(
      "기간 · 중간고사 준비 (9/21 ~ 10/8)",
    );
    expect(goalChipLabel(goalFixture({ type: "WEEK", title: "백엔드", startDate: "2026-09-14", endDate: "2026-09-20" }))).toBe("9월 3주 · 백엔드");
  });
});
