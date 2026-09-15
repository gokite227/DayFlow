import type { ApplyRecoveryRequest, DayResponse, GoalResponse } from "@dayflow/api-client";
import { weekdayShort } from "../calendar/calendar-time";

export type RecoveryAction = ApplyRecoveryRequest["decisions"][number]["action"];

export const RECOVERY_ACTIONS: readonly RecoveryAction[] = ["KEEP", "REDUCE", "MOVE", "DROP"];

export const RECOVERY_ACTION_LABEL: Record<RecoveryAction, string> = {
  KEEP: "그대로 두기",
  REDUCE: "작게 줄이기",
  MOVE: "다른 날로",
  DROP: "이번엔 내려놓기",
};

/** What the user picked for one Day. Unused fields are ignored for other actions. */
export interface RecoveryDraft {
  action: RecoveryAction;
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

/**
 * Dates a Day can MOVE to: from today (or the Goal start) to its WEEK Goal end. Null when the
 * Goal period is already over — moving to another week is a separate replan use case.
 */
export function moveRange(goal: Pick<GoalResponse, "startDate" | "endDate"> | undefined, today: string) {
  if (!goal) return null;
  const min = goal.startDate > today ? goal.startDate : today;
  return min <= goal.endDate ? { min, max: goal.endDate } : null;
}

export type DraftProblem = "reduceMinutes" | "reduceTitle" | "moveDate" | null;

export function draftProblem(day: DayResponse, draft: RecoveryDraft, range: { min: string; max: string } | null): DraftProblem {
  if (draft.action === "REDUCE") {
    if (!Number.isInteger(draft.estimatedMinutes) || draft.estimatedMinutes < 1 || draft.estimatedMinutes >= day.estimatedMinutes) {
      return "reduceMinutes";
    }
    if (draft.title.trim() === "") return "reduceTitle";
  }
  if (draft.action === "MOVE" && (!range || draft.plannedDate < range.min || draft.plannedDate > range.max)) {
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

/** "THU 9/17" */
export function shortDate(date: string) {
  return `${weekdayShort(date)} ${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

/** Human-readable lines for the confirmation step. KEEP lines are summarized separately. */
export function previewLines(days: readonly DayResponse[], drafts: Record<string, RecoveryDraft>): PreviewLine[] {
  return days.flatMap((day) => {
    const draft = drafts[day.id];
    if (!draft || draft.action === "KEEP") return [];
    const detail =
      draft.action === "REDUCE"
        ? `${day.estimatedMinutes}분 → ${draft.estimatedMinutes}분${draft.title.trim() !== day.title ? ` · "${draft.title.trim()}"` : ""}`
        : draft.action === "MOVE"
          ? `${shortDate(draft.plannedDate)}로 이동 (시간 배치 없이)`
          : "이번 계획에서 내려놓기 (기록은 남아요)";
    return [{ dayId: day.id, title: day.title, action: draft.action, detail }];
  });
}

/** Every listed Day is sent, KEEP included, so the applied plan is recorded as a whole. */
export function toApplyRequest(
  localDate: string,
  days: readonly DayResponse[],
  drafts: Record<string, RecoveryDraft>,
): ApplyRecoveryRequest {
  return {
    localDate,
    decisions: days.map((day) => {
      const draft = drafts[day.id] ?? { action: "KEEP" as const, estimatedMinutes: 0, title: "", plannedDate: "" };
      const base = { dayId: day.id, version: day.version, action: draft.action };
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
