import type { DayResponse } from "@dayflow/api-client";
import type { FocusScheduleEntry, FocusScheduleState } from "./blocking-adapter";
import { MAX_FOCUS_MINUTES, type BlockedAppRef, type FocusState } from "./focus-model";
import { resolveDayFocus, type DayFocusPreferences, type FocusSettings } from "./focus-preferences";

/**
 * Day schedule → OS-scheduled Focus (pure). The JS app only decides *what* should be scheduled; the OS runs it
 * at the schedule's start (Android AlarmManager + FocusScheduleReceiver), also when DayFlow is closed. The whole
 * list is synced after every Day change, settings change, app start and foreground, so an edited, moved, deleted
 * or completed Day never keeps a stale schedule.
 */

/** Days starting within this many days are scheduled; later ones are picked up by a later sync. */
export const AUTOMATION_WINDOW_DAYS = 7;
export const MAX_SCHEDULED_FOCUS = 50;

/** Stable per Day (a Day has at most one schedule), so a changed schedule replaces its predecessor. */
export function focusScheduleId(dayId: string): string {
  return `day:${dayId}`;
}

export interface PlanInput {
  days: readonly DayResponse[];
  settings: FocusSettings | null;
  preferences: DayFocusPreferences;
  defaultApps: readonly BlockedAppRef[];
  now: number;
}

/** Why a Day with a schedule is not automated (for the Day settings card), or null when it is. */
export function scheduleProblem(day: Pick<DayResponse, "status" | "schedule">, now: number): string | null {
  if (!day.schedule) return "시간이 정해진 일정이 없어요.";
  if (day.status === "DONE" || day.status === "SKIPPED") return "끝난 Day예요.";
  const start = Date.parse(day.schedule.startAt);
  const end = Date.parse(day.schedule.endAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return "일정 시간이 올바르지 않아요.";
  if (end - start > MAX_FOCUS_MINUTES * 60_000) return `${MAX_FOCUS_MINUTES / 60}시간이 넘는 일정은 자동으로 집중하지 않아요.`;
  if (end <= now) return "이미 지난 일정이에요.";
  return null;
}

export function planFocusSchedules({ days, settings, preferences, defaultApps, now }: PlanInput): FocusScheduleEntry[] {
  const horizon = now + AUTOMATION_WINDOW_DAYS * 24 * 60 * 60_000;
  return days
    .flatMap((day): FocusScheduleEntry[] => {
      if (!day.schedule || scheduleProblem(day, now) !== null) return [];
      const startAt = Date.parse(day.schedule.startAt);
      if (startAt > horizon) return [];
      const resolved = resolveDayFocus(preferences[day.id], settings, defaultApps);
      if (resolved.triggerMode === "MANUAL") return [];
      const notifyOnly = resolved.triggerMode === "NOTIFY_ONLY";
      return [
        {
          id: focusScheduleId(day.id),
          dayId: day.id,
          title: day.title,
          startAt,
          endAt: Date.parse(day.schedule.endAt),
          trigger: resolved.triggerMode,
          // NOTIFY_ONLY never blocks, so it carries neither a lock nor apps.
          lockMode: notifyOnly ? "FLEXIBLE" : resolved.lockMode,
          apps: notifyOnly ? [] : resolved.apps,
        },
      ];
    })
    .sort((a, b) => a.startAt - b.startAt || a.id.localeCompare(b.id))
    .slice(0, MAX_SCHEDULED_FOCUS);
}

/** A cheap identity of a plan, so unchanged plans are not synced again on every render. */
export function planKey(entries: readonly FocusScheduleEntry[]): string {
  return JSON.stringify(entries.map((entry) => [entry.id, entry.startAt, entry.endAt, entry.trigger, entry.lockMode, entry.title, entry.apps.map((app) => app.id)]));
}

/**
 * The in-app "집중을 시작할까요?" card: an ASK schedule that is running now, not answered yet (ASKED, or still
 * SCHEDULED when an inexact alarm is late), while no Focus runs. Answering it goes through the same native path
 * as the notification buttons.
 */
export function scheduledFocusPrompt(schedules: readonly FocusScheduleState[], state: FocusState, now: number): FocusScheduleState | null {
  if (state.current?.status === "ACTIVE") return null;
  return (
    schedules.find(
      (entry) => entry.trigger === "ASK" && (entry.status === "ASKED" || entry.status === "SCHEDULED") && entry.startAt <= now && now < entry.endAt,
    ) ?? null
  );
}

/** When the UI should look again (a schedule starts or ends) while DayFlow is open; null when nothing is ahead. */
export function nextScheduleBoundary(schedules: readonly FocusScheduleState[], now: number): number | null {
  const times = schedules.flatMap((entry) => [entry.startAt, entry.endAt]).filter((time) => time > now);
  return times.length > 0 ? Math.min(...times) : null;
}
