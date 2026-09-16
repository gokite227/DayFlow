import type { DayResponse } from "@dayflow/api-client";
import { useSyncExternalStore } from "react";

/** Where a drag started: the time grid, the date-only row, or the "날짜 없음" drawer. */
export type DragSource = "grid" | "dateOnly" | "drawer";

/** Finger position of a gesture event in window coordinates, plus its position inside the touched view. */
export interface TouchPoint {
  absoluteX: number;
  absoluteY: number;
  x: number;
  y: number;
}

export interface DragHover {
  /** Preview of what dropping here would do, e.g. "9/17 14:00–15:00". */
  label: string | null;
  overUnscheduled: boolean;
}

export interface CalendarDragController {
  begin: (day: DayResponse, source: DragSource, touch: TouchPoint, size: { width: number; height: number }) => void;
  move: (absoluteX: number, absoluteY: number) => void;
  end: (absoluteX: number, absoluteY: number, cancelled: boolean) => void;
}

/**
 * A tiny external store for the drag preview. Only the floating block and the "날짜 없음" button subscribe,
 * so moving a finger never re-renders the time grid.
 */
export function createHoverStore() {
  let state: DragHover = { label: null, overUnscheduled: false };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next: DragHover) => {
      if (next.label === state.label && next.overUnscheduled === state.overUnscheduled) return;
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type HoverStore = ReturnType<typeof createHoverStore>;

export function useHover(store: HoverStore): DragHover {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
