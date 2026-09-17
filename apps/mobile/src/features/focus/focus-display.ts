import type { DayResponse } from "@dayflow/api-client";
import type { BlockingPermission } from "./blocking-adapter";
import type { FocusSession } from "./focus-model";

const pad = (value: number) => String(value).padStart(2, "0");

/** "24:59", "1:02:03" */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(totalSeconds, 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

/** Local wall clock "14:05" of an ISO instant. */
export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Days offered for linking: today's Days that are not finished, plus the Day the screen was opened with. */
export function focusDayCandidates(days: readonly DayResponse[], today: string, linkedDayId: string | null): DayResponse[] {
  const open = (day: DayResponse) => day.status !== "DONE" && day.status !== "SKIPPED";
  const candidates = days.filter((day) => day.plannedDate === today && open(day));
  const linked = linkedDayId === null ? undefined : days.find((day) => day.id === linkedDayId);
  const list = linked && !candidates.some((day) => day.id === linked.id) ? [linked, ...candidates] : candidates;
  return list.sort((a, b) => Number(b.coreDay) - Number(a.coreDay));
}

/** A finished Day cannot start a Focus. */
export function canFocusOnDay(day: Pick<DayResponse, "status">): boolean {
  return day.status !== "DONE" && day.status !== "SKIPPED";
}

export type CustomMinutesInput = { ok: true; minutes: number } | { ok: false };

export function parseCustomMinutes(text: string): CustomMinutesInput {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isInteger(value) ? { ok: true, minutes: value } : { ok: false };
}

export const PERMISSION_LABEL: Record<BlockingPermission["state"], string> = {
  granted: "사용 가능",
  required: "권한 필요",
  unsupported: "이 기기에서는 앱 차단을 쓸 수 없어요",
};

/** Notice for a running Focus whose apps can no longer be blocked (the permission was turned off). */
export function runningPermissionNotice(session: Pick<FocusSession, "blockedApps" | "blockingEngaged">, permission: BlockingPermission): string | null {
  if (session.blockedApps.length === 0 || !session.blockingEngaged) return null;
  return permission.state === "required" ? "앱 차단 권한이 꺼졌어요. 타이머는 계속되지만 선택한 앱이 차단되지 않아요." : null;
}

/** "25분 집중 · 앱 2개 차단" (· 종료 시각까지 해제 불가) */
export function sessionSummary(session: Pick<FocusSession, "durationMinutes" | "blockedApps"> & Partial<Pick<FocusSession, "lockMode">>): string {
  const apps = session.blockedApps.length > 0 ? ` · 앱 ${session.blockedApps.length}개 차단` : "";
  return `${session.durationMinutes}분 집중${apps}${session.lockMode === "STRICT" ? " · 종료 시각까지 해제 불가" : ""}`;
}

/** "오후 4:20" */
export function formatKoreanClockTime(epochOrIso: number | string): string {
  const date = new Date(epochOrIso);
  const hours = date.getHours();
  return `${hours < 12 ? "오전" : "오후"} ${hours % 12 === 0 ? 12 : hours % 12}:${pad(date.getMinutes())}`;
}

/** "14:00–15:30" */
export function formatTimeRange(startAt: number | string, endAt: number | string): string {
  const clock = (value: number | string) => {
    const date = new Date(value);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  return `${clock(startAt)}–${clock(endAt)}`;
}

/** The final confirmation before a STRICT Focus starts; `endsAt` defaults to now + minutes (a manual Focus). */
export function strictConfirmation(minutes: number, endsAt: number = Date.now() + minutes * 60_000): { title: string; message: string; confirm: string } {
  return {
    title: `${minutes}분 동안 집중 잠금을 시작할까요?`,
    message: `${formatKoreanClockTime(endsAt)}까지 DayFlow에서 이 집중 모드를 종료할 수 없어요.\n선택한 앱과 집중 시간도 변경할 수 없습니다.`,
    confirm: `${minutes}분 동안 잠그기`,
  };
}

/** Header of a running Focus. */
export function runningTitle(session: Pick<FocusSession, "lockMode">): string {
  return session.lockMode === "STRICT" ? "🔒 강제 집중 중" : "집중 중";
}
