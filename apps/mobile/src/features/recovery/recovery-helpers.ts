import type {
  ApplyCarryOverRequest,
  ApplyRecoveryRequest,
  CarryOverPreviewResponse,
  DayResponse,
  GoalResponse,
  RecoveryDayResponse,
  RecoveryEventItemResponse,
} from "@dayflow/api-client";
import { addDays, koreanShortDate } from "../../lib/dates";

/**
 * Recovery on mobile builds the same requests as the Web (REC-001..005). Every rule that changes data —
 * validation, the transaction, Carry Over Goal resolution — stays on the server's preview/apply endpoints.
 */
export type RecoveryAction = ApplyRecoveryRequest["decisions"][number]["action"];
export type CarryOverMode = CarryOverPreviewResponse["mode"];
export type CarryOverLevel = CarryOverPreviewResponse["levels"][number];

export const RECOVERY_ACTIONS: readonly RecoveryAction[] = ["KEEP", "REDUCE", "MOVE", "CARRY_OVER", "DROP"];

export const RECOVERY_ACTION_LABEL: Record<RecoveryAction, string> = {
  KEEP: "그대로 두기",
  REDUCE: "작게 줄이기",
  MOVE: "날짜 바꾸기",
  CARRY_OVER: "다음 계획으로 이어가기",
  DROP: "이번에는 내려놓기",
};

export const CARRY_OVER_MODES: readonly CarryOverMode[] = ["DAY_ONLY", "WITH_PLAN", "WITHOUT_GOAL"];

export const CARRY_OVER_MODE_LABEL: Record<CarryOverMode, string> = {
  DAY_ONLY: "이 Day만 넘기기",
  WITH_PLAN: "계획 구조와 함께 이어가기",
  WITHOUT_GOAL: "Goal 연결 없이 넘기기",
};

/** UI-only: the Day is left out of this apply; nothing changes and nothing is recorded. */
export const SKIP_THIS_TIME = "SKIP_THIS_TIME";
export const SKIP_THIS_TIME_LABEL = "이번엔 건너뛰기";

export type RecoveryChoice = RecoveryAction | typeof SKIP_THIS_TIME;

export interface RecoveryDraft {
  action: RecoveryChoice;
  estimatedMinutes: number;
  title: string;
  plannedDate: string;
}

export interface MoveRange {
  min: string;
  /** null: no end (a Day without a Goal can move to any later date). */
  max: string | null;
}

export function initialDraft(day: DayResponse, moveDate: string | null): RecoveryDraft {
  return { action: "KEEP", estimatedMinutes: Math.max(1, Math.floor(day.estimatedMinutes / 2)), title: day.title, plannedDate: moveDate ?? "" };
}

/** MOVE stays inside the WEEK Goal (null once that week is over); without a Goal: today or later. */
export function moveRange(goal: Pick<GoalResponse, "startDate" | "endDate"> | undefined, today: string): MoveRange | null {
  if (!goal) return { min: today, max: null };
  const min = goal.startDate > today ? goal.startDate : today;
  return min <= goal.endDate ? { min, max: goal.endDate } : null;
}

/** Why an action cannot be picked for this Day, or null when it can. */
export function actionUnavailableReason(action: RecoveryAction, day: Pick<DayResponse, "goalId">, range: MoveRange | null): string | null {
  if (action === "MOVE" && range === null) return "이 주가 지나서 날짜만 바꿀 수는 없어요";
  if (action === "CARRY_OVER" && day.goalId === null) return "목표 없는 Day는 날짜 바꾸기로 원하는 날에 옮겨요";
  return null;
}

export type DraftProblem = "reduceMinutes" | "reduceTitle" | "moveDate" | null;

export const DRAFT_PROBLEM_MESSAGE: Record<Exclude<DraftProblem, null>, string> = {
  reduceMinutes: "지금 예상 시간보다 작은 값으로 정해주세요.",
  reduceTitle: "제목을 비워둘 수 없어요.",
  moveDate: "고를 수 있는 날짜 범위 안에서 정해주세요.",
};

export function draftProblem(day: DayResponse, draft: RecoveryDraft, range: MoveRange | null): DraftProblem {
  if (draft.action === "REDUCE") {
    if (!Number.isInteger(draft.estimatedMinutes) || draft.estimatedMinutes < 1 || draft.estimatedMinutes >= day.estimatedMinutes) return "reduceMinutes";
    if (draft.title.trim() === "") return "reduceTitle";
  }
  if (draft.action === "MOVE" && (!range || draft.plannedDate < range.min || (range.max !== null && draft.plannedDate > range.max))) {
    return "moveDate";
  }
  return null;
}

/** Days in the one-request KEEP/REDUCE/MOVE/DROP apply: Carry Over and skipped Days are left out. */
export function batchDays(days: readonly DayResponse[], drafts: Record<string, RecoveryDraft>): DayResponse[] {
  return days.filter((day) => {
    const action = drafts[day.id]?.action;
    return action !== "CARRY_OVER" && action !== SKIP_THIS_TIME;
  });
}

export function skippedDays(days: readonly DayResponse[], drafts: Record<string, RecoveryDraft>): DayResponse[] {
  return days.filter((day) => drafts[day.id]?.action === SKIP_THIS_TIME);
}

export interface PreviewLine {
  dayId: string;
  title: string;
  action: RecoveryAction;
  detail: string;
}

export function previewLines(days: readonly DayResponse[], drafts: Record<string, RecoveryDraft>): PreviewLine[] {
  return batchDays(days, drafts).flatMap((day) => {
    const draft = drafts[day.id];
    if (!draft || draft.action === "KEEP" || draft.action === SKIP_THIS_TIME || draft.action === "CARRY_OVER") return [];
    const detail =
      draft.action === "REDUCE"
        ? `${day.estimatedMinutes}분 → ${draft.estimatedMinutes}분${draft.title.trim() !== day.title ? ` · "${draft.title.trim()}"` : ""}`
        : draft.action === "MOVE"
          ? `${koreanShortDate(draft.plannedDate)}로 옮기기 (시간 배치 없이)`
          : "이번 계획에서 내려놓기 (기록은 남아요)";
    return [{ dayId: day.id, title: day.title, action: draft.action, detail }];
  });
}

/** Every decided Day is sent, KEEP included, so the decision is recorded (REC-005). */
export function toApplyRequest(localDate: string, days: readonly DayResponse[], drafts: Record<string, RecoveryDraft>): ApplyRecoveryRequest {
  return {
    localDate,
    decisions: batchDays(days, drafts).map((day) => {
      const draft = drafts[day.id];
      const action: RecoveryAction = draft && draft.action !== SKIP_THIS_TIME ? draft.action : "KEEP";
      const base = { dayId: day.id, version: day.version, action };
      if (draft?.action === "REDUCE") {
        return { ...base, estimatedMinutes: draft.estimatedMinutes, ...(draft.title.trim() !== day.title ? { title: draft.title.trim() } : {}) };
      }
      if (draft?.action === "MOVE") return { ...base, plannedDate: draft.plannedDate };
      return base;
    }),
  };
}

export function defaultCarryOverDate(weekGoal: Pick<GoalResponse, "endDate"> | undefined, today: string): string {
  const afterWeek = weekGoal ? addDays(weekGoal.endDate, 1) : addDays(today, 1);
  return afterWeek > today ? afterWeek : today;
}

export type LevelChoice = string | "new";

export function overridesToChoices(overrides: Partial<Record<CarryOverLevel["type"], LevelChoice>>): NonNullable<ApplyCarryOverRequest["levels"]> {
  return (Object.entries(overrides) as [CarryOverLevel["type"], LevelChoice][]).map(([type, choice]) =>
    choice === "new" ? { type, goalId: null, create: true } : { type, goalId: choice, create: false },
  );
}

/** Apply exactly what the preview showed: resolved levels, selected Days and the Goal versions seen. */
export function toApplyCarryOverRequest(localDate: string, preview: CarryOverPreviewResponse): ApplyCarryOverRequest {
  const reused = preview.levels.flatMap((level) => (level.action === "REUSE" && level.goal ? [level.goal] : []));
  const goals = preview.mode === "WITH_PLAN" ? [...preview.sourceGoalPath, ...reused] : [];
  const levels: NonNullable<ApplyCarryOverRequest["levels"]> =
    preview.mode === "WITH_PLAN"
      ? preview.levels.flatMap((level): NonNullable<ApplyCarryOverRequest["levels"]> => {
          if (level.action === "REUSE" && level.goal) return [{ type: level.type, goalId: level.goal.id, create: false }];
          if (level.action === "CREATE") return [{ type: level.type, goalId: null, create: true }];
          return [];
        })
      : [];
  return {
    localDate,
    sourceDayId: preview.sourceDay.id,
    targetDate: preview.targetDate,
    mode: preview.mode,
    targetWeekGoalId: preview.mode === "DAY_ONLY" ? preview.targetWeekGoalId : null,
    levels,
    days: preview.days.filter((entry) => entry.selected).map((entry) => ({ id: entry.day.id, version: entry.day.version })),
    goals: goals.map((goal) => ({ id: goal.id, version: goal.version })),
  };
}

/** Why a Carry Over date cannot be previewed yet, or null. */
export function carryOverDateProblem(targetDate: string, today: string, weekGoal: Pick<GoalResponse, "startDate" | "endDate">): string | null {
  if (targetDate === "") return "새 날짜를 골라주세요.";
  if (targetDate < today) return "오늘 이후 날짜를 골라주세요.";
  if (targetDate >= weekGoal.startDate && targetDate <= weekGoal.endDate) return "같은 주 안에서는 '날짜 바꾸기'를 써요.";
  return null;
}

export interface RecoveryDayGroups {
  today: RecoveryDayResponse[];
  upcoming: RecoveryDayResponse[];
  past: RecoveryDayResponse[];
}

export function groupRecoveryDays(days: readonly RecoveryDayResponse[], today: string): RecoveryDayGroups {
  return {
    today: days.filter((day) => day.date === today),
    upcoming: days.filter((day) => day.date > today).sort((a, b) => a.date.localeCompare(b.date)),
    past: days.filter((day) => day.date < today).sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function historyDetail(item: RecoveryEventItemResponse): string {
  const from = item.previousPlannedDate ? koreanShortDate(item.previousPlannedDate) : "날짜 미정";
  switch (item.action) {
    case "MOVE":
      return `${from} → ${item.newPlannedDate ? koreanShortDate(item.newPlannedDate) : "날짜 미정"}`;
    case "REDUCE":
      return `${from} · ${item.previousEstimatedMinutes}분 → ${item.newEstimatedMinutes}분`;
    case "CARRY_OVER":
      return item.destinationPlannedDate
        ? `${from} 계획 → ${koreanShortDate(item.destinationPlannedDate)} 새 계획${item.destinationDayTitle ? ` · ${item.destinationDayTitle}` : ""}`
        : `${from} 계획 → 새 계획 (지금은 삭제됨)`;
    case "DROP":
      return `${from} · 이번에는 내려놓음`;
    case "KEEP":
      return `${from} · 그대로 두기`;
  }
}