import type {
  DayResponse,
  GoalResponse,
  RecoveryCoachRequest,
  RecoveryCoachResponse,
  RecoveryRecommendation,
} from "@dayflow/api-client";
import { coachErrorKind, type CoachErrorKind } from "../today/today-coach-flow";
import { actionUnavailableReason, type MoveRange, type RecoveryDraft } from "./recovery-helpers";

/**
 * Recovery Coach flow without React. The Coach is asked only on tap and never twice at once. A recommendation only
 * pre-fills the existing Recovery choice of one Day; the change happens after the existing preview and the user's
 * "확인하고 적용" (/recovery/apply, or /recovery/carry-over/apply through the Carry Over panel).
 */

export const RECOVERY_COACH_ERROR_COPY: Record<CoachErrorKind, string> = {
  unavailable: "AI 코치가 아직 연결되지 않았어요.",
  rate_limited: "AI 코치를 잠시 많이 사용했어요. 잠시 후 다시 시도해 주세요.",
  busy: "이미 정리 제안을 만들고 있어요. 잠시만 기다려 주세요.",
  failed: "지금은 정리 제안을 만들지 못했어요.",
};

export interface RecoveryCoachState {
  status: "idle" | "loading" | "success" | "error";
  result: RecoveryCoachResponse | null;
  error: CoachErrorKind | null;
}

export interface RecoveryCoachFlow {
  getState: () => RecoveryCoachState;
  subscribe: (listener: () => void) => () => void;
  request: (body: RecoveryCoachRequest) => Promise<void>;
}

export function createRecoveryCoachFlow(deps: {
  requestRecommendations: (body: RecoveryCoachRequest) => Promise<RecoveryCoachResponse>;
}): RecoveryCoachFlow {
  let state: RecoveryCoachState = { status: "idle", result: null, error: null };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<RecoveryCoachState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async request(body) {
      if (state.status === "loading") return;
      set({ status: "loading", error: null });
      try {
        set({ status: "success", result: await deps.requestRecommendations(body) });
      } catch (error) {
        set({ status: "error", error: coachErrorKind(error) });
      }
    },
  };
}

/** The recommendation for a Day that is still a candidate with the same id; older results never leak. */
export function recommendationFor(result: RecoveryCoachResponse | null, dayId: string): RecoveryRecommendation | null {
  return result?.recommendations.find((recommendation) => recommendation.dayId === dayId) ?? null;
}

/**
 * Whether a recommendation can still be chosen with the current Day and Goal (the plan may have changed since the
 * Coach answered): the same rules as the action picker, and dates inside what the picker would accept.
 */
export function recommendationUsable(
  recommendation: RecoveryRecommendation,
  day: Pick<DayResponse, "goalId">,
  goal: Pick<GoalResponse, "kind" | "startDate" | "endDate"> | undefined,
  range: MoveRange | null,
  today: string,
): boolean {
  if (actionUnavailableReason(recommendation.action, day, range, goal) !== null) return false;
  const date = recommendation.targetDate;
  if (recommendation.action === "MOVE") {
    return date !== null && range !== null && date >= range.min && (range.max === null || date <= range.max);
  }
  if (recommendation.action === "CARRY_OVER") {
    return date !== null && date >= today && goal !== undefined && (date < goal.startDate || date > goal.endDate);
  }
  return true;
}

/** The Recovery choice a recommendation stands for; REDUCE keeps the user's (default) estimate to edit. */
export function draftFromRecommendation(recommendation: RecoveryRecommendation, current: RecoveryDraft): RecoveryDraft {
  return {
    ...current,
    action: recommendation.action,
    plannedDate: recommendation.action === "MOVE" && recommendation.targetDate ? recommendation.targetDate : current.plannedDate,
  };
}
