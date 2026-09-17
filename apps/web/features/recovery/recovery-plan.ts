import type {
  ApplyCarryOverRequest,
  ApplyRecoveryRequest,
  CarryOverPreviewResponse,
  DayResponse,
  GoalResponse,
  RecoveryDayResponse,
  RecoveryEventItemResponse,
} from "@dayflow/api-client";
import { addDays, koreanShortDate } from "../calendar/calendar-time";

export type RecoveryAction = ApplyRecoveryRequest["decisions"][number]["action"];
export type CarryOverMode = CarryOverPreviewResponse["mode"];
export type CarryOverLevel = CarryOverPreviewResponse["levels"][number];

/** REC-001: the five decisions, in the order they are offered. */
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

/**
 * "이번엔 건너뛰기": a UI-only choice, not a Recovery action. The Day is left out of this apply, so it is
 * not changed and no decision is recorded; while it still meets the candidate rule it shows up again.
 */
export const SKIP_THIS_TIME = "SKIP_THIS_TIME";
export const SKIP_THIS_TIME_LABEL = "이번엔 건너뛰기";

export type RecoveryChoice = RecoveryAction | typeof SKIP_THIS_TIME;

export function isRecoveryAction(choice: RecoveryChoice): choice is RecoveryAction {
  return choice !== SKIP_THIS_TIME;
}

/** What the user picked for one Day. Unused fields are ignored for other actions. */
export interface RecoveryDraft {
  action: RecoveryChoice;
  estimatedMinutes: number;
  title: string;
  plannedDate: string;
}

export function initialDraft(day: DayResponse, moveDate: string | null): RecoveryDraft {
  return {
    action: "KEEP",
    estimatedMinutes: Math.max(1, Math.floor(day.estimatedMinutes / 2)),
    title: day.title,
    plannedDate: moveDate ?? "",
  };
}

/** Dates a MOVE may pick. `max: null` means "no end", for Days without a Goal period. */
export interface MoveRange {
  min: string;
  max: string | null;
}

/**
 * Dates a Day can MOVE to: from today (or the Goal start) to its WEEK or PERIOD Goal end. Null when the
 * Goal period is already over — another week is a CARRY_OVER (a PERIOD Goal Day is unlinked first).
 * A Day without a Goal (DAY-001) can move to today or any later date, never to the past.
 */
export function moveRange(
  goal: Pick<GoalResponse, "startDate" | "endDate"> | undefined,
  today: string,
): MoveRange | null {
  if (!goal) return { min: today, max: null };
  const min = goal.startDate > today ? goal.startDate : today;
  return min <= goal.endDate ? { min, max: goal.endDate } : null;
}

export const PERIOD_CARRY_OVER_BLOCKED =
  "기간 목표에 연결된 Day는 이어가기 대신 기간 안에서 이동하거나 목표 연결을 해제해 주세요.";

/**
 * Why an action cannot be chosen for a Day, or null when it can:
 * - MOVE needs a date left in the Goal period (a Day without a Goal can always move forward).
 * - CARRY_OVER continues a CALENDAR WEEK plan. A Day without a Goal moves with MOVE; a PERIOD Goal Day
 *   is refused by the server, so it stays inside the period or is unlinked first.
 */
export function recoveryActionBlockedReason(
  action: RecoveryChoice,
  day: Pick<DayResponse, "goalId">,
  goal: Pick<GoalResponse, "kind"> | undefined,
  range: MoveRange | null,
): string | null {
  if (action === "MOVE" && range === null) {
    return goal?.kind === "PERIOD" ? "기간 목표가 끝나서 날짜만 바꿀 수는 없어요" : "이 주가 지나서 날짜만 바꿀 수는 없어요";
  }
  if (action === "CARRY_OVER") {
    if (day.goalId === null) return "목표 없는 Day는 날짜 바꾸기로 원하는 날에 옮겨요";
    if (goal?.kind === "PERIOD") return PERIOD_CARRY_OVER_BLOCKED;
  }
  return null;
}

export type DraftProblem = "reduceMinutes" | "reduceTitle" | "moveDate" | null;

export function draftProblem(day: DayResponse, draft: RecoveryDraft, range: MoveRange | null): DraftProblem {
  if (draft.action === "REDUCE") {
    if (!Number.isInteger(draft.estimatedMinutes) || draft.estimatedMinutes < 1 || draft.estimatedMinutes >= day.estimatedMinutes) {
      return "reduceMinutes";
    }
    if (draft.title.trim() === "") return "reduceTitle";
  }
  if (
    draft.action === "MOVE" &&
    (!range || draft.plannedDate < range.min || (range.max !== null && draft.plannedDate > range.max))
  ) {
    return "moveDate";
  }
  return null;
}

export interface PreviewLine {
  dayId: string;
  title: string;
  action: RecoveryAction;
  detail: string;
}

/** "9월 17일 (목)" */
export function shortDate(date: string) {
  return koreanShortDate(date);
}

/**
 * Days that go into the one-request KEEP/REDUCE/MOVE/DROP apply. CARRY_OVER has its own preview and
 * apply, and "이번엔 건너뛰기" Days are not decided at all, so both are left out.
 */
export function batchDays(days: readonly DayResponse[], drafts: Record<string, RecoveryDraft>): DayResponse[] {
  return days.filter((day) => {
    const action = drafts[day.id]?.action;
    return action !== "CARRY_OVER" && action !== SKIP_THIS_TIME;
  });
}

/** Days the user set aside with "이번엔 건너뛰기": not sent, not recorded, offered again later. */
export function skippedDays(days: readonly DayResponse[], drafts: Record<string, RecoveryDraft>): DayResponse[] {
  return days.filter((day) => drafts[day.id]?.action === SKIP_THIS_TIME);
}

/** Human-readable lines for the confirmation step. KEEP lines are summarized separately. */
export function previewLines(days: readonly DayResponse[], drafts: Record<string, RecoveryDraft>): PreviewLine[] {
  return batchDays(days, drafts).flatMap((day) => {
    const draft = drafts[day.id];
    if (!draft || draft.action === "KEEP") return [];
    const detail =
      draft.action === "REDUCE"
        ? `${day.estimatedMinutes}분 → ${draft.estimatedMinutes}분${draft.title.trim() !== day.title ? ` · "${draft.title.trim()}"` : ""}`
        : draft.action === "MOVE"
          ? `${shortDate(draft.plannedDate)}로 옮기기 (시간 배치 없이)`
          : "이번 계획에서 내려놓기 (기록은 남아요)";
    return isRecoveryAction(draft.action) ? [{ dayId: day.id, title: day.title, action: draft.action, detail }] : [];
  });
}

/**
 * Every decided Day is sent, KEEP included, so the decision is recorded (REC-005). Carry Over and
 * skipped Days are not part of the request. An empty batch must not be sent (see hasChangesToApply).
 */
export function toApplyRequest(
  localDate: string,
  days: readonly DayResponse[],
  drafts: Record<string, RecoveryDraft>,
): ApplyRecoveryRequest {
  return {
    localDate,
    decisions: batchDays(days, drafts).map((day) => {
      const draft = drafts[day.id] ?? { action: "KEEP" as const, estimatedMinutes: 0, title: "", plannedDate: "" };
      // batchDays already removed skipped Days, so the choice is a real action here.
      const action: RecoveryAction = isRecoveryAction(draft.action) ? draft.action : "KEEP";
      const base = { dayId: day.id, version: day.version, action };
      switch (draft.action) {
        case "REDUCE":
          return {
            ...base,
            estimatedMinutes: draft.estimatedMinutes,
            ...(draft.title.trim() !== day.title ? { title: draft.title.trim() } : {}),
          };
        case "MOVE":
          return { ...base, plannedDate: draft.plannedDate };
        default:
          return base;
      }
    }),
  };
}

/** Whether a batch apply has anything to send; all skipped (or carried separately) means no request. */
export function hasChangesToApply(days: readonly DayResponse[], drafts: Record<string, RecoveryDraft>): boolean {
  return batchDays(days, drafts).length > 0;
}

/** The first suggested Carry Over date: the day after the source week, but never before today. */
export function defaultCarryOverDate(weekGoal: Pick<GoalResponse, "endDate"> | undefined, today: string): string {
  const afterWeek = weekGoal ? addDays(weekGoal.endDate, 1) : addDays(today, 1);
  return afterWeek > today ? afterWeek : today;
}

/** The user's choice for one WITH_PLAN level: an existing Goal id, or "new". */
export type LevelChoice = string | "new";

/**
 * WITH_PLAN levels as explicit choices for preview/apply. KEEP_SOURCE levels need none; the others send
 * the user's override or what the preview resolved, so apply does exactly what the preview showed.
 */
export function toLevelChoices(
  levels: readonly CarryOverLevel[],
  overrides: Partial<Record<CarryOverLevel["type"], LevelChoice>>,
): NonNullable<ApplyCarryOverRequest["levels"]> {
  return levels.flatMap((level) => {
    if (level.action === "KEEP_SOURCE") return [];
    const choice = overrides[level.type] ?? (level.action === "REUSE" ? level.goal?.id : level.action === "CREATE" ? "new" : undefined);
    if (choice === undefined) return [];
    return [choice === "new" ? { type: level.type, goalId: null, create: true } : { type: level.type, goalId: choice, create: false }];
  });
}

/** Only the overrides the user made, for the next preview request. */
export function overridesToChoices(
  overrides: Partial<Record<CarryOverLevel["type"], LevelChoice>>,
): NonNullable<ApplyCarryOverRequest["levels"]> {
  return (Object.entries(overrides) as [CarryOverLevel["type"], LevelChoice][]).map(([type, choice]) =>
    choice === "new" ? { type, goalId: null, create: true } : { type, goalId: choice, create: false },
  );
}

/** The apply body for a preview: selected Days and the Goals it relies on, with the versions seen. */
export function toApplyCarryOverRequest(localDate: string, preview: CarryOverPreviewResponse): ApplyCarryOverRequest {
  const reused = preview.levels.flatMap((level) => (level.action === "REUSE" && level.goal ? [level.goal] : []));
  const goals = preview.mode === "WITH_PLAN" ? [...preview.sourceGoalPath, ...reused] : [];
  return {
    localDate,
    sourceDayId: preview.sourceDay.id,
    targetDate: preview.targetDate,
    mode: preview.mode,
    targetWeekGoalId: preview.mode === "DAY_ONLY" ? preview.targetWeekGoalId : null,
    levels: preview.mode === "WITH_PLAN" ? toLevelChoices(preview.levels, {}) : [],
    days: preview.days.filter((entry) => entry.selected).map((entry) => ({ id: entry.day.id, version: entry.day.version })),
    goals: goals.map((goal) => ({ id: goal.id, version: goal.version })),
  };
}

export interface CarryOverSummary {
  newGoals: CarryOverLevel[];
  reusedGoals: CarryOverLevel[];
  days: DayResponse[];
  withoutGoal: boolean;
}

/** What "확인하고 적용" will create, for the preview card. */
export function summarizeCarryOver(preview: CarryOverPreviewResponse): CarryOverSummary {
  const planned = preview.mode === "WITH_PLAN" ? preview.levels : [];
  return {
    newGoals: planned.filter((level) => level.action === "CREATE"),
    reusedGoals: planned.filter((level) => level.action === "REUSE" || level.action === "KEEP_SOURCE"),
    days: preview.days.filter((entry) => entry.selected).map((entry) => entry.day),
    withoutGoal: preview.mode === "WITHOUT_GOAL",
  };
}

export interface RecoveryDayGroups {
  today: RecoveryDayResponse[];
  upcoming: RecoveryDayResponse[];
  past: RecoveryDayResponse[];
}

/** REC-002 list: today, the ones ahead (nearest first) and the past ones (latest first). */
export function groupRecoveryDays(days: readonly RecoveryDayResponse[], today: string): RecoveryDayGroups {
  return {
    today: days.filter((day) => day.date === today),
    upcoming: days.filter((day) => day.date > today).sort((a, b) => a.date.localeCompare(b.date)),
    past: days.filter((day) => day.date < today).sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** A history line such as "9월 14일 → 9월 17일" or "→ 10월 8일 새 계획". */
export function historyDetail(item: RecoveryEventItemResponse): string {
  const from = item.previousPlannedDate ? shortDate(item.previousPlannedDate) : "날짜 미정";
  switch (item.action) {
    case "MOVE":
      return `${from} → ${item.newPlannedDate ? shortDate(item.newPlannedDate) : "날짜 미정"}`;
    case "REDUCE":
      return `${from} · ${item.previousEstimatedMinutes}분 → ${item.newEstimatedMinutes}분`;
    case "CARRY_OVER":
      return item.destinationPlannedDate
        ? `${from} 계획 → ${shortDate(item.destinationPlannedDate)} 새 계획${item.destinationDayTitle ? ` · ${item.destinationDayTitle}` : ""}`
        : `${from} 계획 → 새 계획 (지금은 삭제됨)`;
    case "DROP":
      return `${from} · 이번에는 내려놓음`;
    case "KEEP":
      return `${from} · 그대로 두기`;
  }
}
