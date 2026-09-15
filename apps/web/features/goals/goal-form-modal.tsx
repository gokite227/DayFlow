"use client";

import type { GoalResponse } from "@dayflow/api-client";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { ErrorNotice } from "@/components/query-state";
import { useCreateGoal, useDeleteGoal, useUpdateGoal } from "./goal-queries";
import {
  GOAL_TYPE_LABEL,
  GOAL_TYPE_ORDER,
  PROGRESS_POLICY_LABEL,
  formatPeriod,
  parentCandidates,
  parentTypeOf,
  type GoalType,
  type ProgressPolicy,
} from "./goal-tree";

export type GoalFormTarget =
  | { mode: "create"; type: GoalType; parent: GoalResponse | null; defaultStart: string; defaultEnd: string }
  | { mode: "edit"; goal: GoalResponse };

interface GoalFormValues {
  type: GoalType;
  parentGoalId: string;
  title: string;
  why: string;
  startDate: string;
  endDate: string;
  priority: string;
  progressPolicy: ProgressPolicy;
}

function initialValues(target: GoalFormTarget): GoalFormValues {
  if (target.mode === "edit") {
    const { goal } = target;
    return {
      type: goal.type,
      parentGoalId: goal.parentGoalId ?? "",
      title: goal.title,
      why: goal.why,
      startDate: goal.startDate,
      endDate: goal.endDate,
      priority: String(goal.priority),
      progressPolicy: goal.progressPolicy,
    };
  }
  return {
    type: target.type,
    parentGoalId: target.parent?.id ?? "",
    title: "",
    why: "",
    startDate: target.parent?.startDate ?? target.defaultStart,
    endDate: target.parent?.endDate ?? target.defaultEnd,
    priority: "1",
    progressPolicy: "AUTO",
  };
}

export function GoalFormModal({
  target,
  goals,
  onClose,
}: {
  target: GoalFormTarget;
  goals: readonly GoalResponse[];
  onClose: () => void;
}) {
  const [values, setValues] = useState(() => initialValues(target));
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const editing = target.mode === "edit" ? target.goal : null;
  const parentType = parentTypeOf(values.type);
  const parents = parentCandidates(goals, values.type, editing?.id);
  const saving = createGoal.isPending || updateGoal.isPending;
  const busy = saving || deleteGoal.isPending;
  const error = createGoal.error ?? updateGoal.error ?? deleteGoal.error;

  const set = <Key extends keyof GoalFormValues>(key: Key, value: GoalFormValues[Key]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const changeType = (type: GoalType) =>
    setValues((current) => ({ ...current, type, parentGoalId: "" }));

  // Choosing a parent pre-fills its period; the user can still narrow it.
  const changeParent = (parentGoalId: string) => {
    const parent = goals.find((goal) => goal.id === parentGoalId);
    setValues((current) => ({
      ...current,
      parentGoalId,
      ...(parent && target.mode === "create" ? { startDate: parent.startDate, endDate: parent.endDate } : {}),
    }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const common = {
      title: values.title,
      why: values.why,
      startDate: values.startDate,
      endDate: values.endDate,
      priority: Number(values.priority),
      progressPolicy: values.progressPolicy,
    };
    if (editing) {
      updateGoal.mutate(
        {
          goalId: editing.id,
          body: {
            ...common,
            ...(editing.type === "YEAR" ? {} : { parentGoalId: values.parentGoalId }),
            version: editing.version,
          },
        },
        { onSuccess: onClose },
      );
    } else {
      createGoal.mutate(
        { ...common, type: values.type, parentGoalId: values.parentGoalId === "" ? null : values.parentGoalId },
        { onSuccess: onClose },
      );
    }
  };

  const remove = () => {
    if (editing && window.confirm(`"${editing.title}" 목표를 삭제할까요? 되돌릴 수 없습니다.`)) {
      deleteGoal.mutate(editing.id, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      label={GOAL_TYPE_LABEL[values.type]}
      title={editing ? "목표 수정" : `새 ${GOAL_TYPE_LABEL[values.type]} 목표`}
      subtitle={editing ? `${editing.title} · ${formatPeriod(editing)}` : undefined}
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
              placeholder="예: Java 백엔드 개발자로 취업"
            />
          </label>

          <label className="field wide">
            <span className="field-label">왜 중요한가요? (Why)</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={values.why}
              onChange={(event) => set("why", event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">단계</span>
            <select
              value={values.type}
              disabled={Boolean(editing)}
              onChange={(event) => changeType(event.target.value as GoalType)}
            >
              {GOAL_TYPE_ORDER.map((type) => (
                <option key={type} value={type}>
                  {GOAL_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">
              상위 목표{parentType ? ` (${GOAL_TYPE_LABEL[parentType]})` : ""}
            </span>
            {parentType === null ? (
              <select disabled value="">
                <option value="">연간 목표는 최상위입니다</option>
              </select>
            ) : (
              <select required value={values.parentGoalId} onChange={(event) => changeParent(event.target.value)}>
                <option value="">{parents.length ? "선택하세요" : `${GOAL_TYPE_LABEL[parentType]} 목표가 없습니다`}</option>
                {parents.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title} ({formatPeriod(goal)})
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="field">
            <span className="field-label">시작일</span>
            <input
              type="date"
              required
              value={values.startDate}
              onChange={(event) => set("startDate", event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">종료일</span>
            <input
              type="date"
              required
              value={values.endDate}
              onChange={(event) => set("endDate", event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">우선순위</span>
            <input
              type="number"
              required
              min={0}
              step={1}
              value={values.priority}
              onChange={(event) => set("priority", event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">진행률 방식</span>
            <select
              value={values.progressPolicy}
              onChange={(event) => set("progressPolicy", event.target.value as ProgressPolicy)}
            >
              {(Object.keys(PROGRESS_POLICY_LABEL) as ProgressPolicy[]).map((policy) => (
                <option key={policy} value={policy}>
                  {PROGRESS_POLICY_LABEL[policy]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="modal-footer">
          {editing && (
            <button type="button" className="btn danger small" onClick={remove} disabled={busy}>
              {deleteGoal.isPending ? "삭제 중…" : "삭제"}
            </button>
          )}
          <div className="end">
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {saving ? "저장 중…" : editing ? "저장" : "생성"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
