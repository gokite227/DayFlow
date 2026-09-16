import type { EventOccurrenceResponse, EventResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import {
  categoryColors,
  categoryLabel,
  describeEventExtras,
  describeOccurrenceTime,
  eventFormProblem,
  eventToValues,
  findOccurrence,
  matchesCategoryFilter,
  newEventValues,
  nextOccurrences,
  reminderLabel,
  toCreateEventRequest,
  toUpdateEventRequest,
  toggleReminder,
  zonedDateTime,
} from "./event-display";

const interview: EventResponse = {
  id: "e1",
  title: "면접",
  category: { id: "c1", name: "면접", color: "#3a78b8" },
  allDay: false,
  startAt: "2026-09-20T14:00:00+09:00",
  endAt: "2026-09-20T15:00:00+09:00",
  startDate: null,
  endDateExclusive: null,
  timezone: "Asia/Seoul",
  location: "강남",
  notes: null,
  recurrence: "WEEKLY",
  reminders: [60, 10],
  linkedGoalId: null,
  createdAt: "",
  updatedAt: "",
  version: 2,
};

const occurrence = (overrides: Partial<EventOccurrenceResponse>): EventOccurrenceResponse => ({
  eventId: "e1",
  eventVersion: 0,
  title: "생일",
  category: null,
  allDay: true,
  startAt: null,
  endAt: null,
  startDate: "2026-10-03",
  endDateExclusive: "2026-10-04",
  timezone: "Asia/Seoul",
  location: null,
  recurrence: "YEARLY",
  linkedGoalId: null,
  ...overrides,
});

describe("Event display helpers", () => {
  it("describes timed, all-day and multi-day occurrences in Korean", () => {
    expect(describeOccurrenceTime(interview)).toBe("9월 20일 (일) · 오후 2:00–오후 3:00");
    expect(describeOccurrenceTime(occurrence({}))).toBe("10월 3일 (토) · 하루 종일");
    expect(describeOccurrenceTime(occurrence({ endDateExclusive: "2026-10-06" }))).toBe("10월 3일 (토) ~ 10월 5일 (월) · 하루 종일");
  });

  it("shows Category or 미분류 with neutral colors", () => {
    expect(categoryLabel(interview.category)).toBe("면접");
    expect(categoryColors(interview.category)).toEqual({ color: "#3a78b8", soft: "#e8f1fa" });
    expect(categoryLabel(null)).toBe("미분류");
    expect(categoryColors(null)).toEqual({ color: "#9a939c", soft: "#f3f1f3" });
    expect(matchesCategoryFilter(null, "UNCATEGORIZED")).toBe(true);
    expect(matchesCategoryFilter(interview.category, { categoryId: "c1" })).toBe(true);
  });

  it("summarizes recurrence and reminders", () => {
    expect(describeEventExtras(interview)).toBe("매주 · 알림 10분 전, 1시간 전");
    expect(describeEventExtras({ recurrence: "NONE", reminders: [] })).toBeNull();
    expect([0, 10, 90, 1440].map(reminderLabel)).toEqual(["정각", "10분 전", "90분 전", "1일 전"]);
    expect(toggleReminder([60], 10)).toEqual([10, 60]);
    expect(toggleReminder([10, 60], 10)).toEqual([60]);
  });

  it("keeps one row per Event and finds the tapped occurrence", () => {
    const list = [occurrence({}), occurrence({ eventId: "e2" }), occurrence({ startDate: "2027-10-03" })];
    expect(nextOccurrences(list).map((item) => item.eventId)).toEqual(["e1", "e2"]);
    expect(findOccurrence(list, "e1", "2027-10-03")?.startDate).toBe("2027-10-03");
    const timed = occurrence({ allDay: false, startDate: null, endDateExclusive: null, startAt: "2026-09-20T14:00:00+09:00", endAt: "2026-09-20T15:00:00+09:00" });
    expect(findOccurrence([timed], "e1", "2026-09-20T05:00:00Z")).toBe(timed);
  });

  it("builds requests in the Event timezone and round-trips the form", () => {
    expect(zonedDateTime("2026-01-15", "09:00", "America/New_York")).toBe("2026-01-15T09:00:00-05:00");
    const values = eventToValues(interview);
    expect(values).toMatchObject({ categoryId: "c1", startTime: "14:00", reminders: [10, 60] });
    expect(toUpdateEventRequest(values, interview.version)).toMatchObject({
      categoryId: "c1",
      startAt: "2026-09-20T14:00:00+09:00",
      endAt: "2026-09-20T15:00:00+09:00",
      reminders: [10, 60],
      version: 2,
    });
    const allDay = toCreateEventRequest({ ...newEventValues("2026-09-20", "Asia/Seoul"), title: "마감", allDay: true, endDate: "2026-09-21" });
    expect(allDay).toMatchObject({ allDay: true, startDate: "2026-09-20", endDateExclusive: "2026-09-22", categoryId: null });
    expect(allDay).not.toHaveProperty("startAt");
    expect(eventFormProblem({ ...values, endTime: "13:00" })).toBe("endBeforeStart");
    expect(eventFormProblem({ ...values, title: "" })).toBe("title");
    expect(eventFormProblem(values)).toBeNull();
  });
});