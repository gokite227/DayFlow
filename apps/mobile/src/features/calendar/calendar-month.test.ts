import type { EventOccurrenceResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { dayFixture, goalFixture } from "../../test-fixtures";
import { periodGoalCalendarParams } from "../goals/period-goal-helpers";
import { OPEN_SCREEN_PARAM, eventsCalendarParams, goalCalendarParams, screenLink } from "../navigation/app-routes";
import {
  CALENDAR_VIEWS,
  columnPlacement,
  contentDays,
  dateOnlyItems,
  monthGridDates,
  parseCalendarContent,
  parseCalendarView,
  planDrop,
  resizedLength,
  shiftViewDate,
  unscheduledDays,
  viewDates,
  viewRangeLabel,
} from "./calendar-grid";
import { hasEventsInMonth, monthCellSummary, monthListEmptyMessage, monthListItems } from "./calendar-month";
import { CLOSED_DRAWER, drawerForContent, drawerReducer, isDrawerVisible, type DrawerEvent } from "./unscheduled-drawer";

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
const allDay = (eventId: string, startDate: string, endDateExclusive: string): EventOccurrenceResponse => ({
  ...timed(eventId, startDate, "00:00", "00:00"),
  allDay: true,
  startAt: null,
  endAt: null,
  startDate,
  endDateExclusive,
});

const schedule = (date: string, start: string, end: string) => ({
  id: `s-${start}`,
  dayId: "timed-day",
  startAt: `${date}T${start}:00+09:00`,
  endAt: `${date}T${end}:00+09:00`,
  timezone: "Asia/Seoul",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 0,
});

const timedDay = dayFixture({ id: "timed-day", plannedDate: "2026-09-17", schedule: schedule("2026-09-17", "09:00", "10:00") });
const dateOnlyDay = dayFixture({ id: "date-only-day", plannedDate: "2026-09-17" });
const unscheduledDay = dayFixture({ id: "unscheduled-day" });
const days = [timedDay, dateOnlyDay, unscheduledDay];
const dentist = timed("치과", "2026-09-17", "14:00", "15:00", exam);
const interview = timed("면접", "2026-09-17", "09:30", "10:30");
const birthday = allDay("생일", "2026-09-17", "2026-09-18");
const weekly = ["2026-09-10", "2026-09-17", "2026-09-24"].map((date) => timed("운동", date, "07:00", "08:00"));
const occurrences = [dentist, interview, birthday, ...weekly];

describe("Mobile Calendar views", () => {
  it("adds the month view and parses links", () => {
    expect(CALENDAR_VIEWS).toEqual(["day", "3day", "week", "month"]);
    expect(parseCalendarView("month")).toBe("month");
    expect(parseCalendarView(["week"])).toBe("week");
    expect(parseCalendarView("list")).toBe("day");
  });

  it("builds the month grid with the user's week start and moves by months", () => {
    const monday = viewDates("month", "2026-09-17", "monday");
    expect([monday[0], monday[monday.length - 1], monday.length]).toEqual(["2026-08-31", "2026-10-04", 35]);
    const sunday = monthGridDates("2026-09-17", "sunday");
    expect([sunday[0], sunday[sunday.length - 1]]).toEqual(["2026-08-30", "2026-10-03"]);
    expect(shiftViewDate("month", "2026-09-17", 1)).toBe("2026-10-17");
    expect(shiftViewDate("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftViewDate("month", "2026-01-15", -1)).toBe("2025-12-15");
    expect(viewRangeLabel("month", "2026-09-17", monday)).toBe("2026년 9월");
    expect(viewRangeLabel("day", "2026-09-17", ["2026-09-17"])).toBe("2026년 9월 17일");
  });
});

describe("전체 / 일정만", () => {
  it("defaults to 전체 and reads 일정만 from a link", () => {
    expect(parseCalendarContent(undefined)).toBe("all");
    expect(parseCalendarContent("events")).toBe("events");
    expect(parseCalendarContent("days")).toBe("all");
  });

  it("일정만 removes every Day from the grid, the date-only row and the drawer, but keeps Events", () => {
    const hidden = contentDays(days, "events");
    expect(hidden).toEqual([]);
    const column = columnPlacement("2026-09-17", hidden, occurrences);
    expect(column.days).toEqual([]);
    expect(column.events.map((event) => event.occurrence.eventId)).toEqual(["치과", "면접", "운동"]);
    // Overlap lanes are Events only: the 09:30 interview is no longer paired with the 09:00 Day.
    const interviewKey = column.events.find((event) => event.occurrence.eventId === "면접")!.key;
    expect(column.slots.get(interviewKey)?.lanes).toBe(1);
    expect(columnPlacement("2026-09-17", contentDays(days, "all"), occurrences).slots.get(interviewKey)?.lanes).toBe(2);
    expect(dateOnlyItems("2026-09-17", hidden, occurrences)).toEqual({ allDayEvents: [birthday], dateOnlyDays: [] });
    expect(unscheduledDays(hidden)).toEqual([]);
    expect(contentDays(days, "all")).toHaveLength(3);
  });

  it("the drawer closes and forgets a drag when switching to 일정만, and works again in 전체", () => {
    const run = (events: DrawerEvent[], from = CLOSED_DRAWER) => events.reduce(drawerReducer, from);
    const dragging = run([{ type: "open" }, { type: "dragStart", dayId: "timed-day", source: "drawer" }]);
    expect(dragging).toMatchObject({ draggedDayId: "timed-day", hiddenForDrag: true });
    const eventsMode = drawerForContent(dragging, "events");
    expect(eventsMode).toEqual(CLOSED_DRAWER);
    // The cancelled drag's end event arrives afterwards and changes nothing.
    expect(drawerReducer(eventsMode, { type: "dragEnd", outcome: "cancelled" })).toEqual(CLOSED_DRAWER);
    // Back to 전체: the drawer opens and closes normally.
    const back = drawerForContent(eventsMode, "all");
    const reopened = drawerReducer(back, { type: "open" });
    expect(isDrawerVisible(reopened)).toBe(true);
    expect(drawerReducer(reopened, { type: "close" })).toEqual(CLOSED_DRAWER);
    // 전체 never touches an open drawer.
    const open = run([{ type: "open" }]);
    expect(drawerForContent(open, "all")).toBe(open);
  });

  it("keeps the existing drag and resize rules for Days in 전체", () => {
    expect(planDrop(dateOnlyDay, { kind: "date", date: "2026-09-18" }, 0)).toEqual({ type: "moveDate", date: "2026-09-18" });
    expect(planDrop(timedDay, { kind: "unscheduled" }, 0)).toEqual({ type: "moveDate", date: null });
    expect(resizedLength(60, 24, 540)).toBe(90);
  });
});

describe("Month list and cells", () => {
  it("일정만: the selected date lists all-day, timed and recurring Events only", () => {
    const items = monthListItems("2026-09-17", contentDays(days, "events"), occurrences);
    expect(items.map((item) => (item.kind === "event" ? item.occurrence.eventId : item.day.id))).toEqual(["생일", "운동", "면접", "치과"]);
    expect(monthListItems("2026-09-24", [], occurrences).map((item) => item.kind === "event" && item.occurrence.eventId)).toEqual(["운동"]);
    expect(monthListEmptyMessage("events")).toBe("이 날짜에 일정이 없어요.");
  });

  it("전체: Days and Events together, date-only Days last, unscheduled Days never", () => {
    const items = monthListItems("2026-09-17", contentDays(days, "all"), occurrences);
    expect(items.map((item) => (item.kind === "event" ? `E:${item.occurrence.eventId}` : `D:${item.day.id}`))).toEqual([
      "E:생일",
      "E:운동",
      "D:timed-day",
      "E:면접",
      "E:치과",
      "D:date-only-day",
    ]);
    expect(monthListEmptyMessage("all")).toBe("이 날짜에 Day와 일정이 없어요.");
  });

  it("cells show Category dots and a Day count", () => {
    expect(monthCellSummary("2026-09-17", contentDays(days, "all"), occurrences)).toEqual({
      eventCount: 4,
      eventColors: expect.arrayContaining(["#cf3f5c"]),
      dayCount: 2,
    });
    expect(monthCellSummary("2026-09-17", contentDays(days, "events"), occurrences).dayCount).toBe(0);
    expect(monthCellSummary("2026-09-18", [], occurrences)).toEqual({ eventCount: 0, eventColors: [], dayCount: 0 });
    // A multi-day all-day Event marks every date it covers.
    const trip = allDay("여행", "2026-09-29", "2026-10-02");
    expect(["2026-09-29", "2026-10-01", "2026-10-02"].map((date) => monthCellSummary(date, [], [trip]).eventCount)).toEqual([1, 1, 0]);
    expect(hasEventsInMonth(occurrences, "2026-11-01", "2026-11-30")).toBe(false);
    expect(hasEventsInMonth(occurrences, "2026-09-01", "2026-09-30")).toBe(true);
  });
});

describe("Links into the Calendar", () => {
  it("Events → 캘린더에서 보기 opens the month with Events only, as a tab or a stacked screen", () => {
    const params = eventsCalendarParams("2026-09-17");
    expect(params).toEqual({ date: "2026-09-17", view: "month", content: "events" });
    expect(parseCalendarView(params.view)).toBe("month");
    expect(parseCalendarContent(params.content)).toBe("events");
    expect(screenLink("calendar", ["today", "days", "events", "goals"], params)).toEqual({
      method: "push",
      href: { pathname: "/open/[feature]", params: { ...params, [OPEN_SCREEN_PARAM]: "calendar" } },
    });
  });

  it("Goal Calendar links keep 전체 (no content parameter)", () => {
    const period = periodGoalCalendarParams({ startDate: "2026-09-21" });
    expect(parseCalendarContent((period as { content?: string }).content)).toBe("all");
    const week = goalCalendarParams(goalFixture({ type: "WEEK", startDate: "2026-09-14", endDate: "2026-09-20" }), "2026-09-17")!;
    expect("content" in week).toBe(false);
  });
});
