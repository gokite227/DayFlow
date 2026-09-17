"use client";

import type { CalendarGoalResponse, CoachFact, DayResponse, PlanningCoachResponse } from "@dayflow/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { addDays, browserTimeZone, koreanShortDate, startOfWeek } from "@/features/calendar/calendar-time";
import { DayFormModal } from "@/features/days/day-form-modal";
import { getDayFlowApiClient } from "@/lib/api-client";
import { describeApiError, expectData } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import {
  PLANNING_COACH_ERROR_COPY,
  createPlanningCoachFlow,
  describeSuggestionChange,
  isApplicableSuggestion,
  planningWeekStarts,
  proposalKey,
  suggestionKey,
  type PlanningCoachFlow,
  type PlanningCoachState,
} from "./planning-coach-flow";

/**
 * "AI 계획 코치" on a WEEK Goal (its canonical week) or a PERIOD Goal (a derived Mon–Sun week of its range). Asked
 * only on tap; the answer stays in memory. Every suggestion is applied alone, after the user confirms.
 */
export function PlanningCoachCard({
  goal,
  today,
  openDayCount,
  weekGoals,
}: {
  goal: { id: string; kind?: string; startDate: string; endDate: string };
  today: string;
  /** Open Days linked to the Goal: with very few, the button reads as a draft request. */
  openDayCount: number;
  weekGoals?: CalendarGoalResponse[];
}) {
  const queryClient = useQueryClient();
  const isPeriod = goal.kind === "PERIOD";
  const weeks = isPeriod ? planningWeekStarts(goal, today, startOfWeek, addDays) : [];
  const [weekStart, setWeekStart] = useState<string | null>(weeks[0] ?? null);
  const [editingDay, setEditingDay] = useState<DayResponse | null>(null);
  const [openError, setOpenError] = useState<unknown>(null);
  const [flow] = useState<PlanningCoachFlow>(() => {
    const client = getDayFlowApiClient;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
    };
    const refreshing = async <T,>(call: () => Promise<T>) => {
      try {
        return await call();
      } finally {
        refresh();
      }
    };
    return createPlanningCoachFlow({
      requestPlanning: (body) => expectData(client().POST("/api/v1/ai/coach/planning", { body })),
      loadDay: (dayId) => expectData(client().GET("/api/v1/days/{dayId}", { params: { path: { dayId } } })),
      patchDay: (dayId, body) =>
        refreshing(() => expectData(client().PATCH("/api/v1/days/{dayId}", { params: { path: { dayId } }, body }))),
      putSchedule: (dayId, body) =>
        refreshing(() => expectData(client().PUT("/api/v1/days/{dayId}/schedule", { params: { path: { dayId } }, body }))),
      createDay: (body) => refreshing(() => expectData(client().POST("/api/v1/days", { body }))),
      confirm: (message) => window.confirm(message),
      timeZone: browserTimeZone,
    });
  });
  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);

  // An ended period has nothing left to plan (the server answers 400 as well).
  if (goal.endDate < today || (isPeriod && weeks.length === 0)) return null;

  const ask = () => void flow.request({ goalId: goal.id, weekStart: isPeriod ? weekStart : null, timezone: browserTimeZone() });
  const openDay = (dayId: string) => {
    setOpenError(null);
    expectData(getDayFlowApiClient().GET("/api/v1/days/{dayId}", { params: { path: { dayId } } }))
      .then(setEditingDay)
      .catch(setOpenError);
  };
  const draftMode = openDayCount < 2;

  return (
    <section className="card coach-card planning-coach-card" aria-labelledby="planning-coach-title" aria-busy={state.status === "loading"}>
      <div className="coach-head">
        <h3 className="card-title" id="planning-coach-title">
          AI 계획 코치
        </h3>
        {state.status === "success" && (
          <button type="button" className="btn ghost small" onClick={ask}>
            다시 받기
          </button>
        )}
      </div>

      {isPeriod && weeks.length > 1 && (
        <div className="day-view-switch planning-week-switch" role="tablist" aria-label="점검할 주">
          {weeks.map((monday) => (
            <button
              key={monday}
              type="button"
              role="tab"
              aria-selected={weekStart === monday}
              className={weekStart === monday ? "active" : undefined}
              disabled={state.status === "loading"}
              onClick={() => setWeekStart(monday)}
            >
              {monday <= today ? "이번 주" : "다음 주"} · {koreanShortDate(monday < goal.startDate ? goal.startDate : monday)}~
            </button>
          ))}
        </div>
      )}

      {(state.status === "idle" || state.status === "error") && (
        <div className="coach-intro">
          <p>최근 회고와 다음 기간 계획을 함께 보고 현실적인 배치를 제안해드려요.</p>
          {state.status === "idle" && (
            <button type="button" className="btn" onClick={ask}>
              {draftMode ? "AI 계획 초안 받기" : "AI로 계획 점검하기"}
            </button>
          )}
        </div>
      )}

      {state.status === "loading" && (
        <div className="coach-loading" role="status">
          <span className="coach-spinner" aria-hidden />
          계획과 최근 기록을 살펴보고 있어요...
        </div>
      )}

      {state.status === "error" && state.error && (
        <div className="notice error coach-error" role="alert">
          <span>{PLANNING_COACH_ERROR_COPY[state.error]}</span>
          {state.error !== "unavailable" && (
            <button type="button" className="btn ghost small" onClick={ask}>
              다시 시도
            </button>
          )}
        </div>
      )}

      {state.status === "success" && state.result && (
        <PlanningResult result={state.result} state={state} flow={flow} onOpenDay={openDay} />
      )}

      {openError !== null && <div className="notice error">{describeApiError(openError).message}</div>}
      <p className="mini coach-trust">제안은 자동으로 적용되지 않아요. 하나씩 확인한 뒤 적용할 수 있어요.</p>

      {editingDay && (
        <DayFormModal target={{ mode: "edit", day: editingDay }} weekGoals={weekGoals} onClose={() => setEditingDay(null)} />
      )}
    </section>
  );
}

function FactChips({ facts }: { facts: CoachFact[] }) {
  if (facts.length === 0) return null;
  return (
    <span className="coach-evidence">
      {facts.map((fact) => (
        <span key={fact.key} className="coach-chip">
          {fact.label}
        </span>
      ))}
    </span>
  );
}

function PlanningResult({
  result,
  state,
  flow,
  onOpenDay,
}: {
  result: PlanningCoachResponse;
  state: PlanningCoachState;
  flow: PlanningCoachFlow;
  onOpenDay: (dayId: string) => void;
}) {
  const nothing = result.observations.length === 0 && result.suggestions.length === 0 && result.proposals.length === 0;
  return (
    <div className="coach-result">
      <div>
        <strong className="coach-headline">{result.headline}</strong>
        <p className="mini">
          {koreanShortDate(result.targetStart)} ~ {koreanShortDate(result.targetEnd)}
        </p>
        {result.summary && <p className="coach-summary">{result.summary}</p>}
      </div>

      {result.observations.length > 0 && (
        <div>
          <div className="section-label">살펴본 점</div>
          <ul className="coach-list">
            {result.observations.map((observation, index) => (
              <li key={index}>
                <span>{observation.message}</span>
                <FactChips facts={observation.evidence} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.suggestions.length > 0 && (
        <div>
          <div className="section-label">기존 Day 제안</div>
          <ul className="coach-list">
            {result.suggestions.map((suggestion, index) => {
              const key = suggestionKey(suggestion, index);
              const applied = state.applied[key];
              const applyError = state.applyError?.key === key ? state.applyError : null;
              return (
                <li key={key}>
                  <strong>{suggestion.dayTitle}</strong>
                  <span className="mini">{describeSuggestionChange(suggestion)}</span>
                  <span>{suggestion.reason}</span>
                  <FactChips facts={suggestion.evidence} />
                  <span className="coach-actions">
                    <button type="button" className="btn ghost small" onClick={() => onOpenDay(suggestion.dayId)}>
                      Day 보기
                    </button>
                    {isApplicableSuggestion(suggestion) &&
                      (applied ? (
                        <span className="pill coach-applied">{applied}</span>
                      ) : (
                        <button
                          type="button"
                          className="btn small"
                          disabled={state.applying !== null}
                          onClick={() => void flow.applySuggestion(suggestion, index)}
                        >
                          {state.applying === key ? "적용 중…" : "적용"}
                        </button>
                      ))}
                  </span>
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

      {result.proposals.length > 0 && (
        <div>
          <div className="section-label">새 Day 제안</div>
          <ul className="coach-list">
            {result.proposals.map((proposal, index) => {
              const key = proposalKey(index);
              const applied = state.applied[key];
              const applyError = state.applyError?.key === key ? state.applyError : null;
              return (
                <li key={key}>
                  <strong>{proposal.title}</strong>
                  <span className="mini">{proposal.proposedDate ? koreanShortDate(proposal.proposedDate) : "날짜 미정"}</span>
                  <span>{proposal.reason}</span>
                  <FactChips facts={proposal.evidence} />
                  <span className="coach-actions">
                    {applied ? (
                      <span className="pill coach-applied">{applied}</span>
                    ) : (
                      <button
                        type="button"
                        className="btn small"
                        disabled={state.applying !== null}
                        onClick={() => void flow.createProposal(proposal, index)}
                      >
                        {state.applying === key ? "만드는 중…" : "Day 만들기"}
                      </button>
                    )}
                  </span>
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

      {nothing && <p className="mini">지금 계획에서 바꿀 만한 점을 찾지 못했어요.</p>}
    </div>
  );
}
