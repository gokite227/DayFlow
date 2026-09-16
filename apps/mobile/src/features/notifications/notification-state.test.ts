import { describe, expect, it } from "vitest";
import { routeForPayload, toPayload } from "./notification-payload";
import { canScheduleNotifications, permissionAction, toPermissionSnapshot } from "./permission-state";
import { nextFingerprints, planReconcile } from "./reconcile-plan";
import { planEventReminders } from "./reminder-plan";

describe("notification permission state", () => {
  it("maps OS statuses to 허용됨 / 거부됨 / 미결정", () => {
    expect(toPermissionSnapshot({ status: "granted", granted: true, canAskAgain: true })).toEqual({ state: "granted", canAskAgain: true });
    expect(toPermissionSnapshot({ status: "undetermined", granted: false, canAskAgain: true })).toEqual({ state: "undetermined", canAskAgain: true });
    expect(toPermissionSnapshot({ status: "denied", granted: false, canAskAgain: false })).toEqual({ state: "denied", canAskAgain: false });
  });

  it("counts iOS provisional authorization as allowed", () => {
    expect(toPermissionSnapshot({ status: "undetermined", granted: false, canAskAgain: true, ios: { status: 3 } }).state).toBe("granted");
  });

  it("offers the OS dialog while it can still be shown, otherwise the OS settings", () => {
    expect(permissionAction({ state: "undetermined", canAskAgain: true })).toBe("request");
    expect(permissionAction({ state: "denied", canAskAgain: true })).toBe("request");
    expect(permissionAction({ state: "denied", canAskAgain: false })).toBe("open-settings");
    expect(permissionAction({ state: "granted", canAskAgain: true })).toBe("none");
    expect(canScheduleNotifications({ state: "denied", canAskAgain: false })).toBe(false);
  });
});

describe("notification payload", () => {
  const [reminder] = planEventReminders(
    [{ id: "55555555-5555-4555-8555-555555555555", reminders: [30] }],
    [
      {
        eventId: "55555555-5555-4555-8555-555555555555",
        allDay: false,
        startAt: "2026-09-20T14:00:00+09:00",
        startDate: null,
        timezone: "Asia/Seoul",
        title: "면접",
      },
    ],
    { now: Date.parse("2026-09-16T00:00:00Z") },
  );

  it("contains only the notification id, Event id, occurrence start and deep link", () => {
    expect(toPayload(reminder!)).toEqual({
      notificationId: reminder!.identifier,
      eventId: "55555555-5555-4555-8555-555555555555",
      occurrenceStartAt: "2026-09-20T14:00:00+09:00",
      deepLink: "dayflow://events/55555555-5555-4555-8555-555555555555?occurrence=2026-09-20T14%3A00%3A00%2B09%3A00",
    });
  });

  it("opens the Event detail with the occurrence for a tapped reminder", () => {
    expect(routeForPayload(toPayload(reminder!))).toEqual({
      pathname: "/events/[eventId]",
      params: { eventId: "55555555-5555-4555-8555-555555555555", occurrence: "2026-09-20T14:00:00+09:00" },
    });
    expect(routeForPayload({ eventId: "../settings" })).toBeNull();
    expect(routeForPayload(null)).toBeNull();
  });

  it("stores fingerprints only for reminders that are pending after reconcile", () => {
    const plan = planReconcile([reminder!], []);
    expect(nextFingerprints([reminder!], plan, new Set())).toEqual({ [reminder!.identifier]: reminder!.fingerprint });
    expect(nextFingerprints([reminder!], plan, new Set([reminder!.identifier]))).toEqual({});
  });
});