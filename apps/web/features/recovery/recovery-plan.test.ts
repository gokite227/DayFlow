import type {
  CarryOverPreviewResponse,
  DayResponse,
  GoalResponse,
  RecoveryDayResponse,
  RecoveryEventItemResponse,
} from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import {
  RECOVERY_ACTIONS,
  RECOVERY_ACTION_LABEL,
  SKIP_THIS_TIME,
  batchDays,
  defaultCarryOverDate,
  draftProblem,
  groupRecoveryDays,
  hasChangesToApply,
  historyDetail,
  initialDraft,
  isRecoveryAction,
  moveRange,
  overridesToChoices,
  previewLines,
  skippedDays,
  summarizeCarryOver,
  toApplyCarryOverRequest,
  toApplyRequest,
  toLevelChoices,
  type RecoveryDraft,
} from "./recovery-plan";

const base: DayResponse = {
  id: "a",
  goalId: "week",
  title: "Write API",
  status: "NOT_STARTED",
  priority: "LOW",
  tags: [],
  estimatedMinutes: 90,
  plannedDate: "2026-09-14",
  planningMode: "ANYTIME",
  carriedFromDayId: null,
  coreDay: true,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 3,
  schedule: null,
};
const week = { startDate: "2026-09-14", endDate: "2026-09-20" };
const today = "2026-09-16";

const goal = (id: string, type: GoalResponse["type"], startDate: string, endDate: string, version = 0): GoalResponse => ({
  id,
  parentGoalId: null,
  type,
  title: `${type} plan`,
  why: "",
  startDate,
  endDate,
  priority: 1,
  progressPolicy: "AUTO",
  continuedFromGoalId: null,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version,
});

describe("REC-001 recovery plan", () => {
  it("offers the five decisions in a gentle order", () => {
    expect(RECOVERY_ACTIONS).toEqual(["KEEP", "REDUCE", "MOVE", "CARRY_OVER", "DROP"]);
    expect(RECOVERY_ACTION_LABEL.CARRY_OVER).toBe("다음 계획으로 이어가기");
    expect(RECOVERY_ACTION_LABEL.DROP).toBe("이번에는 내려놓기");
  });

  it("starts every Day as KEEP with a halved estimate ready for REDUCE", () => {
    expect(initialDraft(base, "2026-09-16")).toEqual({ action: "KEEP", estimatedMinutes: 45, title: "Write API", plannedDate: "2026-09-16" });
    expect(initialDraft({ ...base, estimatedMinutes: 1 }, null)).toMatchObject({ estimatedMinutes: 1, plannedDate: "" });
  });

  it("allows MOVE of a Goal Day only from today to the end of its WEEK Goal", () => {
    expect(moveRange(week, today)).toEqual({ min: "2026-09-16", max: "2026-09-20" });
    expect(moveRange({ startDate: "2026-09-21", endDate: "2026-09-27" }, today)).toEqual({ min: "2026-09-21", max: "2026-09-27" });
    // The week is over: another week is a Carry Over, not a MOVE.
    expect(moveRange({ startDate: "2026-09-07", endDate: "2026-09-13" }, today)).toBeNull();
  });

  it("DAY-001 lets a Day without a Goal move to today or any later date", () => {
    const range = moveRange(undefined, today);

    expect(range).toEqual({ min: today, max: null });
    const draft = (plannedDate: string): RecoveryDraft => ({ ...initialDraft(base, today), action: "MOVE", plannedDate });
    expect(draftProblem(base, draft("2026-12-31"), range)).toBeNull();
    expect(draftProblem(base, draft("2026-09-15"), range)).toBe("moveDate");
  });

  it("rejects a REDUCE that is not smaller, a blank title and a MOVE outside the range", () => {
    const range = moveRange(week, today);
    const draft = (change: Partial<RecoveryDraft>): RecoveryDraft => ({ ...initialDraft(base, today), ...change });
    expect(draftProblem(base, draft({ action: "REDUCE", estimatedMinutes: 90 }), range)).toBe("reduceMinutes");
    expect(draftProblem(base, draft({ action: "REDUCE", estimatedMinutes: Number.NaN }), range)).toBe("reduceMinutes");
    expect(draftProblem(base, draft({ action: "REDUCE", title: "  " }), range)).toBe("reduceTitle");
    expect(draftProblem(base, draft({ action: "MOVE", plannedDate: "2026-09-15" }), range)).toBe("moveDate");
    expect(draftProblem(base, draft({ action: "MOVE", plannedDate: "2026-09-18" }), null)).toBe("moveDate");
    expect(draftProblem(base, draft({ action: "MOVE", plannedDate: "2026-09-21" }), range)).toBe("moveDate");
    expect(draftProblem(base, draft({ action: "MOVE", plannedDate: "2026-09-18" }), range)).toBeNull();
    expect(draftProblem(base, draft({ action: "DROP" }), null)).toBeNull();
  });

  it("previews non-KEEP changes, leaves Carry Over out and sends every other decision with its version", () => {
    const days = [
      base,
      { ...base, id: "b", title: "Docs" },
      { ...base, id: "c", title: "Tests" },
      { ...base, id: "d", title: "Keep" },
      { ...base, id: "e", title: "Next month" },
    ];
    const drafts: Record<string, RecoveryDraft> = {
      a: { action: "REDUCE", estimatedMinutes: 30, title: "Write API skeleton", plannedDate: "" },
      b: { action: "MOVE", estimatedMinutes: 45, title: "Docs", plannedDate: "2026-09-17" },
      c: { action: "DROP", estimatedMinutes: 45, title: "Tests", plannedDate: "" },
      e: { action: "CARRY_OVER", estimatedMinutes: 45, title: "Next month", plannedDate: "" },
    };

    expect(batchDays(days, drafts).map((day) => day.id)).toEqual(["a", "b", "c", "d"]);
    expect(previewLines(days, drafts).map((line) => line.detail)).toEqual([
      '90분 → 30분 · "Write API skeleton"',
      "9월 17일 (목)로 옮기기 (시간 배치 없이)",
      "이번 계획에서 내려놓기 (기록은 남아요)",
    ]);
    expect(toApplyRequest(today, days, drafts)).toEqual({
      localDate: today,
      decisions: [
        { dayId: "a", version: 3, action: "REDUCE", estimatedMinutes: 30, title: "Write API skeleton" },
        { dayId: "b", version: 3, action: "MOVE", plannedDate: "2026-09-17" },
        { dayId: "c", version: 3, action: "DROP" },
        { dayId: "d", version: 3, action: "KEEP" },
      ],
    });
  });
});

describe("REC-001 이번엔 건너뛰기", () => {
  const days = [base, { ...base, id: "b", title: "Docs" }, { ...base, id: "c", title: "Later" }];
  const draft = (action: RecoveryDraft["action"], change: Partial<RecoveryDraft> = {}): RecoveryDraft => ({
    ...initialDraft(base, today),
    action,
    ...change,
  });

  it("is a UI choice, not one of the five Recovery actions", () => {
    expect(RECOVERY_ACTIONS).not.toContain(SKIP_THIS_TIME);
    expect(isRecoveryAction(SKIP_THIS_TIME)).toBe(false);
    expect(draftProblem(base, draft(SKIP_THIS_TIME), null)).toBeNull();
  });

  it("leaves the skipped Day out of the apply payload while the others are applied", () => {
    const drafts = { a: draft(SKIP_THIS_TIME), b: draft("DROP"), c: draft("MOVE", { plannedDate: "2026-09-18" }) };

    expect(toApplyRequest(today, days, drafts)).toEqual({
      localDate: today,
      decisions: [
        { dayId: "b", version: 3, action: "DROP" },
        { dayId: "c", version: 3, action: "MOVE", plannedDate: "2026-09-18" },
      ],
    });
    expect(skippedDays(days, drafts).map((day) => day.id)).toEqual(["a"]);
    // The preview lists only real changes; the skipped Day is shown separately as "변경 없음".
    expect(previewLines(days, drafts).map((line) => line.dayId)).toEqual(["b", "c"]);
    expect(hasChangesToApply(days, drafts)).toBe(true);
  });

  it("has nothing to send when every Day is skipped or carried over separately", () => {
    const allSkipped = { a: draft(SKIP_THIS_TIME), b: draft(SKIP_THIS_TIME), c: draft("CARRY_OVER") };

    expect(hasChangesToApply(days, allSkipped)).toBe(false);
    expect(toApplyRequest(today, days, allSkipped).decisions).toEqual([]);
  });
});

const year = goal("year", "YEAR", "2026-01-01", "2026-12-31");
const q3 = goal("q3", "QUARTER", "2026-07-01", "2026-09-30", 2);
const sep = goal("sep", "MONTH", "2026-09-01", "2026-09-30", 1);
const w5 = goal("w5", "WEEK", "2026-09-28", "2026-09-30");
const q4 = goal("q4", "QUARTER", "2026-10-01", "2026-12-31", 4);

const level = (
  type: GoalResponse["type"],
  action: CarryOverPreviewResponse["levels"][number]["action"],
  extra: Partial<CarryOverPreviewResponse["levels"][number]> = {},
): CarryOverPreviewResponse["levels"][number] => ({
  type,
  startDate: "2026-10-01",
  endDate: "2026-12-31",
  sourceGoal: null,
  action,
  goal: null,
  candidates: [],
  newTitle: null,
  ...extra,
});

const planPreview: CarryOverPreviewResponse = {
  targetDate: "2026-10-08",
  mode: "WITH_PLAN",
  sourceDay: { ...base, plannedDate: "2026-09-29", goalId: "w5" },
  sourceGoalPath: [year, q3, sep, w5],
  targetWeekGoals: [],
  targetWeekGoalId: null,
  levels: [
    level("YEAR", "KEEP_SOURCE", { goal: year }),
    level("QUARTER", "REUSE", { goal: q4, candidates: [q4], sourceGoal: q3 }),
    level("MONTH", "CREATE", { sourceGoal: sep, newTitle: "MONTH plan" }),
    level("WEEK", "CREATE", { sourceGoal: w5, newTitle: "WEEK plan" }),
  ],
  days: [
    { day: { ...base, id: "a", version: 5 }, selected: true, selectable: true, exclusion: null },
    { day: { ...base, id: "b", version: 1 }, selected: true, selectable: true, exclusion: null },
    { day: { ...base, id: "c" }, selected: false, selectable: true, exclusion: null },
    { day: { ...base, id: "d", status: "DONE" }, selected: false, selectable: false, exclusion: "FINISHED" },
  ],
  ready: true,
};

describe("REC-003/REC-004 Carry Over", () => {
  it("suggests the day after the source week, never before today", () => {
    expect(defaultCarryOverDate(week, "2026-09-16")).toBe("2026-09-21");
    expect(defaultCarryOverDate(week, "2026-09-25")).toBe("2026-09-25");
    expect(defaultCarryOverDate(undefined, "2026-09-16")).toBe("2026-09-17");
  });

  it("turns the previewed levels into explicit choices so apply does what the preview showed", () => {
    expect(toLevelChoices(planPreview.levels, {})).toEqual([
      { type: "QUARTER", goalId: "q4", create: false },
      { type: "MONTH", goalId: null, create: true },
      { type: "WEEK", goalId: null, create: true },
    ]);
    // A level still waiting for a choice sends nothing, so the server keeps asking.
    expect(toLevelChoices([level("WEEK", "CHOOSE", { candidates: [w5, q4] })], {})).toEqual([]);
    expect(overridesToChoices({ QUARTER: "new", WEEK: "w5" })).toEqual([
      { type: "QUARTER", goalId: null, create: true },
      { type: "WEEK", goalId: "w5", create: false },
    ]);
  });

  it("builds the apply body with the selected Days and the Goals it relies on, at their previewed versions", () => {
    expect(toApplyCarryOverRequest(today, planPreview)).toEqual({
      localDate: today,
      sourceDayId: "a",
      targetDate: "2026-10-08",
      mode: "WITH_PLAN",
      targetWeekGoalId: null,
      levels: [
        { type: "QUARTER", goalId: "q4", create: false },
        { type: "MONTH", goalId: null, create: true },
        { type: "WEEK", goalId: null, create: true },
      ],
      days: [
        { id: "a", version: 5 },
        { id: "b", version: 1 },
      ],
      goals: [
        { id: "year", version: 0 },
        { id: "q3", version: 2 },
        { id: "sep", version: 1 },
        { id: "w5", version: 0 },
        { id: "q4", version: 4 },
      ],
    });

    const dayOnly = { ...planPreview, mode: "DAY_ONLY" as const, targetWeekGoalId: "w-oct-2", levels: [] };
    expect(toApplyCarryOverRequest(today, dayOnly)).toMatchObject({ targetWeekGoalId: "w-oct-2", levels: [], goals: [] });
  });

  it("summarizes what will be created and reused", () => {
    const summary = summarizeCarryOver(planPreview);
    expect(summary.newGoals.map((entry) => entry.type)).toEqual(["MONTH", "WEEK"]);
    expect(summary.reusedGoals.map((entry) => entry.type)).toEqual(["YEAR", "QUARTER"]);
    expect(summary.days.map((day) => day.id)).toEqual(["a", "b"]);
    expect(summarizeCarryOver({ ...planPreview, mode: "WITHOUT_GOAL", levels: [] }).withoutGoal).toBe(true);
  });
});

const recoveryDay = (date: string): RecoveryDayResponse => ({
  id: date,
  date,
  returnDate: null,
  note: "",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 0,
});

describe("REC-002 Recovery Day management", () => {
  it("groups today, upcoming (nearest first) and past (latest first)", () => {
    const groups = groupRecoveryDays(
      [recoveryDay("2026-09-01"), recoveryDay("2026-10-02"), recoveryDay(today), recoveryDay("2026-09-20"), recoveryDay("2026-09-10")],
      today,
    );
    expect(groups.today.map((day) => day.date)).toEqual([today]);
    expect(groups.upcoming.map((day) => day.date)).toEqual(["2026-09-20", "2026-10-02"]);
    expect(groups.past.map((day) => day.date)).toEqual(["2026-09-10", "2026-09-01"]);
  });
});

describe("REC-005 history", () => {
  const item = (change: Partial<RecoveryEventItemResponse>): RecoveryEventItemResponse => ({
    id: "i",
    dayId: "a",
    dayTitle: "Portfolio",
    action: "KEEP",
    previousStatus: "NOT_STARTED",
    newStatus: "NOT_STARTED",
    previousPlannedDate: "2026-09-29",
    newPlannedDate: "2026-09-29",
    previousEstimatedMinutes: 60,
    newEstimatedMinutes: 60,
    destinationDayId: null,
    destinationDayTitle: null,
    destinationPlannedDate: null,
    ...change,
  });

  it("describes each decision with its source and destination", () => {
    expect(historyDetail(item({ action: "MOVE", newPlannedDate: "2026-09-30" }))).toBe("9월 29일 (화) → 9월 30일 (수)");
    expect(historyDetail(item({ action: "REDUCE", newEstimatedMinutes: 30 }))).toBe("9월 29일 (화) · 60분 → 30분");
    expect(
      historyDetail(item({ action: "CARRY_OVER", destinationDayId: "b", destinationDayTitle: "Portfolio", destinationPlannedDate: "2026-10-08" })),
    ).toBe("9월 29일 (화) 계획 → 10월 8일 (목) 새 계획 · Portfolio");
    expect(historyDetail(item({ action: "DROP", newStatus: "SKIPPED" }))).toBe("9월 29일 (화) · 이번에는 내려놓음");
  });
});
