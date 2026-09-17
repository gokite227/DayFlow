import type {
  CoachSuggestion,
  DayResponse,
  TodayCoachRequest,
  TodayCoachResponse,
  UpdateDayRequest,
} from "@dayflow/api-client";
import { ApiError } from "../../lib/api-error";
import { DAY_PRIORITY_LABEL } from "../days/day-values";

/** "9월 18일" (the particle "로" reads naturally after it). */
function monthDay(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}

/**
 * Today Coach flow without React (so it can be tested with plain calls): one request per user tap, never on page
 * open, never twice at the same time. Suggestions are applied only through the normal Day PATCH, after reloading
 * the Day and a confirmation by the user. The answer lives only in this in-memory state: no query cache, no
 * storage, no service worker.
 */

export type CoachErrorKind = "unavailable" | "rate_limited" | "busy" | "failed";

export const COACH_ERROR_COPY: Record<CoachErrorKind, string> = {
  unavailable: "AI 코치가 아직 연결되지 않았어요.",
  rate_limited: "AI 코치를 잠시 많이 사용했어요. 잠시 후 다시 시도해 주세요.",
  busy: "이미 코치 답변을 준비하고 있어요. 잠시만 기다려 주세요.",
  failed: "지금은 코치의 답변을 불러오지 못했어요.",
};

export function coachErrorKind(error: unknown): CoachErrorKind {
  if (error instanceof ApiError) {
    const code = error.problem?.code;
    if (code === "AI_COACH_UNAVAILABLE" || error.status === 503) return "unavailable";
    if (code === "AI_RATE_LIMITED" || error.status === 429) return "rate_limited";
    if (code === "AI_COACH_BUSY") return "busy";
  }
  return "failed";
}

export type ApplicableSuggestion = CoachSuggestion & {
  type: "RESCHEDULE_DAY" | "SET_PRIORITY";
  dayId: string;
};

export function isApplicable(suggestion: CoachSuggestion): suggestion is ApplicableSuggestion {
  return (
    suggestion.dayId !== null &&
    ((suggestion.type === "RESCHEDULE_DAY" && suggestion.proposedDate !== null) ||
      (suggestion.type === "SET_PRIORITY" && suggestion.proposedPriority !== null))
  );
}

/** What [적용] would change, in words (shown next to the suggestion). API enums never reach the user. */
export function describeSuggestionChange(suggestion: CoachSuggestion): string | null {
  if (!isApplicable(suggestion)) return null;
  return suggestion.type === "RESCHEDULE_DAY"
    ? `${monthDay(suggestion.proposedDate as string)}로 이동`
    : `우선순위를 ${priorityLabel(suggestion.proposedPriority)}으로 변경`;
}

/** Korean label of a Day priority enum (HIGH → 높음). */
export function priorityLabel(priority: CoachSuggestion["proposedPriority"]): string {
  return priority === null ? "" : DAY_PRIORITY_LABEL[priority];
}

export type ApplyPlan =
  | { kind: "patch"; confirmMessage: string; body: UpdateDayRequest }
  | { kind: "already"; message: string }
  | { kind: "blocked"; message: string };

/** Decides from the freshly loaded Day whether and how a suggestion can be applied. */
export function planSuggestionApply(suggestion: ApplicableSuggestion, day: DayResponse): ApplyPlan {
  if (day.status === "DONE" || day.status === "SKIPPED") {
    return { kind: "blocked", message: "이미 끝냈거나 건너뛴 Day라 적용하지 않았어요." };
  }
  if (suggestion.type === "RESCHEDULE_DAY") {
    const date = suggestion.proposedDate as string;
    if (day.plannedDate === date) return { kind: "already", message: "이미 그 날짜에 있어요." };
    const timeNote = day.schedule ? " 시간 배치도 같은 시간으로 함께 옮겨져요." : "";
    return {
      kind: "patch",
      confirmMessage: `"${day.title}" Day를 ${monthDay(date)}로 이동할까요?${timeNote}`,
      body: { plannedDate: date, version: day.version },
    };
  }
  const priority = suggestion.proposedPriority as DayResponse["priority"];
  if (day.priority === priority) return { kind: "already", message: "이미 그 우선순위예요." };
  return {
    kind: "patch",
    confirmMessage: `"${day.title}" Day의 우선순위를 ${priorityLabel(priority)}으로 변경할까요?`,
    body: { priority, version: day.version },
  };
}

export function suggestionKey(suggestion: CoachSuggestion, index: number): string {
  return `${index}:${suggestion.type}:${suggestion.dayId ?? "-"}`;
}

export interface TodayCoachState {
  status: "idle" | "loading" | "success" | "error";
  result: TodayCoachResponse | null;
  error: CoachErrorKind | null;
  /** Key of the suggestion being applied, if any. */
  applying: string | null;
  /** Suggestion keys of the current result that are applied (or were already true). */
  applied: Record<string, string>;
  /** Apply failure of one suggestion; `error` is the raw error for the app's error description. */
  applyError: { key: string; message: string | null; error: unknown } | null;
}

export interface TodayCoachDeps {
  requestCoach: (body: TodayCoachRequest) => Promise<TodayCoachResponse>;
  loadDay: (dayId: string) => Promise<DayResponse>;
  patchDay: (dayId: string, body: UpdateDayRequest) => Promise<DayResponse>;
  confirm: (message: string) => boolean;
}

export const INITIAL_COACH_STATE: TodayCoachState = {
  status: "idle",
  result: null,
  error: null,
  applying: null,
  applied: {},
  applyError: null,
};

export interface TodayCoachFlow {
  getState: () => TodayCoachState;
  subscribe: (listener: () => void) => () => void;
  /** Asks the Coach. Ignored while a request is running. */
  request: (localDate: string, timezone: string) => Promise<void>;
  /** Applies one suggestion after reloading its Day and asking for confirmation. Ignored while another applies. */
  apply: (suggestion: CoachSuggestion, index: number) => Promise<void>;
}

export function createTodayCoachFlow(deps: TodayCoachDeps): TodayCoachFlow {
  let state = INITIAL_COACH_STATE;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<TodayCoachState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async request(localDate, timezone) {
      if (state.status === "loading") return;
      set({ status: "loading", error: null, applyError: null });
      try {
        const result = await deps.requestCoach({ localDate, timezone });
        set({ status: "success", result, applied: {}, applying: null });
      } catch (error) {
        set({ status: "error", error: coachErrorKind(error) });
      }
    },
    async apply(suggestion, index) {
      if (state.applying !== null || !isApplicable(suggestion)) return;
      const key = suggestionKey(suggestion, index);
      set({ applying: key, applyError: null });
      try {
        const plan = planSuggestionApply(suggestion, await deps.loadDay(suggestion.dayId));
        if (plan.kind === "blocked") {
          set({ applying: null, applyError: { key, message: plan.message, error: null } });
          return;
        }
        if (plan.kind === "already") {
          set({ applying: null, applied: { ...state.applied, [key]: plan.message } });
          return;
        }
        if (!deps.confirm(plan.confirmMessage)) {
          set({ applying: null });
          return;
        }
        await deps.patchDay(suggestion.dayId, plan.body);
        set({ applying: null, applied: { ...state.applied, [key]: "적용했어요." } });
      } catch (error) {
        set({ applying: null, applyError: { key, message: null, error } });
      }
    },
  };
}

/** The browser's IANA timezone (e.g. Asia/Seoul). */
export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
