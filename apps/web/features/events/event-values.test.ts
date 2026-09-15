import type { EventOccurrenceResponse, EventResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import {
  describeOccurrenceTime,
  eventFormProblem,
  eventTime,
  eventToValues,
  newEventValues,
  nextOccurrences,
  reminderLabel,
  toCreateEventRequest,
  toUpdateEventRequest,
  zonedDateTime,
} from "./event-values";

const timedEvent: EventResponse = {
  id: "e1",
  title: "Interview",
  type: "INTERVIEW",
  allDay: false,
  startAt: "2026-09-16T14:00:00+09:00",
  endAt: "2026-09-16T15:00:00+09:00",
  startDate: null,
  endDateExclusive: null,
  timezone: "Asia/Seoul",
  location: null,
  notes: null,
  recurrence: "NONE",
  reminders: [0, 60],
  linkedGoalId: null,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 3,
};

const occurrence = (overrides: Partial<EventOccurrenceResponse>): EventOccurrenceResponse => ({
  eventId: "e1",
  eventVersion: 0,
  title: "Birthday",
  type: "BIRTHDAY",
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

describe("EVT-001 timed / all-day values", () => {
  it("builds an offset date-time in the Event timezone, not the browser timezone", () => {
    expect(zonedDateTime("2026-09-30", "23:59", "Asia/Seoul")).toBe("2026-09-30T23:59:00+09:00");
    expect(zonedDateTime("2026-01-15", "09:00", "America/New_York")).toBe("2026-01-15T09:00:00-05:00");
    expect(zonedDateTime("2026-07-15", "09:00", "America/New_York")).toBe("2026-07-15T09:00:00-04:00");
  });

  it("sends only the time pair of the chosen kind", () => {
    const timed = { ...newEventValues("2026-09-16", "Asia/Seoul"), title: " Interview ", reminders: [60, 0] };
    expect(toCreateEventRequest(timed)).toEqual({
      title: "Interview",
      type: "APPOINTMENT",
      allDay: false,
      startAt: "2026-09-16T09:00:00+09:00",
      endAt: "2026-09-16T10:00:00+09:00",
      timezone: "Asia/Seoul",
      location: null,
      notes: null,
      recurrence: "NONE",
      reminders: [0, 60],
      linkedGoalId: null,
    });

    const allDay = { ...timed, allDay: true, endDate: "2026-09-18" };
    const request = toCreateEventRequest(allDay);
    expect(request).toMatchObject({ allDay: true, startDate: "2026-09-16", endDateExclusive: "2026-09-19" });
    expect(request).not.toHaveProperty("startAt");
  });

  it("round-trips an Event into form values and a versioned PATCH", () => {
    const values = eventToValues(timedEvent);
    expect(values).toMatchObject({ startDate: "2026-09-16", startTime: "14:00", endTime: "15:00", reminders: [0, 60] });
    expect(toUpdateEventRequest(values, timedEvent.version)).toMatchObject({
      startAt: "2026-09-16T14:00:00+09:00",
      version: 3,
    });

    const allDay = eventToValues({ ...timedEvent, allDay: true, startAt: null, endAt: null, startDate: "2026-10-03", endDateExclusive: "2026-10-04" });
    expect(allDay).toMatchObject({ allDay: true, startDate: "2026-10-03", endDate: "2026-10-03" });
  });

  it("rejects inconsistent server time fields and invalid forms", () => {
    expect(() => eventTime({ ...timedEvent, startDate: "2026-09-16", allDay: true })).toThrow();
    const values = newEventValues("2026-09-16", "Asia/Seoul");
    expect(eventFormProblem({ ...values, endTime: "08:00" })).toBe("endBeforeStart");
    expect(eventFormProblem({ ...values, timezone: "Mars/Base" })).toBe("timezone");
    expect(eventFormProblem({ ...values, reminders: [0, 10, 30, 60, 120, 1440] })).toBe("reminders");
    expect(eventFormProblem(values)).toBeNull();
  });
});

describe("NOTI-001 / EVT-002 display helpers", () => {
  it("labels reminder offsets", () => {
    expect([0, 10, 60, 90, 1440].map(reminderLabel)).toEqual(["정각", "10분 전", "1시간 전", "90분 전", "1일 전"]);
  });

  it("describes all-day, ranged and point occurrences", () => {
    expect(describeOccurrenceTime(occurrence({}))).toBe("10/3 (SAT) · 하루 종일");
    expect(describeOccurrenceTime(occurrence({ endDateExclusive: "2026-10-06" }))).toBe("10/3 (SAT) ~ 10/5 (MON) · 하루 종일");
    const deadline = occurrence({ allDay: false, startDate: null, endDateExclusive: null, startAt: "2026-09-30T23:59:00+09:00", endAt: "2026-09-30T23:59:00+09:00" });
    expect(describeOccurrenceTime(deadline)).toBe("9/30 (WED) · 23:59");
  });

  it("keeps only the first occurrence of each Event", () => {
    const list = [occurrence({ startDate: "2026-10-03" }), occurrence({ eventId: "e2" }), occurrence({ startDate: "2027-10-03" })];
    expect(nextOccurrences(list).map((item) => item.eventId)).toEqual(["e1", "e2"]);
  });
});
