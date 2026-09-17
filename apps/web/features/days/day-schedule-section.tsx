"use client";

import type { DayResponse } from "@dayflow/api-client";
import { useState } from "react";
import { ErrorNotice } from "@/components/query-state";
import {
  MINUTES_PER_DAY,
  defaultScheduleLength,
  durationMinutes,
  formatMinutes,
  parseTimeInput,
  scheduleRequest,
  wallClock,
} from "@/features/calendar/calendar-time";
import { useDeleteDaySchedule, useSetDaySchedule } from "./day-queries";

/** Latest time a time input can show (24:00 is not a valid input value). */
const LAST_INPUT_MINUTE = MINUTES_PER_DAY - 1;
const DEFAULT_START_MINUTES = 9 * 60;

function initialTimes(day: DayResponse) {
  if (day.schedule) {
    const start = wallClock(day.schedule.startAt).minutes;
    return {
      start: formatMinutes(start),
      end: formatMinutes(Math.min(start + durationMinutes(day.schedule), LAST_INPUT_MINUTE)),
    };
  }
  return {
    start: formatMinutes(DEFAULT_START_MINUTES),
    end: formatMinutes(
      Math.min(DEFAULT_START_MINUTES + defaultScheduleLength(day.estimatedMinutes), LAST_INPUT_MINUTE),
    ),
  };
}

/** Time placement of a saved Day: PUT (create/replace with expectedVersion) or DELETE the schedule. */
export function DayScheduleSection({
  day,
  plannedDate,
  onSaved,
}: {
  day: DayResponse;
  plannedDate: string;
  onSaved: () => void;
}) {
  const [times, setTimes] = useState(() => initialTimes(day));
  const [inputError, setInputError] = useState<string | null>(null);
  const setSchedule = useSetDaySchedule();
  const deleteSchedule = useDeleteDaySchedule();
  const pending = setSchedule.isPending || deleteSchedule.isPending;
  const error = setSchedule.error ?? deleteSchedule.error;

  const save = () => {
    const parsedStart = parseTimeInput(times.start);
    const parsedEnd = parseTimeInput(times.end);
    if (parsedStart === null || parsedEnd === null) {
      setInputError("시작/종료 시간을 입력해주세요.");
      return;
    }
    // Detail input keeps the exact minute (20:27–21:27); only Calendar drag/resize snaps to 15 minutes.
    const start = parsedStart;
    const end = parsedEnd;
    if (end <= start) {
      setInputError("종료 시간은 시작 시간보다 뒤여야 합니다.");
      return;
    }
    setInputError(null);
    setSchedule.mutate(
      { dayId: day.id, body: scheduleRequest(plannedDate, start, end - start, day.schedule) },
      { onSuccess: onSaved },
    );
  };

  const remove = () => deleteSchedule.mutate(day.id, { onSuccess: onSaved });

  return (
    <div className="field wide schedule-section">
      <span className="field-label">Calendar 시간 배치</span>
      {plannedDate === "" ? (
        <span className="mini">시간을 배치하려면 먼저 실행 날짜를 지정해주세요.</span>
      ) : (
        <>
          <div className="time-fields">
            <input
              type="time"
              step={60}
              aria-label="시작 시간"
              value={times.start}
              onChange={(event) => setTimes((current) => ({ ...current, start: event.target.value }))}
            />
            <span className="mini">~</span>
            <input
              type="time"
              step={60}
              aria-label="종료 시간"
              value={times.end}
              onChange={(event) => setTimes((current) => ({ ...current, end: event.target.value }))}
            />
          </div>
          <div className="schedule-actions">
            <button type="button" className="btn secondary small" onClick={save} disabled={pending}>
              {setSchedule.isPending ? "배치 중…" : day.schedule ? "시간 변경" : "시간 배치"}
            </button>
            {day.schedule && (
              <button type="button" className="btn ghost small" onClick={remove} disabled={pending}>
                {deleteSchedule.isPending ? "해제 중…" : "시간 배치만 해제"}
              </button>
            )}
          </div>
          <span className="mini">
            시간 배치는 위의 날짜({plannedDate})와 시간만 바로 저장합니다. Day 자체는 삭제되지 않습니다.
          </span>
        </>
      )}
      {inputError && <span className="field-error">{inputError}</span>}
      {error && <ErrorNotice error={error} />}
    </div>
  );
}
