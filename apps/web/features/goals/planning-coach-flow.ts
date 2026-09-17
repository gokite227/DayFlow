import type {
  CreateDayRequest,
  DayResponse,
  PlanningCoachRequest,
  PlanningCoachResponse,
  PlanningDayProposal,
  PlanningDaySuggestion,
  SetDayScheduleRequest,
  UpdateDayRequest,
} from "@dayflow/api-client";
import { durationMinutes, koreanShortDate, parseTimeInput, scheduleRequest } from "../calendar/calendar-time";
import { DAY_PRIORITY_LABEL } from "../days/day-values";
import { coachErrorKind, type CoachErrorKind } from "../today/today-coach-flow";

/**
 * Planning Coach flow without React. The Coach is asked only on tap and never twice at once. Each suggestion is
 * applied alone, after reloading its Day and a confirmation, through the same Day APIs as the editor
 * (PATCH /days/{id}, PUT /days/{id}/schedule, POST /days). There is no "apply all".
 */

export const PLANNING_COACH_ERROR_COPY: Record<CoachErrorKind, string> = {
  unavailable: "AI 코치가 아직 연결되지 않았어요.",
  rate_limited: "AI 코치를 잠시 많이 사용했어요. 잠시 후 다시 시도해 주세요.",
  busy: "이미 계획을 점검하고 있어요. 잠시만 기다려 주세요.",
  failed: "지금은 계획 점검 결과를 만들지 못했어요.",
};

export interface PlanningCoachState {
  status: "idle" | "loading" | "success" | "error";
  result: PlanningCoachResponse | null;
  error: CoachErrorKind | null;
  /** Key of the suggestion or proposal being applied, if any. */
  applying: string | null;
  /** Keys of the current result that are applied (or were already true), with the message to show. */
  applied: Record<string, string>;
  applyError: { key: string; message: string | null; error: unknown } | null;
}

export interface PlanningCoachDeps {
  requestPlanning: (body: PlanningCoachRequest) => Promise<PlanningCoachResponse>;
  loadDay: (dayId: string) => Promise<DayResponse>;
  patchDay: (dayId: string, body: UpdateDayRequest) => Promise<DayResponse>;
  putSchedule: (dayId: string, body: SetDayScheduleRequest) => Promise<unknown>;
  createDay: (body: CreateDayRequest) => Promise<DayResponse>;
  confirm: (message: string) => boolean;
  timeZone: () => string;
}

export interface PlanningCoachFlow {
  getState: () => PlanningCoachState;
  subscribe: (listener: () => void) => () => void;
  request: (body: PlanningCoachRequest) => Promise<void>;
  applySuggestion: (suggestion: PlanningDaySuggestion, index: number) => Promise<void>;
  createProposal: (proposal: PlanningDayProposal, index: number) => Promise<void>;
}

export const INITIAL_PLANNING_STATE: PlanningCoachState = {
  status: "idle",
  result: null,
  error: null,
  applying: null,
  applied: {},
  applyError: null,
};

export function suggestionKey(suggestion: PlanningDaySuggestion, index: number): string {
  return `s${index}:${suggestion.type}:${suggestion.dayId}`;
}

export function proposalKey(index: number): string {
  return `p${index}`;
}

/** Only OPEN_DAY has nothing to apply; the user opens the Day and decides. */
export function isApplicableSuggestion(suggestion: PlanningDaySuggestion): boolean {
  switch (suggestion.type) {
    case "SET_DATE":
      return suggestion.targetDate !== null;
    case "SET_PRIORITY":
      return suggestion.priority !== null;
    case "SET_SCHEDULE":
      return suggestion.targetDate !== null && suggestion.startTime !== null;
    default:
      return false;
  }
}

/** What [적용] would change, in words. API enums never reach the user. */
export function describeSuggestionChange(suggestion: PlanningDaySuggestion): string {
  switch (suggestion.type) {
    case "SET_DATE":
      return suggestion.targetDate ? `${koreanShortDate(suggestion.targetDate)}로 날짜 정하기` : "";
    case "SET_PRIORITY":
      return suggestion.priority ? `우선순위 ${DAY_PRIORITY_LABEL[suggestion.priority]}` : "";
    case "SET_SCHEDULE":
      return suggestion.targetDate && suggestion.startTime
        ? `${koreanShortDate(suggestion.targetDate)} ${suggestion.startTime}${suggestion.endTime ? `~${suggestion.endTime}` : ""}로 시간 옮기기`
        : "";
    default:
      return "Day를 열어 직접 확인하기";
  }
}

export type PlanningApplyPlan =
  | { kind: "patch"; confirmMessage: string; body: UpdateDayRequest }
  | { kind: "schedule"; confirmMessage: string; body: SetDayScheduleRequest }
  | { kind: "already"; message: string }
  | { kind: "blocked"; message: string };

/** Decides from the freshly loaded Day whether and how a suggestion can be applied. */
export function planSuggestionApply(
  suggestion: PlanningDaySuggestion,
  day: DayResponse,
  timeZone: string,
): PlanningApplyPlan {
  if (day.status === "DONE" || day.status === "SKIPPED") {
    return { kind: "blocked", message: "이미 끝냈거나 건너뛴 Day라 적용하지 않았어요." };
  }
  if (suggestion.type === "SET_DATE" && suggestion.targetDate) {
    if (day.plannedDate === suggestion.targetDate) return { kind: "already", message: "이미 그 날짜에 있어요." };
    const timeNote = day.schedule ? " 시간 배치도 같은 시각으로 함께 옮겨져요." : "";
    return {
      kind: "patch",
      confirmMessage: `"${day.title}" Day의 날짜를 ${koreanShortDate(suggestion.targetDate)}로 정할까요?${timeNote}`,
      body: { plannedDate: suggestion.targetDate, version: day.version },
    };
  }
  if (suggestion.type === "SET_PRIORITY" && suggestion.priority) {
    if (day.priority === suggestion.priority) return { kind: "already", message: "이미 그 우선순위예요." };
    return {
      kind: "patch",
      confirmMessage: `"${day.title}" Day의 우선순위를 ${DAY_PRIORITY_LABEL[suggestion.priority]}으로 바꿀까요?`,
      body: { priority: suggestion.priority, version: day.version },
    };
  }
  if (suggestion.type === "SET_SCHEDULE" && suggestion.targetDate && suggestion.startTime) {
    const start = parseTimeInput(suggestion.startTime);
    // The Coach only moves an existing placement, keeping its length; without one there is nothing to move.
    if (day.schedule === null || start === null) {
      return { kind: "blocked", message: "지금은 시간 배치가 없는 Day라 적용하지 않았어요." };
    }
    const length = durationMinutes(day.schedule);
    if (start + length > 24 * 60) {
      return { kind: "blocked", message: "하루를 넘기는 시간이라 적용하지 않았어요." };
    }
    const body = scheduleRequest(suggestion.targetDate, start, length, day.schedule, timeZone);
    if (Date.parse(body.startAt) === Date.parse(day.schedule.startAt)) {
      return { kind: "already", message: "이미 그 시간에 있어요." };
    }
    return {
      kind: "schedule",
      confirmMessage: `"${day.title}" Day를 ${koreanShortDate(suggestion.targetDate)} ${suggestion.startTime}로 옮길까요? 길이(${length}분)는 그대로예요.`,
      body,
    };
  }
  return { kind: "blocked", message: "적용할 수 없는 제안이에요." };
}

/** POST /days body for a proposal: linked to the planned Goal, a plain ANYTIME Day the user can edit later. */
export function proposalRequest(proposal: PlanningDayProposal, goalId: string): CreateDayRequest {
  return {
    goalId,
    title: proposal.title,
    status: "NOT_STARTED",
    priority: proposal.priority,
    estimatedMinutes: 60,
    plannedDate: proposal.proposedDate,
    planningMode: "ANYTIME",
    coreDay: false,
  };
}

export function createPlanningCoachFlow(deps: PlanningCoachDeps): PlanningCoachFlow {
  let state = INITIAL_PLANNING_STATE;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<PlanningCoachState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const done = (key: string, message: string) =>
    set({ applying: null, applied: { ...state.applied, [key]: message } });

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async request(body) {
      if (state.status === "loading") return;
      set({ status: "loading", error: null, applyError: null });
      try {
        const result = await deps.requestPlanning(body);
        set({ status: "success", result, applied: {}, applying: null });
      } catch (error) {
        set({ status: "error", error: coachErrorKind(error) });
      }
    },
    async applySuggestion(suggestion, index) {
      if (state.applying !== null || !isApplicableSuggestion(suggestion)) return;
      const key = suggestionKey(suggestion, index);
      if (state.applied[key]) return;
      set({ applying: key, applyError: null });
      try {
        const plan = planSuggestionApply(suggestion, await deps.loadDay(suggestion.dayId), deps.timeZone());
        if (plan.kind === "blocked") {
          set({ applying: null, applyError: { key, message: plan.message, error: null } });
          return;
        }
        if (plan.kind === "already") {
          done(key, plan.message);
          return;
        }
        if (!deps.confirm(plan.confirmMessage)) {
          set({ applying: null });
          return;
        }
        if (plan.kind === "patch") await deps.patchDay(suggestion.dayId, plan.body);
        else await deps.putSchedule(suggestion.dayId, plan.body);
        done(key, "적용했어요.");
      } catch (error) {
        set({ applying: null, applyError: { key, message: null, error } });
      }
    },
    async createProposal(proposal, index) {
      const goalId = state.result?.goalId;
      const key = proposalKey(index);
      if (state.applying !== null || !goalId || state.applied[key]) return;
      const when = proposal.proposedDate ? `${koreanShortDate(proposal.proposedDate)}에 ` : "날짜 미정으로 ";
      if (!deps.confirm(`"${proposal.title}" Day를 ${when}새로 만들까요?`)) return;
      set({ applying: key, applyError: null });
      try {
        await deps.createDay(proposalRequest(proposal, goalId));
        done(key, "Day를 만들었어요.");
      } catch (error) {
        set({ applying: null, applyError: { key, message: null, error } });
      }
    },
  };
}

/**
 * Mondays the Planning Coach can look at for a PERIOD Goal: the week containing max(today, start), then the next one,
 * while they still overlap the period. Weeks are derived from the Goal range (no WEEK Goals are created).
 */
export function planningWeekStarts(
  goal: { startDate: string; endDate: string },
  today: string,
  startOfWeek: (date: string) => string,
  addDays: (date: string, days: number) => string,
): string[] {
  if (goal.endDate < today) return [];
  const first = startOfWeek(goal.startDate > today ? goal.startDate : today);
  return [first, addDays(first, 7)].filter((monday) => monday <= goal.endDate);
}
