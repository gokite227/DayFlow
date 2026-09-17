"use client";

import type { CoachEvidence, TodayCoachResponse } from "@dayflow/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { getDayFlowApiClient } from "@/lib/api-client";
import { describeApiError, expectData } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import {
  browserTimezone,
  COACH_ERROR_COPY,
  createTodayCoachFlow,
  describeSuggestionChange,
  isApplicable,
  suggestionKey,
  type TodayCoachFlow,
  type TodayCoachState,
} from "./today-coach-flow";

const EVIDENCE_LABEL: Record<CoachEvidence["type"], string> = {
  DAY: "Day",
  GOAL: "목표",
  REVIEW: "회고",
  METRIC: "수치",
};

/**
 * "오늘의 코치": asks the AI Coach only when the user taps the button. The answer stays in component memory;
 * suggestions change nothing until the user presses [적용] and confirms.
 */
export function TodayCoachCard({ today, onOpenDay }: { today: string; onOpenDay: (dayId: string) => Promise<void> }) {
  const queryClient = useQueryClient();
  const [flow] = useState<TodayCoachFlow>(() =>
    createTodayCoachFlow({
      requestCoach: (body) => expectData(getDayFlowApiClient().POST("/api/v1/ai/coach/today", { body })),
      loadDay: (dayId) =>
        expectData(getDayFlowApiClient().GET("/api/v1/days/{dayId}", { params: { path: { dayId } } })),
      // The same PATCH as the Day editor; Days are refetched afterwards (also after a 409 or a rule error).
      patchDay: async (dayId, body) => {
        try {
          return await expectData(
            getDayFlowApiClient().PATCH("/api/v1/days/{dayId}", { params: { path: { dayId } }, body }),
          );
        } finally {
          void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
        }
      },
      confirm: (message) => window.confirm(message),
    }),
  );
  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);
  const ask = () => void flow.request(today, browserTimezone());

  return (
    <section className="card coach-card" aria-labelledby="today-coach-title" aria-busy={state.status === "loading"}>
      <div className="coach-head">
        <h3 className="card-title" id="today-coach-title">
          오늘의 코치
        </h3>
        {state.status === "success" && (
          <button type="button" className="btn ghost small" onClick={ask}>
            다시 받기
          </button>
        )}
      </div>

      {state.status === "idle" && (
        <div className="coach-intro">
          <p>오늘 계획을 보고 우선순위를 정리해드릴게요.</p>
          <button type="button" className="btn" onClick={ask}>
            오늘 코치 받기
          </button>
        </div>
      )}

      {state.status === "loading" && (
        <div className="coach-loading" role="status">
          <span className="coach-spinner" aria-hidden />
          오늘 계획을 살펴보고 있어요...
        </div>
      )}

      {state.status === "error" && state.error && (
        <div className="notice error coach-error" role="alert">
          <span>{COACH_ERROR_COPY[state.error]}</span>
          {state.error !== "unavailable" && (
            <button type="button" className="btn ghost small" onClick={ask}>
              다시 시도
            </button>
          )}
        </div>
      )}

      {state.status === "success" && state.result && (
        <CoachResult result={state.result} state={state} flow={flow} onOpenDay={onOpenDay} />
      )}

      <p className="mini coach-trust">DayFlow의 계획 데이터를 바탕으로 제안해요. 제안은 자동으로 적용되지 않아요.</p>
    </section>
  );
}

function CoachResult({
  result,
  state,
  flow,
  onOpenDay,
}: {
  result: TodayCoachResponse;
  state: TodayCoachState;
  flow: TodayCoachFlow;
  onOpenDay: (dayId: string) => Promise<void>;
}) {
  const [openError, setOpenError] = useState<unknown>(null);
  const openDay = (dayId: string) => {
    setOpenError(null);
    onOpenDay(dayId).catch(setOpenError);
  };

  return (
    <div className="coach-result">
      <div>
        <strong className="coach-headline">{result.headline}</strong>
        {result.summary && <p className="coach-summary">{result.summary}</p>}
      </div>

      {result.priorities.length > 0 && (
        <div>
          <div className="section-label">먼저 할 일</div>
          <ol className="coach-priorities">
            {result.priorities.map((priority) => (
              <li key={priority.dayId}>
                <button type="button" className="coach-link" onClick={() => openDay(priority.dayId)}>
                  {priority.dayTitle}
                </button>
                <span className="mini">{priority.reason}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {result.observations.length > 0 && (
        <div>
          <div className="section-label">코치 메모</div>
          <ul className="coach-list">
            {result.observations.map((observation, index) => (
              <li key={index}>
                <span>{observation.message}</span>
                <span className="coach-evidence">
                  {observation.evidence.map((evidence) => (
                    <span key={`${evidence.type}:${evidence.id}`} className="coach-chip">
                      {EVIDENCE_LABEL[evidence.type]} · {evidence.label}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.suggestions.length > 0 && (
        <div>
          <div className="section-label">추천</div>
          <ul className="coach-list">
            {result.suggestions.map((suggestion, index) => {
              const key = suggestionKey(suggestion, index);
              const change = describeSuggestionChange(suggestion);
              const applied = state.applied[key];
              const applyError = state.applyError?.key === key ? state.applyError : null;
              return (
                <li key={key}>
                  <span>{suggestion.message}</span>
                  {suggestion.dayTitle && (
                    <span className="mini">
                      {suggestion.dayTitle}
                      {change && ` · ${change}`}
                    </span>
                  )}
                  {suggestion.dayId && (
                    <span className="coach-actions">
                      <button type="button" className="btn ghost small" onClick={() => openDay(suggestion.dayId as string)}>
                        Day 보기
                      </button>
                      {isApplicable(suggestion) &&
                        (applied ? (
                          <span className="pill coach-applied">{applied}</span>
                        ) : (
                          <button
                            type="button"
                            className="btn small"
                            disabled={state.applying !== null}
                            onClick={() => void flow.apply(suggestion, index)}
                          >
                            {state.applying === key ? "적용 중…" : "적용"}
                          </button>
                        ))}
                    </span>
                  )}
                  {applyError && (
                    <div className="notice error" role="alert">
                      {applyError.message ?? describeApiError(applyError.error).message}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {result.priorities.length === 0 && result.observations.length === 0 && result.suggestions.length === 0 && (
        <p className="mini">지금은 제안할 만한 내용이 많지 않아요.</p>
      )}

      {openError !== null && <div className="notice error">{describeApiError(openError).message}</div>}
    </div>
  );
}
