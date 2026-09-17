import type { ReviewArchiveEntry, ReviewArchivePage } from "@dayflow/api-client";
import { REVIEW_TYPES, REVIEW_TYPE_LABEL, reviewPeriod, type ReviewType } from "./review-period";

/**
 * Review screen state, kept in the URL so a refresh, a deep link or the browser back button returns to it:
 * - 회고 작성: /review?type=WEEK&date=2026-09-14 (the review of the period containing date)
 * - 회고 모아보기: /review?mode=archive&type=WEEK&q=운동 (type absent = every type)
 */
export type ReviewMode = "write" | "archive";
export type ArchiveTypeFilter = ReviewType | "ALL";

export const ARCHIVE_TYPE_FILTERS: readonly ArchiveTypeFilter[] = ["ALL", ...REVIEW_TYPES];

export const ARCHIVE_TYPE_LABEL: Record<ArchiveTypeFilter, string> = { ALL: "전체", ...REVIEW_TYPE_LABEL };

/** The server's page size; "더 보기" loads the next page of the same size. */
export const ARCHIVE_PAGE_SIZE = 20;

export interface ReviewViewState {
  mode: ReviewMode;
  /** 회고 작성: the period type and a date inside the period. */
  type: ReviewType;
  date: string;
  /** 회고 모아보기: the type filter and the trimmed search text ("" = no search). */
  archiveType: ArchiveTypeFilter;
  q: string;
}

const isReviewType = (value: string | null): value is ReviewType => (REVIEW_TYPES as readonly string[]).includes(value ?? "");
const isDate = (value: string | null): value is string => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function parseReviewViewState(params: { get(name: string): string | null }, today: string): ReviewViewState {
  const mode: ReviewMode = params.get("mode") === "archive" ? "archive" : "write";
  const type = params.get("type");
  const date = params.get("date");
  return {
    mode,
    type: mode === "write" && isReviewType(type) ? type : "WEEK",
    date: isDate(date) ? date : today,
    archiveType: mode === "archive" && isReviewType(type) ? type : "ALL",
    q: mode === "archive" ? (params.get("q") ?? "").trim() : "",
  };
}

/** The review of one period (also the archive card link). */
export function reviewWriteHref(type: ReviewType, date: string): string {
  return `/review?${new URLSearchParams({ type, date }).toString()}`;
}

export function reviewArchiveHref(filter: { type: ArchiveTypeFilter; q: string }): string {
  const query = new URLSearchParams({ mode: "archive" });
  if (filter.type !== "ALL") query.set("type", filter.type);
  if (filter.q.trim() !== "") query.set("q", filter.q.trim());
  return `/review?${query.toString()}`;
}

/** The API query of a filter; "ALL" and an empty search are left out. */
export function archiveQuery(filter: { type: ArchiveTypeFilter; q: string }, page: number) {
  return {
    ...(filter.type === "ALL" ? {} : { type: filter.type }),
    ...(filter.q.trim() === "" ? {} : { q: filter.q.trim() }),
    page,
    size: ARCHIVE_PAGE_SIZE,
  };
}

/** Next page to request, or undefined when the last page was the end. */
export function nextArchivePage(lastPage: Pick<ReviewArchivePage, "page" | "hasNext">): number | undefined {
  return lastPage.hasNext ? lastPage.page + 1 : undefined;
}

/** Empty list wording: nothing written yet, nothing for the type, or nothing for the search. */
export function archiveEmptyMessage(filter: { type: ArchiveTypeFilter; q: string }): string {
  if (filter.q.trim() !== "") return "검색 결과가 없어요.";
  if (filter.type !== "ALL") return "해당 기간의 회고가 없어요.";
  return "아직 작성한 회고가 없어요.";
}

/** "주간 회고 · 2026-09-14 ~ 2026-09-20" */
export function archiveCardTitle(entry: Pick<ReviewArchiveEntry, "type" | "periodStart">): string {
  return `${REVIEW_TYPE_LABEL[entry.type]} 회고 · ${reviewPeriod(entry.type, entry.periodStart).label}`;
}

export function archiveCardCounts(entry: Pick<ReviewArchiveEntry, "keepCount" | "problemCount" | "tryCount" | "linkedGoalCount">): string[] {
  return [
    `Keep ${entry.keepCount}`,
    `Problem ${entry.problemCount}`,
    `Try ${entry.tryCount}`,
    `연결 목표 ${entry.linkedGoalCount}`,
  ];
}

export function ratingLabel(rating: number | null): string {
  return rating === null ? "만족도 없음" : `만족도 ${rating}/5`;
}
