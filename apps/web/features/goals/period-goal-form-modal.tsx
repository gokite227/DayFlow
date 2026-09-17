"use client";

import type { DayResponse, PeriodGoalResponse } from "@dayflow/api-client";
import { daysOutsideRange } from "@dayflow/domain";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { ErrorNotice } from "@/components/query-state";
import { ApiError } from "@/lib/api-error";
import { periodRangeLabel } from "./goal-period";
import { useCreatePeriodGoal, useUpdatePeriodGoal } from "./period-goal-queries";
import {
  PERIOD_FORM_ISSUE_MESSAGE,
  PERIOD_SHRINK_BLOCKED_MESSAGE,
  newPeriodGoalValues,
  periodGoalFormIssue,
  periodGoalToValues,
  type PeriodGoalFormValues,
} from "./period-goal-values";
import { GoalKindSwitch, type GoalKindChoice } from "./period-goal-views";

export type PeriodGoalFormTarget = { mode: "create" } | { mode: "edit"; goal: PeriodGoalResponse };

/**
 * PERIOD Goal create/edit: only a title and a free start/end date. There is no level and no parent.
 * Shortening the range is checked against the linked Days first; nothing is moved or deleted.
 */
export function PeriodGoalFormModal({
  target,
  today,
  linkedDays = [],
  onSwitchKind,
  onClose,
  onCreated,
}: {
  target: PeriodGoalFormTarget;
  today: string;
  /** Days linked to the edited Goal, for the "range would leave Days outside" check. */
  linkedDays?: readonly DayResponse[];
  /** Shown only in the global create form, to go back to a CALENDAR Goal. */
  onSwitchKind?: (kind: GoalKindChoice) => void;
  onClose: () => void;
  onCreated?: (goal: PeriodGoalResponse) => void;
}) {
  const editing = target.mode === "edit" ? target.goal : null;
  const [values, setValues] = useState<PeriodGoalFormValues>(() =>
    editing ? periodGoalToValues(editing) : newPeriodGoalValues(today),
  );
  const [touched, setTouched] = useState(false);
  const createGoal = useCreatePeriodGoal();
  const updateGoal = useUpdatePeriodGoal();
  const saving = createGoal.isPending || updateGoal.isPending;
  const error = createGoal.error ?? updateGoal.error;

  const issue = periodGoalFormIssue(values);
  const outside = issue === null ? daysOutsideRange(linkedDays, values) : [];
  const shrinkRejected = error instanceof ApiError && error.problem?.code === "DATE_OUTSIDE_GOAL_PERIOD";
  const canSubmit = issue === null && outside.length === 0 && !saving;

  const set = <Key extends keyof PeriodGoalFormValues>(key: Key, value: PeriodGoalFormValues[Key]) => {
    setTouched(true);
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    if (editing) {
      updateGoal.mutate({ goal: editing, values }, { onSuccess: onClose });
    } else {
      createGoal.mutate(values, {
        onSuccess: (created) => {
          onClose();
          onCreated?.(created);
        },
      });
    }
  };

  return (
    <Modal
      label="기간 목표"
      title={editing ? "기간 목표 수정" : "새 목표"}
      subtitle={editing ? `${periodRangeLabel(editing)} · ${editing.title}` : undefined}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate>
        {shrinkRejected ? (
          <div className="notice error" style={{ marginBottom: 8 }} role="alert">
            {PERIOD_SHRINK_BLOCKED_MESSAGE}
          </div>
        ) : error ? (
          <div style={{ marginBottom: 12 }}>
            <ErrorNotice error={error} />
          </div>
        ) : null}

        <div className="form-grid">
          {onSwitchKind && <GoalKindSwitch kind="PERIOD" onChange={onSwitchKind} />}

          <label className="field wide">
            <span className="field-label">목표 제목</span>
            <input
              required
              maxLength={200}
              value={values.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="예: 중간고사 준비"
            />
          </label>

          <label className="field">
            <span className="field-label">시작일</span>
            <input type="date" required value={values.startDate} onChange={(event) => set("startDate", event.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">종료일</span>
            <input
              type="date"
              required
              min={values.startDate || undefined}
              value={values.endDate}
              onChange={(event) => set("endDate", event.target.value)}
            />
          </label>

          <span className="mini field wide">
            상위 목표나 단계 없이 이 기간 동안 이어지는 목표예요. Day를 연결하면 이 기간 안의 날짜만 고를 수 있어요.
          </span>

          {touched && issue && (
            <div className="field-error field wide" role="alert">
              {PERIOD_FORM_ISSUE_MESSAGE[issue]}
            </div>
          )}
          {outside.length > 0 && (
            <div className="notice error field wide" role="alert">
              {PERIOD_SHRINK_BLOCKED_MESSAGE}
              <ul>
                {outside.slice(0, 5).map((day) => (
                  <li key={day.id}>
                    {day.title} · {day.plannedDate}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="end">
            <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="submit" className="btn" disabled={!canSubmit}>
              {saving ? "저장 중…" : editing ? "저장" : "생성"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
