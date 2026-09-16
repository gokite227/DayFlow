import type { EventOccurrenceResponse, EventResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { planReconcile } from "./reconcile-plan";
import {
  MAX_EVENT_REMINDER_NOTIFICATIONS,
  eventDeepLink,
  occurrenceFetchRange,
  planEventReminders,
  reminderBody,
  reminderIdentifier,
  reminderTriggerAt,
} from "./reminder-plan";

const iso = (value: string) => Date.parse(value);

const timed = (overrides: Partial<EventOccurrenceResponse> = {}): EventOccurrenceResponse => ({
  eventId: "11111111-1111-4111-8111-111111111111",
  eventVersion: 0,
  title: "면접",
  category: null,
  allDay: false,
  startAt: "2026-09-20T14:00:00+09:00",
  endAt: "2026-09-20T15:00:00+09:00",
  startDate: null,
  endDateExclusive: null,
  timezone: "Asia/Seoul",
  location: "강남",
  recurrence: "NONE",
  linkedGoalId: null,
  ...overrides,
});

const allDay = (overrides: Partial<EventOccurrenceResponse> = {}): EventOccurrenceResponse =>
  timed({ allDay: true, startAt: null, endAt: null, startDate: "2026-09-20", endDateExclusive: "2026-09-21", title: "포트폴리오 제출 마감", ...overrides });

const event = (id: string, reminders: number[]): Pick<EventResponse, "id" | "reminders"> => ({ id, reminders });

const NOW = iso("2026-09-16T00:00:00Z");

describe("NOTI-001 reminder trigger time", () => {
  it("timed Event: occurrence start minus the offset", () => {
    const occurrence = timed();
    expect(reminderTriggerAt(occurrence, 0)).toBe(iso("2026-09-20T14:00:00+09:00"));
    expect(reminderTriggerAt(occurrence, 10)).toBe(iso("2026-09-20T13:50:00+09:00"));
    expect(reminderTriggerAt(occurrence, 60)).toBe(iso("2026-09-20T13:00:00+09:00"));
    expect(reminderTriggerAt(occurrence, 1440)).toBe(iso("2026-09-19T14:00:00+09:00"));
  });

  it("all-day Event: 09:00 of the date in the Event timezone minus the offset, never UTC midnight", () => {
    const occurrence = allDay();
    expect(reminderTriggerAt(occurrence, 0)).toBe(iso("2026-09-20T09:00:00+09:00"));
    expect(reminderTriggerAt(occurrence, 10)).toBe(iso("2026-09-20T08:50:00+09:00"));
    expect(reminderTriggerAt(occurrence, 60)).toBe(iso("2026-09-20T08:00:00+09:00"));
    expect(reminderTriggerAt(occurrence, 1440)).toBe(iso("2026-09-19T09:00:00+09:00"));
    expect(reminderTriggerAt(allDay({ timezone: "Europe/Berlin" }), 0)).not.toBe(iso("2026-09-20T00:00:00Z"));
  });

  it("keeps the Event timezone meaning when it differs from the device (Asia/Tokyo vs Asia/Seoul)", () => {
    // Same UTC offset today, but the instant must come from the Event zone, not from any device zone.
    expect(reminderTriggerAt(timed({ startAt: "2026-09-20T14:00:00+09:00", timezone: "Asia/Tokyo" }), 60)).toBe(
      iso("2026-09-20T04:00:00Z"),
    );
    expect(reminderTriggerAt(allDay({ timezone: "America/Los_Angeles" }), 0)).toBe(iso("2026-09-20T16:00:00Z"));
    expect(reminderTriggerAt(allDay({ timezone: "Asia/Tokyo" }), 0)).toBe(iso("2026-09-20T00:00:00Z"));
  });

  it("handles DST: all-day 1일 전 is still the previous day 09:00 local, timed uses the exact instant", () => {
    // US DST starts 2026-03-08 02:00 (EST -05:00 → EDT -04:00).
    const newYorkAllDay = allDay({ startDate: "2026-03-08", endDateExclusive: "2026-03-09", timezone: "America/New_York" });
    expect(reminderTriggerAt(newYorkAllDay, 0)).toBe(iso("2026-03-08T09:00:00-04:00"));
    expect(reminderTriggerAt(newYorkAllDay, 1440)).toBe(iso("2026-03-07T09:00:00-05:00"));
    const newYorkTimed = timed({ startAt: "2026-03-08T10:00:00-04:00", timezone: "America/New_York" });
    expect(reminderTriggerAt(newYorkTimed, 1440)).toBe(iso("2026-03-07T14:00:00Z"));
  });
});

describe("NOTI-001 reminder planning", () => {
  it("plans one notification per occurrence and offset with a deterministic identifier", () => {
    const occurrence = timed();
    const plan = planEventReminders([event(occurrence.eventId, [60, 0])], [occurrence], { now: NOW });
    expect(plan.map((reminder) => reminder.offsetMinutes)).toEqual([60, 0]);
    expect(plan[0]).toMatchObject({
      identifier: reminderIdentifier(occurrence.eventId, occurrence, 60),
      eventId: occurrence.eventId,
      occurrenceStartAt: "2026-09-20T14:00:00+09:00",
      title: "DayFlow",
      body: "오후 2:00 · 면접",
      deepLink: eventDeepLink(occurrence.eventId, "2026-09-20T14:00:00+09:00"),
    });
    expect(planEventReminders([event(occurrence.eventId, [60, 0])], [occurrence], { now: NOW })).toEqual(plan);
  });

  it("never schedules reminders whose time has already passed", () => {
    const occurrence = timed();
    const now = iso("2026-09-20T13:30:00+09:00");
    const plan = planEventReminders([event(occurrence.eventId, [0, 10, 60, 1440])], [occurrence], { now });
    expect(plan.map((reminder) => reminder.offsetMinutes)).toEqual([10, 0]);
    expect(planEventReminders([event(occurrence.eventId, [0])], [occurrence], { now: iso("2026-09-20T14:00:00+09:00") })).toEqual([]);
  });

  it("expands recurring occurrences only inside the rolling window", () => {
    const eventId = "22222222-2222-4222-8222-222222222222";
    const weekly = ["2026-09-17", "2026-09-24", "2026-10-01", "2026-10-15", "2026-10-22"].map((date) =>
      timed({ eventId, recurrence: "WEEKLY", title: "스터디", startAt: `${date}T19:00:00+09:00`, endAt: `${date}T20:00:00+09:00` }),
    );
    const plan = planEventReminders([event(eventId, [10])], weekly, { now: NOW, windowDays: 30 });
    // 2026-10-22 is more than 30 days after 2026-09-16 09:00 KST.
    expect(plan.map((reminder) => reminder.occurrenceStartAt.slice(0, 10))).toEqual(["2026-09-17", "2026-09-24", "2026-10-01", "2026-10-15"]);
    expect(new Set(plan.map((reminder) => reminder.identifier)).size).toBe(4);
  });

  it("keeps only the soonest reminders under the OS pending-notification cap", () => {
    const eventId = "33333333-3333-4333-8333-333333333333";
    const daily = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 8, 17 + index)).toISOString().slice(0, 10);
      return timed({ eventId, recurrence: "DAILY", startAt: `${date}T08:00:00+09:00`, endAt: `${date}T09:00:00+09:00` });
    });
    const plan = planEventReminders([event(eventId, [0, 10, 30])], daily, { now: NOW });
    expect(plan).toHaveLength(MAX_EVENT_REMINDER_NOTIFICATIONS);
    expect(plan.map((reminder) => reminder.triggerAt)).toEqual([...plan.map((reminder) => reminder.triggerAt)].sort((a, b) => a - b));
  });

  it("does not schedule duplicates for repeated occurrences or offsets", () => {
    const occurrence = timed();
    const plan = planEventReminders([event(occurrence.eventId, [10, 10])], [occurrence, { ...occurrence }], { now: NOW });
    expect(plan).toHaveLength(1);
  });

  it("ignores Events without reminders and occurrences of unknown Events", () => {
    const occurrence = timed();
    expect(planEventReminders([event(occurrence.eventId, [])], [occurrence], { now: NOW })).toEqual([]);
    expect(planEventReminders([], [occurrence], { now: NOW })).toEqual([]);
  });

  it("writes a short body with the Event wall clock and a relative day", () => {
    const occurrence = timed();
    expect(reminderBody(occurrence, iso("2026-09-20T13:00:00+09:00"))).toBe("오후 2:00 · 면접");
    expect(reminderBody(occurrence, iso("2026-09-19T14:00:00+09:00"))).toBe("내일 오후 2:00 · 면접");
    expect(reminderBody(occurrence, iso("2026-09-17T14:00:00+09:00"))).toBe("9월 20일 (일) 오후 2:00 · 면접");
    expect(reminderBody(allDay(), iso("2026-09-19T09:00:00+09:00"))).toBe("내일 · 포트폴리오 제출 마감");
    expect(reminderBody(allDay(), iso("2026-09-20T09:00:00+09:00"))).toBe("오늘 · 포트폴리오 제출 마감");
    expect(reminderBody(occurrence, iso("2026-09-20T13:00:00+09:00"))).not.toContain("강남");
  });

  it("fetches enough occurrences to cover the window and the longest custom offset", () => {
    expect(occurrenceFetchRange("2026-09-16", 30)).toEqual({ from: "2026-09-15", to: "2026-11-17" });
  });
});

describe("NOTI-001 reconcile after Event changes", () => {
  const eventId = "44444444-4444-4444-8444-444444444444";
  const occurrence = timed({ eventId });
  const scheduledFrom = (plan: ReturnType<typeof planEventReminders>) =>
    plan.map((reminder) => ({ identifier: reminder.identifier, fingerprint: reminder.fingerprint }));

  it("keeps notifications that are already correct", () => {
    const plan = planEventReminders([event(eventId, [10])], [occurrence], { now: NOW });
    expect(planReconcile(plan, scheduledFrom(plan))).toEqual({ toCancel: [], toSchedule: [], unchanged: [plan[0]!.identifier] });
  });

  it("cancels every notification of a deleted Event", () => {
    const before = planEventReminders([event(eventId, [10, 60])], [occurrence], { now: NOW });
    const after = planEventReminders([], [], { now: NOW });
    const result = planReconcile(after, scheduledFrom(before));
    expect(result.toCancel.sort()).toEqual(before.map((reminder) => reminder.identifier).sort());
    expect(result.toSchedule).toEqual([]);
  });

  it("cancels only the removed reminder when one offset is deleted", () => {
    const before = planEventReminders([event(eventId, [10, 60])], [occurrence], { now: NOW });
    const after = planEventReminders([event(eventId, [10])], [occurrence], { now: NOW });
    const result = planReconcile(after, scheduledFrom(before));
    expect(result.toCancel).toEqual([reminderIdentifier(eventId, occurrence, 60)]);
    expect(result.toSchedule).toEqual([]);
    expect(result.unchanged).toEqual([reminderIdentifier(eventId, occurrence, 10)]);
  });

  it("cancels the old time and schedules the new one when the Event time changes", () => {
    const before = planEventReminders([event(eventId, [10])], [occurrence], { now: NOW });
    const moved = timed({ eventId, startAt: "2026-09-20T16:00:00+09:00", endAt: "2026-09-20T17:00:00+09:00" });
    const after = planEventReminders([event(eventId, [10])], [moved], { now: NOW });
    const result = planReconcile(after, scheduledFrom(before));
    expect(result.toCancel).toEqual([before[0]!.identifier]);
    expect(result.toSchedule.map((reminder) => reminder.identifier)).toEqual([after[0]!.identifier]);
  });

  it("replaces a notification whose text changed under the same identifier", () => {
    const before = planEventReminders([event(eventId, [10])], [occurrence], { now: NOW });
    const after = planEventReminders([event(eventId, [10])], [timed({ eventId, title: "최종 면접" })], { now: NOW });
    const result = planReconcile(after, scheduledFrom(before));
    expect(result.toCancel).toEqual([before[0]!.identifier]);
    expect(result.toSchedule[0]).toMatchObject({ identifier: before[0]!.identifier, body: "오후 2:00 · 최종 면접" });
  });

  it("treats a pending notification without a saved fingerprint as outdated", () => {
    const plan = planEventReminders([event(eventId, [10])], [occurrence], { now: NOW });
    const result = planReconcile(plan, [{ identifier: plan[0]!.identifier, fingerprint: null }]);
    expect(result.toCancel).toEqual([plan[0]!.identifier]);
    expect(result.toSchedule).toHaveLength(1);
  });
});