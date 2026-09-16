/**
 * Side-by-side layout for blocks that overlap in one day column (CAL-004). Day blocks and Event
 * blocks use the same calculation. Items that overlap directly or through a chain share a group;
 * each item gets the first free lane, and every item in a group is as wide as 1 / group lanes.
 */
export interface LayoutItem {
  key: string;
  /** Minutes from midnight. */
  start: number;
  end: number;
}

export interface LayoutSlot {
  lane: number;
  lanes: number;
}

export function layoutOverlaps(items: readonly LayoutItem[]): Map<string, LayoutSlot> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end || a.key.localeCompare(b.key));
  const result = new Map<string, LayoutSlot>();
  let group: { key: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = () => {
    for (const member of group) result.set(member.key, { lane: member.lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= groupEnd) {
      closeGroup();
      groupEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    group.push({ key: item.key, lane });
    groupEnd = Math.max(groupEnd, item.end);
  }
  closeGroup();
  return result;
}
