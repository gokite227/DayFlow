import type { ReviewArchiveEntry, ReviewArchivePage } from "@dayflow/api-client";
import { REVIEW_TYPES, REVIEW_TYPE_LABEL, reviewPeriod, type ReviewType } from "./review-helpers";

/** 회고 모아보기 on mobile: the same server-side filter, search and pages as the Web. */
export type ArchiveTypeFilter = ReviewType | "ALL";

export const ARCHIVE_TYPE_FILTERS: readonly ArchiveTypeFilter[] = ["ALL", ...REVIEW_TYPES];
export const ARCHIVE_TYPE_LABEL: Record<ArchiveTypeFilter, string> = { ALL: "전체", ...REVIEW_TYPE_LABEL };
export const ARCHIVE_PAGE_SIZE = 20;

export function archiveQuery(filter: { type: ArchiveTypeFilter; q: string }, page: number) {
  return {
    ...(filter.type === "ALL" ? {} : { type: filter.type }),
    ...(filter.q.trim() === "" ? {} : { q: filter.q.trim() }),
    page,
    size: ARCHIVE_PAGE_SIZE,
  };
}

export function nextArchivePage(lastPage: Pick<ReviewArchivePage, "page" | "hasNext">): number | undefined {
  return lastPage.hasNext ? lastPage.page + 1 : undefined;
}

export function archiveEmptyMessage(filter: { type: ArchiveTypeFilter; q: string }): string {
  if (filter.q.trim() !== "") return "검색 결과가 없어요.";
  if (filter.type !== "ALL") return "해당 기간의 회고가 없어요.";
  return "아직 작성한 회고가 없어요.";
}

/** "주간 회고 · 9/14 ~ 9/20" */
export function archiveCardTitle(entry: Pick<ReviewArchiveEntry, "type" | "periodStart">): string {
  return `${REVIEW_TYPE_LABEL[entry.type]} 회고 · ${reviewPeriod(entry.type, entry.periodStart).label}`;
}

export function archiveCardCounts(entry: Pick<ReviewArchiveEntry, "keepCount" | "problemCount" | "tryCount" | "linkedGoalCount">): string {
  return `Keep ${entry.keepCount} · Problem ${entry.problemCount} · Try ${entry.tryCount} · 연결 목표 ${entry.linkedGoalCount}`;
}

export function ratingLabel(rating: number | null): string {
  return rating === null ? "만족도 없음" : `만족도 ${rating}/5`;
}

/** The stack route of one review, opened from the archive (Back returns to the list). */
export function reviewDetailRoute(entry: Pick<ReviewArchiveEntry, "type" | "periodStart">) {
  return { pathname: "/review/detail" as const, params: { type: entry.type, periodStart: entry.periodStart } };
}

/** Route params of /review/detail, or null when they do not describe a review period. */
export function parseReviewDetailParams(params: { type?: string; periodStart?: string }): { type: ReviewType; periodStart: string } | null {
  const type = params.type;
  const periodStart = params.periodStart;
  if (!type || !(REVIEW_TYPES as readonly string[]).includes(type)) return null;
  if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) return null;
  return { type: type as ReviewType, periodStart };
}
