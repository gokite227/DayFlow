"use client";

import type { DayResponse } from "@dayflow/api-client";
import { useDroppable } from "@dnd-kit/core";
import { ErrorNotice, LoadingState } from "@/components/query-state";
import type { DropTarget } from "./calendar-drop";
import { DayChip } from "./week-grid";

/** C: Days without a date. Dropping a dated Day here clears its date. */
export function UnscheduledPanel({
  days,
  loading,
  error,
  onRetry,
  disabled,
  onOpen,
}: {
  days: DayResponse[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  disabled: boolean;
  onOpen: (day: DayResponse) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "unscheduled", data: { kind: "unscheduled" } satisfies DropTarget });

  return (
    <aside ref={setNodeRef} className={`tc-unscheduled${isOver ? " dragover" : ""}`} aria-label="Unscheduled">
      <div className="tc-panel-title">
        Unscheduled <span className="mini">{loading ? "" : days.length}</span>
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
