"use client";

import type { ReviewDraftItem, ReviewEvidence, ReviewResponse, SaveReviewRequest } from "@dayflow/api-client";
import { browserTimezone } from "@/features/today/today-coach-flow";
import {
  REVIEW_COACH_ERROR_COPY,
  replacedCount,
  type ReviewCoachFlow,
  type ReviewCoachState,
  type ReviewItemKind,
} from "./review-coach-flow";
import { REVIEW_TYPE_LABEL, type ReviewPeriod } from "./review-period";

const SECTIONS: { key: "keep" | "problem" | "try"; title: string }[] = [
  { key: "keep", title: "좋았던 흐름" },
  { key: "problem", title: "아쉬웠던 흐름" },
  { key: "try", title: "다음에 시도할 것" },
];

/**
 * "AI 회고 초안": asks the Review Coach only on tap. [초안 적용] fills unsaved draft lines in the KPT editor; nothing
 * is saved until the user presses [초안 저장].
 */
export function ReviewCoachCard({
  flow,
  state,
  period,
  review,
  typing,
}: {
  flow: ReviewCoachFlow;
  state: ReviewCoachState;
  period: ReviewPeriod;
  review: ReviewResponse | null;
  typing: boolean;
}) {
  const ask = () => void flow.request({ type: period.type, periodStart: period.start, timezone: browserTimezone() });
  const result = state.result;
  const empty = result !== null && result.keep.length + result.problem.length + result.try.length === 0;

  return (
    <section className="card coach-card review-coach-card" aria-labelledby="review-coach-title" aria-busy={state.status === "loading"}>
      <div className="coach-head">
        <h3 className="card-title" id="review-coach-title">
          AI 회고 초안
        </h3>
        {state.status === "success" && (
          <button type="button" className="btn ghost small" onClick={ask}>
            다시 만들기
          </button>
        )}
      </div>

      {state.status === "idle" && (
        <div className="coach-intro">
          <p>이번 기간의 계획과 실행 기록을 바탕으로 KPT 초안을 만들어드려요.</p>
          <button type="button" className="btn" onClick={ask}>
            AI 초안 만들기
          </button>
        </div>
      )}

      {state.status === "loading" && (
        <div className="coach-loading" role="status">
          <span className="coach-spinner" aria-hidden />
          이번 기간의 기록을 살펴보고 있어요...
        </div>
      )}

      {state.status === "error" && state.error && (
        <div className="notice error coach-error" role="alert">
          <span>{REVIEW_COACH_ERROR_COPY[state.error]}</span>
          {state.error !== "unavailable" && (
            <button type="button" className="btn ghost small" onClick={ask}>
              다시 시도
            </button>
          )}
        </div>
      )}

      {state.status === "success" && result && (
        <div className="coach-result">
          <div>
            <strong className="coach-headline">{result.headline}</strong>
            {result.summary && <p className="coach-summary">{result.summary}</p>}
          </div>

          {result.highlights.length > 0 && (
            <ul className="coach-list">
              {result.highlights.map((highlight, index) => (
                <li key={index}>
                  <span>{highlight.message}</span>
                  <EvidenceChips evidence={highlight.evidence} shown={[highlight.message]} />
                </li>
              ))}
            </ul>
          )}

          {SECTIONS.map(({ key, title }) =>
            result[key].length === 0 ? null : (
              <div key={key}>
                <div className="section-label">{title}</div>
                <ul className="coach-list">
                  {result[key].map((item: ReviewDraftItem, index) => (
                    <li key={index}>
                      <span>{item.text}</span>
                      {item.reason && <span className="mini">{item.reason}</span>}
                      <EvidenceChips evidence={item.evidence} shown={[item.text, item.reason]} />
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}

          {empty ? (
            <p className="mini">기록만으로 제안할 만한 KPT가 뚜렷하지 않아요.</p>
          ) : state.conflict ? (
            <div className="notice coach-conflict" role="alertdialog" aria-label="초안 적용 방법">
              <strong>이미 작성한 회고 내용이 있어요.</strong>
              <span className="mini">
                교체를 골라도 저장 전에는 아무것도 바뀌지 않아요. Day로 만든 항목과 목표에 연결된 항목은 교체해도 그대로 남아요.
              </span>
              <span className="coach-actions">
                <button type="button" className="btn small" onClick={() => flow.resolveConflict("append", review)}>
                  기존 내용 뒤에 추가
                </button>
                <button type="button" className="btn ghost small" onClick={() => flow.resolveConflict("replace", review)}>
                  AI 초안으로 교체
                </button>
                <button type="button" className="btn ghost small" onClick={() => flow.resolveConflict("cancel", review)}>
                  취소
                </button>
              </span>
            </div>
          ) : (
            <span className="coach-actions">
              <button type="button" className="btn small" onClick={() => flow.applyDraft(review, typing)}>
                초안 적용
              </button>
            </span>
          )}
        </div>
      )}

      <p className="mini coach-trust">
        {REVIEW_TYPE_LABEL[period.type]} 계획과 실행 기록으로 만든 초안이에요. 적용해도 저장 전에는 아무것도 바뀌지 않아요.
      </p>
    </section>
  );
}

/** Facts behind a line; a fact the sentence already quotes is not repeated as a chip. */
function EvidenceChips({ evidence, shown }: { evidence: ReviewEvidence[]; shown: string[] }) {
  const chips = evidence.filter((item) => !shown.some((text) => text.includes(item.label)));
  return chips.length === 0 ? null : (
    <span className="coach-evidence">
      {chips.map((item) => (
        <span key={item.key} className="coach-chip" title={item.label}>
          {item.label}
        </span>
      ))}
    </span>
  );
}

/** Unsaved AI draft lines of one KPT kind, editable before saving. */
export function ReviewDraftLines({ flow, state, kind, title }: { flow: ReviewCoachFlow; state: ReviewCoachState; kind: ReviewItemKind; title: string }) {
  const lines = state.drafts.filter((line) => line.kind === kind);
  return lines.length === 0 ? null : (
    <div className="kpt-drafts">
      {lines.map((line, index) => (
        <div key={line.key} className="kpt-draft-line">
          <span className="kpt-draft-badge">AI 초안 · 저장 전</span>
          <textarea
            aria-label={`${title} AI 초안 ${index + 1}`}
            value={line.content}
            maxLength={1000}
            rows={2}
            disabled={state.saving}
            onChange={(event) => flow.editDraft(line.key, event.target.value)}
          />
          <button type="button" className="btn ghost small" disabled={state.saving} onClick={() => flow.removeDraft(line.key)}>
            빼기
          </button>
        </div>
      ))}
    </div>
  );
}

/** The only place the drafts are written: [초안 저장] uses the same review PUT as the editor. */
export function ReviewDraftBar({
  flow,
  state,
  review,
  save,
}: {
  flow: ReviewCoachFlow;
  state: ReviewCoachState;
  review: ReviewResponse | null;
  save: (body: SaveReviewRequest) => Promise<ReviewResponse>;
}) {
  if (state.drafts.length === 0 && state.replacingIds.length === 0) return null;
  const replacing = replacedCount(review, state.replacingIds);
  return (
    <div className="review-draft-bar" role="region" aria-label="저장하지 않은 AI 초안">
      <div>
        <strong>저장하지 않은 AI 초안 {state.drafts.length}개</strong>
        <div className="mini">
          {replacing > 0
            ? `저장하면 기존 항목 ${replacing}개가 초안으로 바뀌어요. 저장 전에는 그대로예요.`
            : "수정한 뒤 [초안 저장]을 눌러야 회고에 저장돼요."}
        </div>
      </div>
      <span className="coach-actions">
        <button type="button" className="btn small" disabled={state.saving} onClick={() => void flow.saveDrafts(review, save)}>
          {state.saving ? "저장 중…" : "초안 저장"}
        </button>
        <button type="button" className="btn ghost small" disabled={state.saving} onClick={() => flow.discardDrafts()}>
          초안 비우기
        </button>
      </span>
    </div>
  );
}
