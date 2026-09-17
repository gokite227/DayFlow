"use client";

import type { CalendarGoalResponse as GoalResponse, ReviewItemResponse } from "@dayflow/api-client";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { ErrorNotice } from "@/components/query-state";
import { formatPeriod } from "@/features/goals/goal-tree";
import { dayGoalCandidates, goalChipLabel, suggestedDayGoalId } from "./review-goals";
import type { ReviewType } from "./review-period";
import { useConvertTryItem } from "./review-queries";

const TITLE_MAX = 200;
const DEFAULT_MINUTES = 30;

/**
 * "Day로 만들기" (REV-004): a Try becomes a Day. The Goal is optional (DAY-001); when a date is set
 * only WEEK Goals containing it are offered, and a single match is suggested but never forced.
 */
export function TryToDayModal({
  item,
  weekGoals,
  reviewType,
  periodStart,
  onClose,
}: {
  item: ReviewItemResponse;
  weekGoals: readonly GoalResponse[];
  reviewType: ReviewType;
  periodStart: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item.content.slice(0, TITLE_MAX));
  const [goalId, setGoalId] = useState("");
  const [goalTouched, setGoalTouched] = useState(false);
  const [plannedDate, setPlannedDate] = useState("");
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES));
  const convert = useConvertTryItem(reviewType, periodStart);
  const candidates = dayGoalCandidates(weekGoals, plannedDate);
  const goal = candidates.find((candidate) => candidate.id === goalId);

  const changeDate = (date: string) => {
    setPlannedDate(date);
    const stillValid = dayGoalCandidates(weekGoals, date).some((candidate) => candidate.id === goalId);
    // Keep what the user picked ("연결 안 함" included) while it fits the date; otherwise suggest.
    if (goalTouched && (goalId === "" || stillValid)) return;
    setGoalId(suggestedDayGoalId(weekGoals, date));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    convert.mutate(
      {
        itemId: item.id,
        body: {
          goalId: goal ? goal.id : null,
          title,
          status: "NOT_STARTED",
          priority: "NONE",
          estimatedMinutes: Number(minutes),
          plannedDate: plannedDate === "" ? null : plannedDate,
          planningMode: "ANYTIME",
          coreDay: false,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal label="TRY" title="Day로 만들기" subtitle={item.content} onClose={onClose}>
      <form onSubmit={submit}>
        {convert.error ? (
          <div style={{ marginBottom: 12 }}>
            <ErrorNotice error={convert.error} />
          </div>
        ) : null}
        <div className="form-grid">
          <label className="field wide">
            <span className="field-label">Day 제목</span>
            <input required maxLength={TITLE_MAX} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">실행 날짜 (선택)</span>
            <input type="date" value={plannedDate} onChange={(event) => changeDate(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">예상 시간(분)</span>
            <input type="number" required min={1} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
          </label>
          <label className="field wide">
            <span className="field-label">주간 목표 (선택)</span>
            <select
              aria-label="주간 목표"
              value={goal ? goal.id : ""}
              onChange={(event) => {
                setGoalTouched(true);
                setGoalId(event.target.value);
              }}
            >
              <option value="">Goal 연결 안 함</option>
              {candidates.map((weekGoal) => (
                <option key={weekGoal.id} value={weekGoal.id}>
                  {goalChipLabel(weekGoal)} ({formatPeriod(weekGoal)})
                </option>
              ))}
            </select>
            <span className="mini">
              {plannedDate === ""
                ? "날짜를 고르면 그 날짜가 속한 주간 목표만 보여줍니다."
                : candidates.length === 0
                  ? "이 날짜를 포함하는 주간 목표가 없어요. 목표 없이 만들 수 있습니다."
                  : "이 날짜를 포함하는 주간 목표만 보여줍니다."}
            </span>
          </label>
        </div>
        <div className="modal-footer">
          <div className="end">
            <button type="button" className="btn secondary" onClick={onClose} disabled={convert.isPending}>
              취소
            </button>
            <button type="submit" className="btn" disabled={convert.isPending}>
              {convert.isPending ? "추가 중…" : "Day로 추가"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
