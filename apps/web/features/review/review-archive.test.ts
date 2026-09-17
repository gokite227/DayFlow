import type { ReviewArchiveEntry } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { goalChipLabel } from "./review-goals";
import {
  ARCHIVE_PAGE_SIZE,
  ARCHIVE_TYPE_FILTERS,
  archiveCardCounts,
  archiveCardTitle,
  archiveEmptyMessage,
  archiveQuery,
  nextArchivePage,
  parseReviewViewState,
  ratingLabel,
  reviewArchiveHref,
  reviewWriteHref,
} from "./review-archive";

const today = "2026-09-17";
const params = (query: string) => new URLSearchParams(query);

const entry: ReviewArchiveEntry = {
  id: "r1",
  type: "WEEK",
  periodStart: "2026-09-14",
  periodEnd: "2026-09-20",
  rating: 4,
  completed: true,
  preview: "알고리즘 루틴",
  keepCount: 2,
  problemCount: 1,
  tryCount: 0,
  linkedGoalCount: 3,
  updatedAt: "2026-09-20T12:00:00Z",
};

describe("Review screen URL state (작성 / 모아보기)", () => {
  it("opens 회고 작성 of this week by default, as before", () => {
    expect(parseReviewViewState(params(""), today)).toEqual({ mode: "write", type: "WEEK", date: today, archiveType: "ALL", q: "" });
  });

  it("deep links a review period and survives a reload", () => {
    const href = reviewWriteHref("MONTH", "2026-09-01");
    expect(href).toBe("/review?type=MONTH&date=2026-09-01");
    expect(parseReviewViewState(params(href.split("?")[1]!), today)).toMatchObject({ mode: "write", type: "MONTH", date: "2026-09-01" });
  });

  it("keeps the archive type and trimmed search in the URL, and ignores invalid values", () => {
    const href = reviewArchiveHref({ type: "WEEK", q: "  운동 " });
    expect(href).toBe(`/review?mode=archive&type=WEEK&q=${encodeURIComponent("운동")}`);
    expect(parseReviewViewState(params(href.split("?")[1]!), today)).toMatchObject({ mode: "archive", archiveType: "WEEK", q: "운동" });
    expect(reviewArchiveHref({ type: "ALL", q: "" })).toBe("/review?mode=archive");
    expect(parseReviewViewState(params("mode=archive&type=DAILY"), today)).toMatchObject({ archiveType: "ALL" });
    expect(parseReviewViewState(params("mode=unknown&type=YEAR&date=nope"), today)).toMatchObject({ mode: "write", type: "YEAR", date: today });
  });
});

describe("Archive requests", () => {
  it("offers every type filter", () => {
    expect(ARCHIVE_TYPE_FILTERS).toEqual(["ALL", "DAY", "WEEK", "MONTH", "QUARTER", "YEAR"]);
  });

  it("sends only the filters in use; type and search combine; a new filter starts at page 0", () => {
    expect(archiveQuery({ type: "ALL", q: " " }, 0)).toEqual({ page: 0, size: ARCHIVE_PAGE_SIZE });
    expect(archiveQuery({ type: "WEEK", q: " 운동 " }, 0)).toEqual({ type: "WEEK", q: "운동", page: 0, size: ARCHIVE_PAGE_SIZE });
    expect(archiveQuery({ type: "MONTH", q: "포트폴리오" }, 2)).toMatchObject({ type: "MONTH", q: "포트폴리오", page: 2 });
  });

  it("loads more only while the server says there is a next page", () => {
    expect(nextArchivePage({ page: 0, hasNext: true })).toBe(1);
    expect(nextArchivePage({ page: 3, hasNext: false })).toBeUndefined();
  });
});

describe("Archive cards and empty states", () => {
  it("shows type, period, rating, preview counts and opens the review editor", () => {
    expect(archiveCardTitle(entry)).toBe("주간 회고 · 2026-09-14 ~ 2026-09-20");
    expect(archiveCardTitle({ type: "QUARTER", periodStart: "2026-07-01" })).toBe("분기 회고 · 2026 Q3");
    expect(ratingLabel(entry.rating)).toBe("만족도 4/5");
    expect(ratingLabel(null)).toBe("만족도 없음");
    expect(archiveCardCounts(entry)).toEqual(["Keep 2", "Problem 1", "Try 0", "연결 목표 3"]);
    expect(reviewWriteHref(entry.type, entry.periodStart)).toBe("/review?type=WEEK&date=2026-09-14");
  });

  it("tells apart no reviews, no reviews of a type and no search result", () => {
    expect(archiveEmptyMessage({ type: "ALL", q: "" })).toBe("아직 작성한 회고가 없어요.");
    expect(archiveEmptyMessage({ type: "WEEK", q: "" })).toBe("해당 기간의 회고가 없어요.");
    expect(archiveEmptyMessage({ type: "WEEK", q: "운동" })).toBe("검색 결과가 없어요.");
  });

  it("labels CALENDAR and PERIOD Goal links in the opened review", () => {
    const base = {
      id: "g",
      parentGoalId: null,
      why: "",
      priority: 1,
      progressPolicy: "AUTO" as const,
      continuedFromGoalId: null,
      createdAt: "",
      updatedAt: "",
      version: 0,
    };
    expect(goalChipLabel({ ...base, kind: "PERIOD", type: null, title: "중간고사 준비", startDate: "2026-09-21", endDate: "2026-10-08" })).toBe(
      "기간 · 중간고사 준비 (9/21 ~ 10/8)",
    );
    expect(goalChipLabel({ ...base, kind: "CALENDAR", type: "WEEK", title: "백엔드", startDate: "2026-09-14", endDate: "2026-09-20" })).toBe(
      "9월 3주 · 백엔드",
    );
  });
});
