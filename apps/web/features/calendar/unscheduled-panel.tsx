"use client";

import type { DayResponse } from "@dayflow/api-client";
import { useDroppable } from "@dnd-kit/core";
import { ErrorNotice, LoadingState } from "@/components/query-state";
import type { DropTarget } from "./calendar-drop";
import { DayChip } from "./week-grid";

/**
 * C: Days without a date, on the right of the time grid. Dropping a dated Day here clears its date.
 * Collapsed it keeps only the count and the drop target, so the grid takes the remaining width.
 */
export function UnscheduledPanel({
  days,
  loading,
  error,
  onRetry,
  disabled,
  collapsed,
  onToggle,
  onOpen,
}: {
  days: DayResponse[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  disabled: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (day: DayResponse) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "unscheduled", data: { kind: "unscheduled" } satisfies DropTarget });
  const count = loading ? "" : String(days.length);

  if (collapsed) {
    return (
      <aside
        ref={setNodeRef}
        className={`tc-unscheduled collapsed${isOver ? " dragover" : ""}`}
        aria-label="날짜 없는 Day"
      >
        <button type="button" className="tc-panel-toggle" onClick={onToggle} aria-expanded={false} title="날짜 없는 Day 펼치기">
          ‹
        </button>
        <div className="tc-collapsed-label">
          날짜 없음 <strong>{count}</strong>
        </div>
      </aside>
    );
  }

  return (
    <aside ref={setNodeRef} className={`tc-unscheduled${isOver ? " dragover" : ""}`} aria-label="날짜 없는 Day">
      <div className="tc-panel-head">
        <div className="tc-panel-title">
          날짜 없음 <span className="mini">{count}</span>
        </div>
        <button type="button" className="tc-panel-toggle" onClick={onToggle} aria-expanded title="날짜 없는 Day 접기">
          ›
        </button>
      </div>
      <div className="mini" style={{ marginBottom: 8 }}>
        날짜 없는 Day입니다. 날짜 칸이나 시간 칸으로 끌어다 놓으세요.
      </div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorNotice error={error} onRetry={onRetry} />
      ) : days.length === 0 ? (
        <div className="empty">날짜 없는 Day가 없습니다.</div>
      ) : (
        <div className="tc-chip-list">
          {days.map((day) => (
            <DayChip key={day.id} day={day} disabled={disabled} onOpen={onOpen} />
          ))}
        </div>
      )}
    </aside>
  );
}
