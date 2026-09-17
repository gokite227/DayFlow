import type {
  ReviewCoachRequest,
  ReviewCoachResponse,
  ReviewItemRequest,
  ReviewItemResponse,
  ReviewResponse,
  SaveReviewRequest,
} from "@dayflow/api-client";
import { coachErrorKind, type CoachErrorKind } from "../today/today-coach-flow";
import { toItemRequest } from "./review-goals";

/**
 * Review Coach flow without React (testable with plain calls).
 *
 * - The Coach is called only when the user taps, never twice at the same time.
 * - [초안 적용] only fills unsaved draft lines of the KPT editor. Nothing is sent to the API.
 * - When the editor already has content, the user chooses: append (default), replace, or cancel.
 *   "Replace" still changes nothing until the user saves; lines linked to a Day or a Goal are always kept.
 * - The drafts are saved only by an explicit [초안 저장] through the normal review PUT (expectedVersion).
 */

export type ReviewItemKind = ReviewItemResponse["kind"];

export const REVIEW_COACH_ERROR_COPY: Record<CoachErrorKind, string> = {
  unavailable: "AI 코치가 아직 연결되지 않았어요.",
  rate_limited: "AI 코치를 잠시 많이 사용했어요. 잠시 후 다시 시도해 주세요.",
  busy: "이미 회고 초안을 만들고 있어요. 잠시만 기다려 주세요.",
  failed: "지금은 회고 초안을 만들지 못했어요.",
};

/** One unsaved KPT line proposed by the Coach (and possibly edited by the user). */
export interface DraftLine {
  key: string;
  kind: ReviewItemKind;
  content: string;
}

export type ConflictChoice = "append" | "replace" | "cancel";

export interface ReviewCoachState {
  status: "idle" | "loading" | "success" | "error";
  result: ReviewCoachResponse | null;
  error: CoachErrorKind | null;
  drafts: DraftLine[];
  /** Saved line ids the user chose to replace; removed only when the drafts are saved. */
  replacingIds: string[];
  /** The editor already had content when [초안 적용] was pressed: waiting for append / replace / cancel. */
  conflict: boolean;
  saving: boolean;
  saveError: unknown;
}

export const INITIAL_REVIEW_COACH_STATE: ReviewCoachState = {
  status: "idle",
  result: null,
  error: null,
  drafts: [],
  replacingIds: [],
  conflict: false,
  saving: false,
  saveError: null,
};

/** Maximum length of a review line (same as the API). */
const MAX_CONTENT = 1000;

const normalize = (text: string) => text.replace(/[\s\p{P}]/gu, "").toLowerCase();

/** Lines linked to a Day or a Goal are never replaced by a draft: the link is the user's work. */
export function keptOnReplace(item: ReviewItemResponse): boolean {
  return item.convertedDayId !== null || item.goalId !== null || item.targetGoalId !== null;
}

export function hasEditorContent(review: ReviewResponse | null, drafts: readonly DraftLine[], typing: boolean): boolean {
  return (review?.items.length ?? 0) > 0 || drafts.length > 0 || typing;
}

let nextKey = 0;

/** KEEP/PROBLEM/TRY drafts as separate editor lines (never one long text). */
export function draftLinesFrom(result: ReviewCoachResponse): DraftLine[] {
  const lines: [ReviewItemKind, ReviewCoachResponse["keep"]][] = [
    ["KEEP", result.keep],
    ["PROBLEM", result.problem],
    ["TRY", result.try],
  ];
  return lines.flatMap(([kind, items]) =>
    items.map((item) => ({ key: `draft-${++nextKey}`, kind, content: item.text })),
  );
}

/** The PUT body that saves the drafts: saved lines (minus replaced ones) followed by the non-empty drafts. */
export function draftSaveRequest(
  review: ReviewResponse | null,
  drafts: readonly DraftLine[],
  replacingIds: readonly string[],
): SaveReviewRequest {
  const replacing = new Set(replacingIds);
  const saved = (review?.items ?? []).filter((item) => !replacing.has(item.id) || keptOnReplace(item));
  const added: ReviewItemRequest[] = drafts
    .map((line) => ({ ...line, content: line.content.trim().slice(0, MAX_CONTENT) }))
    .filter((line) => line.content !== "")
    .map((line) => ({ id: null, kind: line.kind, content: line.content, goalId: null, targetGoalId: null }));
  return {
    rating: review?.rating ?? null,
    completed: review?.completed ?? false,
    items: [...saved.map(toItemRequest), ...added],
    expectedVersion: review?.version ?? null,
  };
}

/** How many saved lines a replace would remove when saved. */
export function replacedCount(review: ReviewResponse | null, replacingIds: readonly string[]): number {
  const replacing = new Set(replacingIds);
  return (review?.items ?? []).filter((item) => replacing.has(item.id) && !keptOnReplace(item)).length;
}

export interface ReviewCoachDeps {
  requestDraft: (body: ReviewCoachRequest) => Promise<ReviewCoachResponse>;
}

export interface ReviewCoachFlow {
  getState: () => ReviewCoachState;
  subscribe: (listener: () => void) => () => void;
  request: (body: ReviewCoachRequest) => Promise<void>;
  /** [초안 적용]: fills the drafts, or asks first when the editor already has content. Never saves. */
  applyDraft: (review: ReviewResponse | null, typing: boolean) => void;
  resolveConflict: (choice: ConflictChoice, review: ReviewResponse | null) => void;
  editDraft: (key: string, content: string) => void;
  removeDraft: (key: string) => void;
  discardDrafts: () => void;
  /** [초안 저장]: the only step that writes, through the review PUT the editor already uses. */
  saveDrafts: (review: ReviewResponse | null, save: (body: SaveReviewRequest) => Promise<ReviewResponse>) => Promise<void>;
}

export function createReviewCoachFlow(deps: ReviewCoachDeps): ReviewCoachFlow {
  let state = INITIAL_REVIEW_COACH_STATE;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<ReviewCoachState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const withoutDuplicates = (lines: DraftLine[], review: ReviewResponse | null, existing: DraftLine[]) => {
    const seen = new Set([...(review?.items ?? []).map((item) => normalize(item.content)), ...existing.map((line) => normalize(line.content))]);
    return lines.filter((line) => {
      const key = normalize(line.content);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async request(body) {
      if (state.status === "loading") return;
      set({ status: "loading", error: null, conflict: false });
      try {
        const result = await deps.requestDraft(body);
        set({ status: "success", result });
      } catch (error) {
        set({ status: "error", error: coachErrorKind(error) });
      }
    },
    applyDraft(review, typing) {
      if (!state.result) return;
      if (hasEditorContent(review, state.drafts, typing)) {
        set({ conflict: true });
        return;
      }
      set({ drafts: draftLinesFrom(state.result), replacingIds: [], conflict: false, saveError: null });
    },
    resolveConflict(choice, review) {
      if (!state.result || !state.conflict) return;
      if (choice === "cancel") {
        set({ conflict: false });
        return;
      }
      const lines = draftLinesFrom(state.result);
      if (choice === "append") {
        set({ drafts: [...state.drafts, ...withoutDuplicates(lines, review, state.drafts)], conflict: false, saveError: null });
        return;
      }
      set({
        drafts: withoutDuplicates(lines, null, []),
        replacingIds: (review?.items ?? []).map((item) => item.id),
        conflict: false,
        saveError: null,
      });
    },
    editDraft(key, content) {
      set({ drafts: state.drafts.map((line) => (line.key === key ? { ...line, content } : line)) });
    },
    removeDraft(key) {
      set({ drafts: state.drafts.filter((line) => line.key !== key) });
    },
    discardDrafts() {
      set({ drafts: [], replacingIds: [], saveError: null });
    },
    async saveDrafts(review, save) {
      if (state.saving || (state.drafts.length === 0 && state.replacingIds.length === 0)) return;
      set({ saving: true, saveError: null });
      try {
        await save(draftSaveRequest(review, state.drafts, state.replacingIds));
        set({ saving: false, drafts: [], replacingIds: [] });
      } catch (error) {
        set({ saving: false, saveError: error });
      }
    },
  };
}
