import type { DayResponse, EventOccurrenceResponse } from "@dayflow/api-client";
import { layoutOverlaps } from "@dayflow/domain";
import { describe, expect, it } from "vitest";
import { eventsCalendarHref } from "../events/event-values";
import { goalCalendarHref } from "../goals/goal-views";
import { periodGoalCalendarHref } from "../goals/period-goal-values";
import {
  MONTH_CELL_LIMIT,
  calendarContentItems,
  categoryFilterFromParam,
  hasEventsInMonth,
  monthCellItems,
  monthItemsOn,
} from "./calendar-content";
import { parseCalendarViewState } from "./calendar-range";

const day = (id: string, overrides: Partial<DayResponse>): DayResponse => ({
  id,
  goalId: null,
  title: id,
  status: "NOT_STARTED",
  priority: "NONE",
  tags: [],
  estimatedMinutes: 60,
  plannedDate: null,
  planningMode: "ANYTIME",
  carriedFromDayId: null,
  coreDay: false,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 0,
  schedule: null,
  ...overrides,
});

const schedule = (date: string, start: string, end: string) => ({
  id: `s-${date}-${start}`,
  dayId: "d",
  startAt: `${date}T${start}:00+09:00`,
  endAt: `${date}T${end}:00+09:00`,
  timezone: "Asia/Seoul",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 0,
});

const exam = { id: "c-exam", name: "시험", color: "#cf3f5c" };
const timed = (eventId: string, date: string, start: string, end: string, category: typeof exam | null = null): EventOccurrenceResponse => ({
  eventId,
  eventVersion: 0,
  title: eventId,
  category,
  allDay: false,
  startAt: `${date}T${start}:00+09:00`,
  endAt: `${date}T${end}:00+09:00`,
  startDate: null,
  endDateExclusive: null,
  timezone: "Asia/Seoul",
  location: null,
  recurrence: "NONE",
  linkedGoalId: null,
});
const allDay = (eventId: string, startDate: string, endDateExclusive: string, category: typeof exam | null = null): EventOccurrenceResponse => ({
  ...timed(eventId, startDate, "00:00", "00:00", category),
  allDay: true,
  startAt: null,
  endAt: null,
  startDate,
  endDateExclusive,
});

const timedDay = day("timed-day", { plannedDate: "2026-09-17", schedule: schedule("2026-09-17", "09:00", "10:00") });
const dateOnlyDay = day("date-only-day", { plannedDate: "2026-09-17" });
const unscheduledDay = day("unscheduled-day", {});
const dentist = timed("치과", "2026-09-17", "14:00", "15:00", exam);
const interview = timed("면접", "2026-09-17", "09:30", "10:30");
const birthday = allDay("생일", "2026-09-17", "2026-09-18");
// A weekly recurring Event is sent as one occurrence per week.
const weekly = [timed("운동", "2026-09-10", "07:00", "08:00"), timed("운동", "2026-09-17", "07:00", "08:00"), timed("운동", "2026-09-24", "07:00", "08:00")];

const allDays = [timedDay, dateOnlyDay, unscheduledDay];
const allEvents = [dentist, interview, birthday, ...weekly];

describe("Calendar content: 전체 / 일정만", () => {
  it("전체 keeps every Day and Event", () => {
    const shown = calendarContentItems(allDays, allEvents, "all", null);
    expect(shown.days).toHaveLength(3);
    expect(shown.occurrences).toHaveLength(allEvents.length);
  });

  it("일정만 removes timed, date-only and unscheduled Days from the data, keeping all Events", () => {
    const shown = calendarContentItems(allDays, allEvents, "events", null);
    expect(shown.days).toEqual([]);
    expect(shown.occurrences.map((occurrence) => occurrence.eventId)).toEqual(["치과", "면접", "생일", "운동", "운동", "운동"]);
  });

  it("일정만 overlap is computed between Events only (no hidden Day takes a lane)", () => {
    // In 전체 the 09:00 Day and the 09:30 Event share two lanes; with Days removed the Event is alone.
    const lanesFor = (days: DayResponse[]) =>
      layoutOverlaps([
        ...days.flatMap((entry) => (entry.schedule ? [{ key: `day:${entry.id}`, start: 540, end: 600 }] : [])),
        { key: "event:면접", start: 570, end: 630 },
      ]).get("event:면접")?.lanes;
    expect(lanesFor(calendarContentItems(allDays, allEvents, "all", null).days)).toBe(2);
    expect(lanesFor(calendarContentItems(allDays, allEvents, "events", null).days)).toBe(1);
  });

  it("the Category filter narrows Events in both modes and never hides Days", () => {
    expect(categoryFilterFromParam(null)).toBe("ALL");
    expect(categoryFilterFromParam("UNCATEGORIZED")).toBe("UNCATEGORIZED");
    expect(categoryFilterFromParam("c-exam")).toEqual({ categoryId: "c-exam" });
    const eventsExam = calendarContentItems(allDays, allEvents, "events", "c-exam");
    expect(eventsExam.days).toEqual([]);
    expect(eventsExam.occurrences.map((occurrence) => occurrence.eventId)).toEqual(["치과"]);
    const allExam = calendarContentItems(allDays, allEvents, "all", "c-exam");
    expect(allExam.days).toHaveLength(3);
    expect(allExam.occurrences.map((occurrence) => occurrence.eventId)).toEqual(["치과"]);
    expect(calendarContentItems(allDays, allEvents, "events", "UNCATEGORIZED").occurrences).toHaveLength(5);
  });
});

describe("Month cells", () => {
  it("일정만: all-day first, then timed Events by time, including recurring occurrences", () => {
    const { occurrences, days } = calendarContentItems(allDays, allEvents, "events", null);
    const items = monthItemsOn("2026-09-17", days, occurrences);
    expect(items.map((item) => [item.kind, item.kind === "event" ? item.occurrence.eventId : item.day.id, item.timeLabel])).toEqual([
      ["event", "생일", null],
      ["event", "운동", "07:00"],
      ["event", "면접", "09:30"],
      ["event", "치과", "14:00"],
    ]);
    // The recurring Event also appears on its other weeks.
    expect(monthItemsOn("2026-09-24", days, occurrences).map((item) => item.timeLabel)).toEqual(["07:00"]);
  });

  it("전체: Days and Events together, date-only Days after timed items, no unscheduled Day", () => {
    const { occurrences, days } = calendarContentItems(allDays, allEvents, "all", null);
    const items = monthItemsOn("2026-09-17", days, occurrences);
    expect(items.map((item) => (item.kind === "event" ? `E:${item.occurrence.eventId}` : `D:${item.day.id}`))).toEqual([
      "E:생일",
      "E:운동",
      "D:timed-day",
      "E:면접",
      "E:치과",
      "D:date-only-day",
    ]);
  });

  it("shows an all-day Event on every date it covers", () => {
    const trip = allDay("여행", "2026-09-29", "2026-10-02");
    expect(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"].map((date) => monthItemsOn(date, [], [trip]).length)).toEqual([
      0, 1, 1, 1, 0,
    ]);
  });

  it("limits a crowded cell and counts the rest for 더보기", () => {
    const items = monthItemsOn("2026-09-17", allDays, allEvents);
    const { shown, hidden } = monthCellItems(items);
    expect(shown).toHaveLength(MONTH_CELL_LIMIT);
    expect(hidden).toBe(items.length - MONTH_CELL_LIMIT);
    expect(monthCellItems(items.slice(0, 2))).toMatchObject({ hidden: 0 });
  });

  it("knows when a month has no Events (grid still shown, small note)", () => {
    expect(hasEventsInMonth(allEvents, "2026-09-01", "2026-09-30")).toBe(true);
    expect(hasEventsInMonth(allEvents, "2026-11-01", "2026-11-30")).toBe(false);
    // An all-day Event starting in the previous month still counts.
    expect(hasEventsInMonth([allDay("캠프", "2026-10-30", "2026-11-02")], "2026-11-01", "2026-11-30")).toBe(true);
  });
});

describe("Calendar links from other screens", () => {
  it("Events → 캘린더에서 보기 opens the month with Events only", () => {
    const href = eventsCalendarHref("2026-09-17");
    expect(href).toBe("/calendar?view=month&content=events");
    expect(parseCalendarViewState(new URLSearchParams(href.split("?")[1]), "2026-09-17")).toEqual({
      view: "month",
      date: "2026-09-17",
      content: "events",
      category: null,
    });
  });

  it("Goal Calendar links keep showing Days (전체)", () => {
    const period = periodGoalCalendarHref({ startDate: "2026-09-21" });
    expect(parseCalendarViewState(new URLSearchParams(period.split("?")[1]), "2026-09-17")).toMatchObject({ content: "all", date: "2026-09-21" });
    const week = goalCalendarHref({ type: "WEEK", startDate: "2026-09-14", endDate: "2026-09-20" }, "2026-09-17")!;
    expect(parseCalendarViewState(new URLSearchParams(week.split("?")[1]), "2026-09-17")).toMatchObject({ content: "all" });
  });
});
