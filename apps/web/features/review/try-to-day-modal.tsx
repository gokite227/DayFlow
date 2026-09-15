"use client";

import type { GoalResponse, ReviewItemResponse } from "@dayflow/api-client";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { ErrorNotice } from "@/components/query-state";
import { formatPeriod } from "@/features/goals/goal-tree";
import type { ReviewType } from "./review-period";
import { useConvertTryItem } from "./review-queries";

const TITLE_MAX = 200;
const DEFAULT_MINUTES = 30;

/** "다음 계획에 추가": a Try item becomes a Day under a WEEK Goal; the date is optional. */
export function TryToDayModal({
  item,
  weekGoals,
  suggestedGoalId,
  reviewType,
  periodStart,
  onClose,
}: {
  item: ReviewItemResponse;
  weekGoals: readonly GoalResponse[];
  suggestedGoalId: string;
  reviewType: ReviewType;
  periodStart: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item.content.slice(0, TITLE_MAX));
  const [goalId, setGoalId] = useState(suggestedGoalId);
  const [plannedDate, setPlannedDate] = useState("");
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES));
  const convert = useConvertTryItem(reviewType, periodStart);
  const goal = weekGoals.find((candidate) => candidate.id === goalId);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    convert.mutate(
      {
        itemId: item.id,
        body: {
          goalId,
          title,
          status: "NOT_STARTED",
          priority: 1,
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
    <Modal label="TRY" title="다음 계획에 추가" subtitle={item.content} onClose={onClose}>
      <form onSubmit={submit}>
        {convert.error && (
          <div style={{ marginBottom: 12 }}>
            <ErrorNotice error={convert.error} />
          </div>
        )}
        <div className="form-grid">
          <label className="field wide">
            <span className="field-label">Day 제목</span>
            <input required maxLength={TITLE_MAX} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="field wide">
            <span className="field-label">주간 목표</span>
            <select required value={goalId} onChange={(event) => setGoalId(event.target.value)}>
              <option value="">선택하세요</option>
              {weekGoals.map((weekGoal) => (
                <option key={weekGoal.id} value={weekGoal.id}>
                  {weekGoal.title} ({formatPeriod(weekGoal)})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">실행 날짜 (선택)</span>
            <input
              type="date"
              value={plannedDate}
              min={goal?.startDate}
              max={goal?.endDate}
              onChange={(event) => setPlannedDate(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">예상 시간(분)</span>
            <input type="number" required min={1} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
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
