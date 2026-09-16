import type { DayResponse } from "@dayflow/api-client";
import { DayTagPills } from "./day-tag-pills";
import { DAY_PRIORITY_LABEL, DAY_STATUS_LABEL, PLANNING_MODE_LABEL, describeDaySchedule } from "./day-values";

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
  /** The title of the Day's WEEK Goal, or undefined for a Day without a Goal (DAY-001). */
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
        <div className="day-title-line">
          <span className="day-title-text">{day.title}</span>
          {day.priority !== "NONE" && (
            <span className={`priority-badge ${day.priority.toLowerCase()}`}>
              {DAY_PRIORITY_LABEL[day.priority]}
            </span>
          )}
          {day.coreDay && <span className="core-badge">핵심</span>}
          <DayTagPills tags={day.tags} />
        </div>
        <div className="mini">
          {goalTitle ?? "목표 없음"} · {describeDaySchedule(day)} · {DAY_STATUS_LABEL[day.status]} ·{" "}
          {PLANNING_MODE_LABEL[day.planningMode]} · {day.estimatedMinutes}분
        </div>
      </button>
    </div>
  );
}
