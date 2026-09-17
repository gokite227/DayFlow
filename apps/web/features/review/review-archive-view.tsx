"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import {
  ARCHIVE_TYPE_FILTERS,
  ARCHIVE_TYPE_LABEL,
  archiveCardCounts,
  archiveCardTitle,
  archiveEmptyMessage,
  ratingLabel,
  reviewArchiveHref,
  reviewWriteHref,
  type ArchiveTypeFilter,
} from "./review-archive";
import { useReviewArchive } from "./review-queries";

/**
 * 회고 모아보기: saved reviews, newest reviewed period first. Type and search live in the URL and are applied
 * by the server; "더 보기" loads the next page. A card opens the review in 회고 작성 (the same editor).
 */
export function ReviewArchiveView({ type, q }: { type: ArchiveTypeFilter; q: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(q);
  const archive = useReviewArchive({ type, q });
  const entries = archive.data?.pages.flatMap((page) => page.items) ?? [];

  const search = (event: FormEvent) => {
    event.preventDefault();
    router.replace(reviewArchiveHref({ type, q: draft }), { scroll: false });
  };

  return (
    <div className="stack">
      <div className="review-archive-toolbar">
        <div className="day-view-switch" role="tablist" aria-label="회고 종류">
          {ARCHIVE_TYPE_FILTERS.map((value) => (
            <Link
              key={value}
              href={reviewArchiveHref({ type: value, q })}
              replace
              scroll={false}
              role="tab"
              aria-selected={type === value}
              className={type === value ? "active" : undefined}
            >
              {ARCHIVE_TYPE_LABEL[value]}
            </Link>
          ))}
        </div>
        <form className="review-archive-search" onSubmit={search} role="search">
          <input
            type="search"
            aria-label="회고 검색"
            placeholder="KPT 내용이나 목표 이름으로 검색"
            maxLength={100}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="btn small">
            검색
          </button>
          {q !== "" && (
            <Link href={reviewArchiveHref({ type, q: "" })} replace scroll={false} className="btn ghost small" onClick={() => setDraft("")}>
              검색 지우기
            </Link>
          )}
        </form>
      </div>

      {archive.isPending ? (
        <LoadingState label="회고를 불러오는 중…" />
      ) : archive.isError && entries.length === 0 ? (
        <ErrorNotice error={archive.error} onRetry={() => void archive.refetch()} />
      ) : entries.length === 0 ? (
        <div className="card">
          <EmptyState>{archiveEmptyMessage({ type, q })}</EmptyState>
        </div>
      ) : (
        <>
          <div className="review-archive-list">
            {entries.map((entry) => (
              <Link
                key={entry.id}
                href={reviewWriteHref(entry.type, entry.periodStart)}
                className="review-archive-card"
                data-review-id={entry.id}
              >
                <div className="review-archive-card-head">
                  <strong>{archiveCardTitle(entry)}</strong>
                  <span className="mini">{ratingLabel(entry.rating)}</span>
                </div>
                <div className="review-archive-preview">{entry.preview ?? "작성한 KPT가 없어요."}</div>
                <div className="review-archive-counts">
                  {archiveCardCounts(entry).map((count) => (
                    <span key={count} className="pill">
                      {count}
                    </span>
                  ))}
                  {entry.completed && <span className="review-status done">✓ 작성 완료</span>}
                </div>
              </Link>
            ))}
          </div>
          {/* A failed next page keeps the cards already shown. */}
          {archive.isFetchNextPageError && <ErrorNotice error={archive.error} onRetry={() => void archive.fetchNextPage()} />}
          {archive.hasNextPage && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => void archive.fetchNextPage()}
              disabled={archive.isFetchingNextPage}
            >
              {archive.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
