import { describe, expect, it } from "vitest";
import { CLOSED_DRAWER, drawerReducer, isDrawerPanelTouchable, isDrawerVisible, type DrawerEvent, type DrawerModel } from "./unscheduled-drawer";

const run = (events: DrawerEvent[], from: DrawerModel = CLOSED_DRAWER) => events.reduce(drawerReducer, from);
const open: DrawerEvent = { type: "open" };
const close: DrawerEvent = { type: "close" };
const dragFromDrawer: DrawerEvent = { type: "dragStart", dayId: "day-1", source: "drawer" };

describe("날짜 없음 drawer state", () => {
  it("opens and closes", () => {
    const opened = run([open]);
    expect(isDrawerVisible(opened)).toBe(true);
    expect(isDrawerPanelTouchable(opened)).toBe(true);
    expect(run([open, close])).toEqual(CLOSED_DRAWER);
  });

  it("hides for a drawer drag without forgetting that the drawer is open", () => {
    const dragging = run([open, dragFromDrawer]);
    expect(dragging).toEqual({ open: true, draggedDayId: "day-1", hiddenForDrag: true });
    expect(isDrawerVisible(dragging)).toBe(false);
    // The dragged item still needs touches while the panel is off screen.
    expect(isDrawerPanelTouchable(dragging)).toBe(true);
  });

  it("drop → closes; reopening is a fresh session that closes again", () => {
    const dropped = run([open, dragFromDrawer, { type: "dragEnd", outcome: "dropped" }]);
    expect(dropped).toEqual(CLOSED_DRAWER);
    const reopened = run([open], dropped);
    expect(reopened).toEqual({ open: true, draggedDayId: null, hiddenForDrag: false });
    expect(run([close], reopened)).toEqual(CLOSED_DRAWER);
  });

  it("cancelled drag → the drawer comes back and closes normally", () => {
    const cancelled = run([open, dragFromDrawer, { type: "dragEnd", outcome: "cancelled" }]);
    expect(cancelled).toEqual({ open: true, draggedDayId: null, hiddenForDrag: false });
    expect(isDrawerVisible(cancelled)).toBe(true);
    expect(run([close], cancelled)).toEqual(CLOSED_DRAWER);
  });

  it("a failed save after the drop leaves nothing stuck: reopen and close still work", () => {
    // The drop ends the drag; the mutation failure only rolls back the Day cache and sends no drawer event.
    const afterDrop = run([open, dragFromDrawer, { type: "dragEnd", outcome: "dropped" }]);
    const reopened = run([open], afterDrop);
    expect(reopened.draggedDayId).toBeNull();
    expect(isDrawerVisible(reopened)).toBe(true);
    expect(run([close], reopened)).toEqual(CLOSED_DRAWER);
  });

  it("X, backdrop and swipe share one close that clears drag leftovers", () => {
    // All three call the same close event; from any state the result is identical.
    for (const state of [run([open]), run([open, dragFromDrawer]), run([open, dragFromDrawer, { type: "dragEnd", outcome: "cancelled" }])]) {
      expect(drawerReducer(state, close)).toEqual(CLOSED_DRAWER);
    }
  });

  it("never keeps a stale dragged Day after the drag ends", () => {
    for (const outcome of ["dropped", "cancelled"] as const) {
      expect(run([open, dragFromDrawer, { type: "dragEnd", outcome }]).draggedDayId).toBeNull();
    }
    // Closed during the drag, then the drag ends: stays closed and clean.
    expect(run([open, dragFromDrawer, close, { type: "dragEnd", outcome: "cancelled" }])).toEqual(CLOSED_DRAWER);
  });

  it("ignores drags that do not start in the open drawer", () => {
    const opened = run([open]);
    expect(drawerReducer(opened, { type: "dragStart", dayId: "day-2", source: "grid" })).toBe(opened);
    expect(drawerReducer(CLOSED_DRAWER, dragFromDrawer)).toBe(CLOSED_DRAWER);
    expect(drawerReducer(opened, { type: "dragEnd", outcome: "dropped" })).toBe(opened);
  });
});
