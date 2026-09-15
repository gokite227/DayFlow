"use client";

import type { GoalResponse } from "@dayflow/api-client";
import { yearPeriod, type GoalPeriod } from "@dayflow/domain";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { ErrorNotice } from "@/components/query-state";
import { ApiError } from "@/lib/api-error";
import {
  childPeriodChoices,
  goalPeriodLabel,
  periodChoicesInYear,
  periodRangeLabel,
  resolveParent,
  type PeriodChoice,
} from "./goal-period";
import { useCreateGoal, useUpdateGoal } from "./goal-queries";
import {
  GOAL_TYPE_LABEL,
  GOAL_TYPE_ORDER,
  PROGRESS_POLICY_LABEL,
  childTypeOf,
  parentTypeOf,
  sortGoals,
  type GoalType,
  type ProgressPolicy,
} from "./goal-tree";

/**
 * - create with `context`: a child of the Goal the user is in (parent fixed, type = next level).
 * - create without context: the global form; type and period first, then the valid parent.
 * - edit: the period is chosen again (never typed as dates); the parent stays.
 */
export type GoalFormTarget =
  | { mode: "create"; context: GoalResponse | null; defaultYear: number; defaultType?: GoalType; defaultMonth?: number }
  | { mode: "edit"; goal: GoalResponse };

const PERIOD_CONFLICT_CODES = new Set(["GOAL_OUTSIDE_PARENT_PERIOD", "DATE_OUTSIDE_WEEK_GOAL_PERIOD"]);

export function GoalFormModal({
  target,
  goals,
  onClose,
  onCreated,
}: {
  target: GoalFormTarget;
  goals: readonly GoalResponse[];
  onClose: () => void;
  onCreated?: (goal: GoalResponse) => void;
}) {
  const editing = target.mode === "edit" ? target.goal : null;
  const context = target.mode === "create" ? target.context : null;
  const parentOfEdited = editing ? (goals.find((goal) => goal.id === editing.parentGoalId) ?? null) : null;
  const initialYear = editing ? Number(editing.startDate.slice(0, 4)) : target.mode === "create" ? target.defaultYear : 2026;

  const [type, setType] = useState<GoalType>(
    editing
      ? editing.type
      : context
        ? (childTypeOf(context.type) ?? "YEAR")
        : target.mode === "create"
          ? (target.defaultType ?? "YEAR")
          : "YEAR",
  );
  const [year, setYear] = useState(String(initialYear));
  const [month, setMonth] = useState(
    editing ? Number(editing.startDate.slice(5, 7)) : target.mode === "create" ? (target.defaultMonth ?? 1) : 1,
  );
  const [periodKey, setPeriodKey] = useState(editing?.startDate ?? "");
  const [chosenParentId, setChosenParentId] = useState("");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [why, setWhy] = useState(editing?.why ?? "");
  const [priority, setPriority] = useState(String(editing?.priority ?? 1));
  const [progressPolicy, setProgressPolicy] = useState<ProgressPolicy>(editing?.progressPolicy ?? "AUTO");

  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const saving = createGoal.isPending || updateGoal.isPending;
  const error = createGoal.error ?? updateGoal.error;

  const parentType = parentTypeOf(type);
  const parentLabel = parentType ? GOAL_TYPE_LABEL[parentType] : "";
  const yearNumber = Number(year);
  const validYear = Number.isInteger(yearNumber) && yearNumber >= 1900 && yearNumber <= 2999;

  // Period choices: inside the known parent when there is one, otherwise per year (and month for weeks).
  const periodParent = context ?? parentOfEdited;
  const choices: PeriodChoice[] =
    type === "YEAR"
      ? []
      : periodParent
        ? childPeriodChoices(periodParent)
        : validYear
          ? periodChoicesInYear(type, yearNumber, month)
          : [];
  const selected = choices.find((option) => option.key === periodKey) ?? null;
  const period: GoalPeriod | null = type === "YEAR" ? (validYear ? yearPeriod(yearNumber) : null) : selected;

  const resolution = period && !editing ? resolveParent(type, period, goals, context) : null;
  const parentId =
    resolution?.kind === "context" || resolution?.kind === "auto"
      ? resolution.parent.id
      : resolution?.kind === "choose"
        ? chosenParentId
        : null;
  const missingParent =
    !editing && type !== "YEAR" && (resolution?.kind === "none" || (resolution?.kind === "choose" && chosenParentId === ""));
  const canSubmit = period !== null && title.trim() !== "" && !missingParent && !saving;

  const changeType = (next: GoalType) => {
    setType(next);
    setPeriodKey("");
    setChosenParentId("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!period || !canSubmit) return;
    const common = {
      title,
      why,
      startDate: period.startDate,
      endDate: period.endDate,
      priority: Number(priority),
      progressPolicy,
    };
    if (editing) {
      updateGoal.mutate({ goalId: editing.id, body: { ...common, version: editing.version } }, { onSuccess: onClose });
    } else {
      createGoal.mutate(
        { ...common, type, parentGoalId: parentId },
        {
          onSuccess: (created) => {
            onClose();
            onCreated?.(created);
          },
        },
      );
    }
  };

  const periodConflict =
    editing !== null && error instanceof ApiError && PERIOD_CONFLICT_CODES.has(error.problem?.code ?? "");

  return (
    <Modal
      label={GOAL_TYPE_LABEL[type]}
      title={editing ? "목표 수정" : context ? `새 ${GOAL_TYPE_LABEL[type]} 목표` : "새 목표"}
      subtitle={
        editing
          ? `${goalPeriodLabel(editing, true)} · ${editing.title}`
          : context
            ? `상위 목표: ${goalPeriodLabel(context, true)} · ${context.title}`
            : undefined
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {periodConflict && (
          <div className="notice error" style={{ marginBottom: 8 }} role="alert">
            이 기간으로 바꾸면 기존 하위 목표나 Day가 기간 밖으로 벗어나요. 하위 항목을 먼저 옮기거나 정리한 뒤 바꿔주세요.
          </div>
        )}
        {error && !periodConflict && (
          <div style={{ marginBottom: 12 }}>
            <ErrorNotice error={error} />
          </div>
        )}

        <div className="form-grid">
          {!editing && !context && (
            <label className="field wide">
              <span className="field-label">단계</span>
              <select value={type} onChange={(event) => changeType(event.target.value as GoalType)}>
                {GOAL_TYPE_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {GOAL_TYPE_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(type === "YEAR" || !periodParent) && (
            <label className="field">
              <span className="field-label">연도</span>
              <input
                type="number"
                required
                min={1900}
                max={2999}
                step={1}
                value={year}
                onChange={(event) => {
                  setYear(event.target.value);
                  setPeriodKey("");
                }}
              />
            </label>
          )}

          {type === "WEEK" && !periodParent && (
            <label className="field">
              <span className="field-label">월</span>
              <select
                value={month}
                onChange={(event) => {
                  setMonth(Number(event.target.value));
                  setPeriodKey("");
                }}
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}월
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="field wide">
            <span className="field-label">기간</span>
            {type === "YEAR" ? (
              <span className="period-preview">
                {period ? `${goalPeriodLabel({ type, ...period })} · ${periodRangeLabel(period)}` : "연도를 입력해주세요."}
              </span>
            ) : (
              <div className="period-picker" role="radiogroup" aria-label="기간 선택">
                {choices.map((option) => {
                  const taken = goals.some(
                    (goal) => goal.type === type && goal.startDate === option.startDate && goal.id !== editing?.id,
                  );
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={option.key === periodKey}
                      className={`period-option${option.key === periodKey ? " active" : ""}`}
                      onClick={() => {
                        setPeriodKey(option.key);
                        setChosenParentId("");
                      }}
                    >
                      <strong>{option.label}</strong>
                      <span>
                        {periodRangeLabel(option)}
                        {taken ? " · 목표 있음" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <span className="mini">기간을 고르면 시작일과 종료일이 자동으로 정해집니다.</span>
          </div>

          {!editing && type !== "YEAR" && (
            <div className="field wide">
              <span className="field-label">상위 목표 ({parentLabel})</span>
              {resolution === null ? (
                <span className="mini">기간을 먼저 선택하세요.</span>
              ) : resolution.kind === "context" || resolution.kind === "auto" ? (
                <span className="parent-fixed">
                  {goalPeriodLabel(resolution.parent, true)} · {resolution.parent.title}
                  <span className="mini">{resolution.kind === "context" ? " (현재 목표)" : " (자동 선택)"}</span>
                </span>
              ) : resolution.kind === "choose" ? (
                <select required value={chosenParentId} onChange={(event) => setChosenParentId(event.target.value)}>
                  <option value="">선택하세요</option>
                  {sortGoals(resolution.candidates).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {goalPeriodLabel(candidate, true)} · {candidate.title}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="notice error">
                  이 기간을 담을 {parentLabel} 목표가 없어요. 먼저 상위 목표를
                  만들어 주세요.
                </div>
              )}
            </div>
          )}

          <label className="field wide">
            <span className="field-label">목표 제목</span>
            <input
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 일본계 회사 취업"
            />
          </label>

          <label className="field wide">
            <span className="field-label">왜 중요한가요? (Why)</span>
            <textarea rows={2} maxLength={2000} value={why} onChange={(event) => setWhy(event.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">우선순위</span>
            <input
              type="number"
              required
              min={0}
              step={1}
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">진행률 방식</span>
            <select value={progressPolicy} onChange={(event) => setProgressPolicy(event.target.value as ProgressPolicy)}>
              {(Object.keys(PROGRESS_POLICY_LABEL) as ProgressPolicy[]).map((policy) => (
                <option key={policy} value={policy}>
                  {PROGRESS_POLICY_LABEL[policy]}
                </option>
              ))}
            </select>
          </label>
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
