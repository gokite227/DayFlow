import type { DayResponse } from "@dayflow/api-client";
import { DAY_STATUS_LABEL, PLANNING_MODE_LABEL, describeDaySchedule } from "./day-values";

/** A Day row with a done checkbox; shared by Days and Today. */
export function DayItem({
  day,
  goalTitle,
  toggling,
  onToggle,
  onOpen,
  highlightCore = false,
}: {
  day: DayResponse;
  goalTitle: string | undefined;
  toggling: boolean;
  onToggle: () => void;
  onOpen: () => void;
  highlightCore?: boolean;
}) {
  const done = day.status === "DONE";
  const classes = ["day-item", done ? "done" : "", highlightCore && day.coreDay ? "core" : ""].filter(Boolean);

  return (
    <div className={classes.join(" ")}>
      <input
        type="checkbox"
        checked={done}
        disabled={toggling}
        onChange={onToggle}
        aria-label={`${day.title} 완료`}
      />
      <button type="button" className="day-title" onClick={onOpen}>
        <div>
          <span className="day-title-text">{day.title}</span>
          {day.coreDay && <span className="core-badge">핵심</span>}
        </div>
        <div className="mini">
          {goalTitle ?? "주간 목표"} · {describeDaySchedule(day)} · {DAY_STATUS_LABEL[day.status]} ·{" "}
          {PLANNING_MODE_LABEL[day.planningMode]} · {day.estimatedMinutes}분
        </div>
      </button>
    </div>
  );
}
