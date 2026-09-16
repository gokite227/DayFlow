"use client";

import type { DayResponse, GoalResponse } from "@dayflow/api-client";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { ErrorNotice } from "@/components/query-state";
import { formatPeriod } from "@/features/goals/goal-tree";
import { useCreateDay, useDeleteDay, useUpdateDay } from "./day-queries";
import { DayScheduleSection } from "./day-schedule-section";
import { DayTagPicker } from "./day-tag-picker";
import {
  DAY_PRIORITIES,
  DAY_PRIORITY_LABEL,
  DAY_STATUS_LABEL,
  PLANNING_MODE_LABEL,
  dayToValues,
  describeDaySchedule,
  newDayValues,
  toCreateDayRequest,
  toUpdateDayRequest,
  type DayFormValues,
  type DayStatus,
  type PlanningMode,
} from "./day-values";
import type { DayPriority } from "@dayflow/api-client";

/** create carries the preselected Goal, which may be "" for a Day without a Goal (DAY-001). */
export type DayFormTarget = { mode: "create"; goalId: string } | { mode: "edit"; day: DayResponse };

export function DayFormModal({
  target,
  weekGoals,
  onClose,
}: {
  target: DayFormTarget;
  weekGoals: readonly GoalResponse[];
  onClose: () => void;
}) {
  const [values, setValues] = useState<DayFormValues>(() =>
    target.mode === "edit" ? dayToValues(target.day) : newDayValues(target.goalId),
  );
  const createDay = useCreateDay();
  const updateDay = useUpdateDay();
  const deleteDay = useDeleteDay();

  const editing = target.mode === "edit" ? target.day : null;
  const goal = weekGoals.find((candidate) => candidate.id === values.goalId);
  const saving = createDay.isPending || updateDay.isPending;
  const busy = saving || deleteDay.isPending;
  const error = createDay.error ?? updateDay.error ?? deleteDay.error;

  const set = <Key extends keyof DayFormValues>(key: Key, value: DayFormValues[Key]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editing) {
      updateDay.mutate(
        { dayId: editing.id, body: toUpdateDayRequest(values, editing.version) },
        { onSuccess: onClose },
      );
    } else {
      createDay.mutate(toCreateDayRequest(values), { onSuccess: onClose });
    }
  };

  const remove = () => {
    if (editing && window.confirm(`"${editing.title}" Day를 삭제할까요? 되돌릴 수 없습니다.`)) {
      deleteDay.mutate(editing.id, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      label="DAY"
      title={editing ? editing.title : "새 Day"}
      subtitle={goal ? `${goal.title} · ${formatPeriod(goal)}` : undefined}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <ErrorNotice error={error} />
          </div>
        )}

        <div className="form-grid">
          <label className="field wide">
            <span className="field-label">제목</span>
            <input
              required
              maxLength={200}
              value={values.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="예: JWT Provider 구현"
            />
          </label>

          <label className="field wide">
            <span className="field-label">주간 목표</span>
            {/* DAY-001: a Goal is optional, so "연결 안 함" is a normal choice, not an empty state. */}
            <select value={values.goalId} onChange={(event) => set("goalId", event.target.value)}>
              <option value="">연결 안 함</option>
              {weekGoals.map((weekGoal) => (
                <option key={weekGoal.id} value={weekGoal.id}>
                  {weekGoal.title} ({formatPeriod(weekGoal)})
                </option>
              ))}
            </select>
            <span className="mini">목표 없이도 Day를 만들 수 있습니다. 목표를 연결하면 주간 목표 기간 안의 날짜만 고를 수 있습니다.</span>
          </label>

          <DayTagPicker selectedIds={values.tagIds} onChange={(tagIds) => set("tagIds", tagIds)} />

          <div className="field wide">
            <span className="field-label">실행 날짜</span>
            <div className="field-row">
              <input
                type="date"
                aria-label="실행 날짜"
                value={values.plannedDate}
                min={goal?.startDate}
                max={goal?.endDate}
                onChange={(event) => set("plannedDate", event.target.value)}
              />
              <button
                type="button"
                className="btn ghost small"
                onClick={() => set("plannedDate", "")}
                disabled={values.plannedDate === ""}
              >
                날짜 취소
              </button>
            </div>
            <span className="mini">
              {editing?.schedule
                ? `현재 배치: ${describeDaySchedule(editing)}. 날짜를 취소하면 시간 배치도 해제됩니다.`
                : "날짜 없이 두고 나중에 정해도 됩니다."}
            </span>
          </div>

          {editing && <DayScheduleSection day={editing} plannedDate={values.plannedDate} onSaved={onClose} />}

          <label className="field">
            <span className="field-label">상태</span>
            <select value={values.status} onChange={(event) => set("status", event.target.value as DayStatus)}>
              {(Object.keys(DAY_STATUS_LABEL) as DayStatus[]).map((status) => (
                <option key={status} value={status}>
                  {DAY_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">계획 방식</span>
            <select
              value={values.planningMode}
              onChange={(event) => set("planningMode", event.target.value as PlanningMode)}
            >
              {(Object.keys(PLANNING_MODE_LABEL) as PlanningMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {PLANNING_MODE_LABEL[mode]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">우선순위</span>
            {/* DAY-004: the task's own importance, separate from "오늘의 핵심 Day". */}
            <select
              value={values.priority}
              onChange={(event) => set("priority", event.target.value as DayPriority)}
            >
              {DAY_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {DAY_PRIORITY_LABEL[priority]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">예상 시간(분)</span>
            <input
              type="number"
              required
              min={1}
              step={1}
              value={values.estimatedMinutes}
              onChange={(event) => set("estimatedMinutes", event.target.value)}
            />
          </label>

          <label className="switch-line field wide">
            <input
              type="checkbox"
              checked={values.coreDay}
              onChange={(event) => set("coreDay", event.target.checked)}
            />
            <span>오늘의 핵심 Day</span>
          </label>
        </div>

        <div className="modal-footer">
          {editing && (
            <button type="button" className="btn danger small" onClick={remove} disabled={busy}>
              {deleteDay.isPending ? "삭제 중…" : "삭제"}
            </button>
          )}
          <div className="end">
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {saving ? "저장 중…" : editing ? "저장" : "추가"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
