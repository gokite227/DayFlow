import type { DragSource } from "./calendar-drag";

/**
 * The "날짜 없음" drawer. "Open" (the user's choice) and "hidden for a drag" (the drawer slides away so the
 * Calendar under it is visible while a Day is dragged out of it) are separate facts: a drag never decides
 * on its own whether the drawer is open.
 */
export interface DrawerModel {
  open: boolean;
  /** The Day being dragged out of the drawer, only while that drag is active. */
  draggedDayId: string | null;
  hiddenForDrag: boolean;
}

/** How a drag ended: a real change was dropped (saved afterwards), or nothing to apply (cancelled, no target, same place). */
export type DragOutcome = "dropped" | "cancelled";

export type DrawerEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "dragStart"; dayId: string; source: DragSource }
  | { type: "dragEnd"; outcome: DragOutcome };

export const CLOSED_DRAWER: DrawerModel = { open: false, draggedDayId: null, hiddenForDrag: false };
const OPEN_DRAWER: DrawerModel = { open: true, draggedDayId: null, hiddenForDrag: false };

export function drawerReducer(state: DrawerModel, event: DrawerEvent): DrawerModel {
  switch (event.type) {
    case "open":
      // Always a fresh session: no drag or hidden state survives from an earlier one.
      return OPEN_DRAWER;
    case "close":
      // X, backdrop and swipe all end here, whatever a drag left behind.
      return CLOSED_DRAWER;
    case "dragStart":
      if (event.source !== "drawer" || !state.open) return state;
      return { open: true, draggedDayId: event.dayId, hiddenForDrag: true };
    case "dragEnd":
      if (state.draggedDayId === null && !state.hiddenForDrag) return state;
      // A dropped Day has left the drawer, so the drawer closes; a cancelled drag brings the drawer back.
      return event.outcome === "dropped" || !state.open ? CLOSED_DRAWER : OPEN_DRAWER;
  }
}

/**
 * 일정만 has no Days, so there is nothing for the drawer to show: switching to it closes the drawer and drops
 * any drag or hidden-for-drag state (the same "close" every other exit uses). 전체 starts from that clean
 * state, so the drawer opens and closes normally again.
 */
export function drawerForContent(state: DrawerModel, content: "all" | "events"): DrawerModel {
  return content === "events" ? drawerReducer(state, { type: "close" }) : state;
}

/** The panel is on screen (and the backdrop catches taps). */
export function isDrawerVisible(state: DrawerModel): boolean {
  return state.open && !state.hiddenForDrag;
}

/** The panel keeps receiving touches while hidden for a drag, so the active drag keeps tracking. */
export function isDrawerPanelTouchable(state: DrawerModel): boolean {
  return state.open;
}
