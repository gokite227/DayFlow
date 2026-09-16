import { describe, expect, it } from "vitest";
import { layoutOverlaps } from "../src/calendar-layout";

describe("CAL-004 overlap layout", () => {
  it("gives a lone block the full width", () => {
    expect(layoutOverlaps([{ key: "a", start: 600, end: 660 }]).get("a")).toEqual({ lane: 0, lanes: 1 });
  });

  it("places a Day and an Event at the same time side by side", () => {
    const slots = layoutOverlaps([
      { key: "day:1", start: 840, end: 960 },
      { key: "event:1", start: 840, end: 900 },
    ]);
    expect(slots.get("day:1")).toEqual({ lane: 0, lanes: 2 });
    expect(slots.get("event:1")).toEqual({ lane: 1, lanes: 2 });
  });

  it("reuses a free lane and shares the lane count within a chained group", () => {
    const slots = layoutOverlaps([
      { key: "a", start: 540, end: 660 },
      { key: "b", start: 600, end: 630 },
      { key: "c", start: 630, end: 700 },
      { key: "later", start: 720, end: 780 },
    ]);
    expect(slots.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(slots.get("b")).toEqual({ lane: 1, lanes: 2 });
    expect(slots.get("c")).toEqual({ lane: 1, lanes: 2 });
    expect(slots.get("later")).toEqual({ lane: 0, lanes: 1 });
  });

  it("does not treat touching blocks as overlapping", () => {
    const slots = layoutOverlaps([
      { key: "a", start: 600, end: 660 },
      { key: "b", start: 660, end: 720 },
    ]);
    expect(slots.get("a")).toEqual({ lane: 0, lanes: 1 });
    expect(slots.get("b")).toEqual({ lane: 0, lanes: 1 });
  });
});
