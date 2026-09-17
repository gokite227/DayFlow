import type { DayResponse, EventOccurrenceResponse, GoalResponse } from "@dayflow/api-client";
import type { LayoutSlot } from "@dayflow/domain";
import { memo, useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector, ScrollView as GestureScrollView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { DAY_PRIORITY_LABEL, dayGoalLine } from "@/features/days/day-values";
import { categoryColors, categoryLabel } from "@/features/events/event-display";
import { Badge, EmptyState } from "@/ui/components";
import { fontSize, makeStyles, radius, spacing, useAppTheme, usePalette, withAlpha } from "@/ui/theme";
import {
  BLOCK_METRICS,
  TIER_CONTENT_HEIGHT,
  blockGeometry,
  blockHeight,
  formatClock,
  nowLineTop,
  resizedLength,
  type ColumnBlockGeometry,
  type TimedDayPlacement,
  type TimedEventPlacement,
} from "./calendar-grid";
import { useHover, type CalendarDragController, type DragSource, type HoverStore } from "./calendar-drag";
import { isDrawerPanelTouchable, isDrawerVisible, type DrawerModel } from "./unscheduled-drawer";

/** Scroll views that must wait while a Day drag or resize decides whether it starts. */
export type ScrollRefs = readonly RefObject<GestureScrollView | null>[];

const DRAG_ACTIVATION_MS = 280;

/**
 * Long press (280ms) then drag moves a Day; a short tap opens it. Scrolling that starts on a Day cancels the
 * long press, so the grid still scrolls normally. Gesture callbacks run on the JS thread and only move the
 * floating block and update the preview label; data changes happen once, on drop.
 */
function useDayGesture(
  day: DayResponse,
  source: DragSource,
  controller: CalendarDragController,
  size: { width: number; height: number },
  scrollRefs: ScrollRefs,
  onTap: () => void,
  /** Extra press area above/below a short grid block (never into a neighbour; see blockGeometry). */
  hitSlopTop = 0,
  hitSlopBottom = 0,
) {
  return useMemo(() => {
    const slop = { top: hitSlopTop, bottom: hitSlopBottom, left: 0, right: 0 };
    const pan = Gesture.Pan()
      .runOnJS(true)
      .hitSlop(slop)
      .activateAfterLongPress(DRAG_ACTIVATION_MS)
      .shouldCancelWhenOutside(false)
      .blocksExternalGesture(...(scrollRefs as RefObject<GestureScrollView>[]))
      .onStart((event) => controller.begin(day, source, event, size))
      .onUpdate((event) => controller.move(event.absoluteX, event.absoluteY))
      .onFinalize((event, success) => controller.end(event.absoluteX, event.absoluteY, !success));
    const tap = Gesture.Tap()
      .runOnJS(true)
      .hitSlop(slop)
      .maxDuration(DRAG_ACTIVATION_MS - 20)
      .onEnd((_event, success) => {
        if (success) onTap();
      });
    return Gesture.Exclusive(pan, tap);
  }, [day, source, controller, size, scrollRefs, onTap, hitSlopTop, hitSlopBottom]);
}

const PRIORITY_TONE = { NONE: null, LOW: "#5fb7a5", MEDIUM: "#d7ae3c", HIGH: "#e0527f" } as const;

export const DayBlock = memo(function DayBlock({
  placement,
  slot,
  geometry,
  columnWidth,
  dimmed,
  controller,
  scrollRefs,
  onOpen,
  onResize,
}: {
  placement: TimedDayPlacement;
  slot: LayoutSlot | undefined;
  geometry: ColumnBlockGeometry;
  columnWidth: number;
  dimmed: boolean;
  controller: CalendarDragController;
  scrollRefs: ScrollRefs;
  onOpen: (day: DayResponse) => void;
  onResize: (day: DayResponse, lengthMinutes: number) => void;
}) {
  const styles = useStyles();
  const palette = usePalette();
  const { day, start, length } = placement;
  const [preview, setPreview] = useState<number | null>(null);
  // While resizing, the drawn size follows the preview (same room rules); the handle keeps its place so the
  // gesture is never unmounted mid-drag.
  const shownGeometry = preview === null ? geometry : blockGeometry(start, preview, Math.max(geometry.roomBelowMinutes, preview), geometry.roomAbovePx);
  const height = useSharedValue(geometry.height);
  const timeHeight = useSharedValue(geometry.timeHeight);
  const origin = useSharedValue(length);
  const lastPreview = useSharedValue<number | null>(null);

  useEffect(() => {
    if (preview !== null) return;
    height.set(geometry.height);
    timeHeight.set(geometry.timeHeight);
  }, [geometry.height, geometry.timeHeight, preview, height, timeHeight]);

  const lanes = slot?.lanes ?? 1;
  const lane = slot?.lane ?? 0;
  const width = columnWidth / lanes - 3;
  const left = (lane / lanes) * columnWidth + 1;
  const size = useMemo(() => ({ width, height: blockHeight(length) }), [width, length]);
  const openDay = useMemo(() => () => onOpen(day), [onOpen, day]);
  const bodyGesture = useDayGesture(day, "grid", controller, size, scrollRefs, openDay, geometry.hitSlop.top, geometry.hitSlop.bottom);
  const handle = geometry.handle;
  const roomBelowMinutes = geometry.roomBelowMinutes;
  const roomAbovePx = geometry.roomAbovePx;

  // Resize: drag the handle; the end snaps to 15 minutes, at least 15 minutes, never past midnight.
  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(2)
        .shouldCancelWhenOutside(false)
        .blocksExternalGesture(...(scrollRefs as RefObject<GestureScrollView>[]))
        .onStart(() => {
          origin.set(length);
          lastPreview.set(length);
          setPreview(length);
        })
        .onUpdate((event) => {
          const next = resizedLength(origin.get(), event.translationY, start);
          const drawn = blockGeometry(start, next, Math.max(roomBelowMinutes, next), roomAbovePx);
          height.set(drawn.height);
          timeHeight.set(drawn.timeHeight);
          if (next !== lastPreview.get()) {
            lastPreview.set(next);
            setPreview(next);
          }
        })
        .onFinalize((event, success) => {
          const next = resizedLength(origin.get(), event.translationY, start);
          lastPreview.set(null);
          setPreview(null);
          if (success && next !== origin.get()) onResize(day, next);
        }),
    [day, length, start, scrollRefs, onResize, height, timeHeight, origin, lastPreview, roomBelowMinutes, roomAbovePx],
  );

  const animatedHeight = useAnimatedStyle(() => ({ height: height.get() }));
  const animatedFill = useAnimatedStyle(() => ({ height: Math.max(timeHeight.get(), 2) }));
  // "below": the handle sits just under the block, in free space, so it never covers the title.
  const animatedHandle = useAnimatedStyle(() => ({ top: geometry.top + height.get() + (handle === "inside" ? -BLOCK_METRICS.handleHeight : 1) }));
  const shown = preview ?? length;
  const tier = shownGeometry.tier;
  const tone = PRIORITY_TONE[day.priority];
  const tag = day.tags[0];
  const end = Math.min(start + shown, 24 * 60);
  const timeText = tier === "range" || (preview !== null && tier === "start") ? `${formatClock(start)}–${formatClock(end)}` : formatClock(start);

  return (
    <>
      <GestureDetector gesture={bodyGesture}>
        <Animated.View
          style={[
            styles.dayBlock,
            { top: geometry.top, left, width },
            geometry.floored && styles.blockFloored,
            day.coreDay && styles.dayBlockCore,
            tone ? { borderLeftColor: tone } : null,
            (dimmed || day.status === "DONE") && { opacity: dimmed ? 0.3 : 0.6 },
            animatedHeight,
          ]}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${day.title} ${formatClock(start)}부터 ${formatClock(end)}까지 ${shown}분. 길게 눌러 옮기기`}
        >
          {/* Only the real duration is filled: a 5-minute block drawn taller does not look like 20 minutes. */}
          {shownGeometry.floored ? <Animated.View pointerEvents="none" style={[styles.dayFill, animatedFill]} /> : null}
          <View style={[styles.blockBody, tier === "tiny" && styles.blockBodyTiny, tier === "range" && styles.blockBodyWithHandle]}>
            <View style={styles.blockTitleRow}>
              {tag && tier !== "tiny" ? <View style={[styles.tagDot, { backgroundColor: tag.color }]} /> : null}
              <Text
                style={[styles.blockTitle, tier === "tiny" && styles.blockTitleTiny, day.status === "DONE" && styles.done]}
                numberOfLines={tier === "range" && shownGeometry.height >= TIER_CONTENT_HEIGHT.range + BLOCK_METRICS.titleLine + BLOCK_METRICS.handleHeight ? 2 : 1}
              >
                {day.title}
              </Text>
            </View>
            {tier === "range" || tier === "start" ? (
              <Text style={[styles.blockTime, preview !== null && { color: palette.accent }]} numberOfLines={1}>
                {timeText}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>
      {handle !== "none" ? (
        <GestureDetector gesture={resizeGesture}>
          <Animated.View
            style={[styles.resizeHandle, { left, width }, animatedHandle, handle === "below" && styles.resizeHandleBelow]}
            accessibilityLabel="종료 시간 조절"
          >
            <View style={styles.resizeGrip} />
          </Animated.View>
        </GestureDetector>
      ) : null}
    </>
  );
});

export const EventBlock = memo(function EventBlock({
  placement,
  slot,
  geometry,
  columnWidth,
  onOpen,
}: {
  placement: TimedEventPlacement;
  slot: LayoutSlot | undefined;
  geometry: ColumnBlockGeometry;
  columnWidth: number;
  onOpen: (occurrence: EventOccurrenceResponse) => void;
}) {
  const styles = useStyles();
  const { scheme } = useAppTheme();
  const { occurrence, start, end, point } = placement;
  const { color, soft } = categoryColors(occurrence.category);
  const lanes = slot?.lanes ?? 1;
  const lane = slot?.lane ?? 0;
  const tier = geometry.tier;
  const fill = scheme === "dark" ? withAlpha(color, 0.22) : soft;
  const range = point ? formatClock(start) : `${formatClock(start)}–${formatClock(end)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${categoryLabel(occurrence.category)} 일정 ${occurrence.title} ${range}`}
      onPress={() => onOpen(occurrence)}
      hitSlop={{ top: geometry.hitSlop.top, bottom: geometry.hitSlop.bottom, left: 0, right: 0 }}
      style={[
        styles.eventBlock,
        {
          top: geometry.top,
          height: geometry.height,
          left: (lane / lanes) * columnWidth + 1,
          width: columnWidth / lanes - 3,
          borderColor: color,
          backgroundColor: geometry.floored ? "transparent" : fill,
        },
      ]}
    >
      {geometry.floored ? <View pointerEvents="none" style={[styles.eventFill, { height: Math.max(geometry.timeHeight, 2), backgroundColor: fill }]} /> : null}
      <View style={[styles.blockBody, tier === "tiny" && styles.blockBodyTiny]}>
        {tier === "range" ? (
          <Text style={[styles.eventLabel, { color }]} numberOfLines={1}>
            {categoryLabel(occurrence.category)} · {range}
          </Text>
        ) : null}
        <Text style={[styles.blockTitle, tier === "tiny" && styles.blockTitleTiny]} numberOfLines={tier === "range" && geometry.height >= TIER_CONTENT_HEIGHT.range + BLOCK_METRICS.titleLine ? 2 : 1}>
          {occurrence.title}
        </Text>
        {tier === "start" ? (
          <Text style={[styles.eventLabel, { color }]} numberOfLines={1}>
            {formatClock(start)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

export function NowLine({ minutes }: { minutes: number }) {
  const styles = useStyles();
  return (
    <View pointerEvents="none" style={[styles.nowLine, { top: nowLineTop(minutes) }]} accessibilityLabel={`현재 시간 ${formatClock(minutes)}`}>
      <View style={styles.nowDot} />
    </View>
  );
}

/** An all-day Event in the top area: a filled Category-colored bar, clearly not a Day. */
export function AllDayEventChip({ occurrence, onOpen }: { occurrence: EventOccurrenceResponse; onOpen: (occurrence: EventOccurrenceResponse) => void }) {
  const styles = useStyles();
  const { color } = categoryColors(occurrence.category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`하루 종일 일정 ${occurrence.title}`}
      onPress={() => onOpen(occurrence)}
      style={[styles.allDayChip, { backgroundColor: color }]}
    >
      <Text style={styles.allDayText} numberOfLines={1}>
        {occurrence.title}
      </Text>
    </Pressable>
  );
}

/** A date-only Day in the top area: Day styling (checkbox ring, priority) and draggable like timed Days. */
export const DateOnlyDayChip = memo(function DateOnlyDayChip({
  day,
  width,
  dimmed,
  controller,
  scrollRefs,
  onOpen,
}: {
  day: DayResponse;
  width: number;
  dimmed: boolean;
  controller: CalendarDragController;
  scrollRefs: ScrollRefs;
  onOpen: (day: DayResponse) => void;
}) {
  const styles = useStyles();
  const size = useMemo(() => ({ width, height: blockHeight(day.estimatedMinutes) }), [width, day.estimatedMinutes]);
  const openDay = useMemo(() => () => onOpen(day), [onOpen, day]);
  const gesture = useDayGesture(day, "dateOnly", controller, size, scrollRefs, openDay);
  const tone = PRIORITY_TONE[day.priority];
  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.dateOnlyChip, dimmed && { opacity: 0.3 }]} accessible accessibilityRole="button" accessibilityLabel={`날짜만 정한 Day ${day.title}. 길게 눌러 옮기기`}>
        <View style={[styles.ring, day.status === "DONE" && styles.ringDone, tone ? { borderColor: tone } : null]} />
        <Text style={[styles.dateOnlyText, day.status === "DONE" && styles.done]} numberOfLines={1}>
          {day.title}
        </Text>
      </View>
    </GestureDetector>
  );
});

/** The floating copy of a dragged Day, with a live preview of the drop result. */
export function DragGhost({
  ghost,
  x,
  y,
  hoverStore,
}: {
  ghost: { title: string; width: number; height: number } | null;
  x: SharedValue<number>;
  y: SharedValue<number>;
  hoverStore: HoverStore;
}) {
  const styles = useStyles();
  const hover = useHover(hoverStore);
  const position = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }] }));
  if (!ghost) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.ghost, { width: Math.max(ghost.width, 120), minHeight: Math.min(Math.max(ghost.height, 36), 120) }, position]}>
      <Text style={styles.ghostTitle} numberOfLines={2}>
        {ghost.title}
      </Text>
      <Text style={styles.ghostLabel} numberOfLines={1}>
        {hover.label ?? "놓을 곳으로 옮겨주세요"}
      </Text>
    </Animated.View>
  );
}

/**
 * "날짜 없음" Days as a right-side overlay (the Web Unscheduled panel). It never narrows the Calendar. While
 * a Day is dragged out of it, the drawer slides away but stays mounted so the gesture keeps tracking.
 *
 * The panel position follows `state` only. The swipe may move it while the finger is down, but it never
 * decides the resting position itself: X, backdrop and swipe all call the same `onClose`.
 */
export function UnscheduledDrawer({
  state,
  days,
  goalsById,
  width,
  controller,
  scrollRefs,
  listRef,
  onClose,
  onOpenDay,
}: {
  state: DrawerModel;
  days: DayResponse[];
  goalsById: ReadonlyMap<string, GoalResponse>;
  width: number;
  controller: CalendarDragController;
  scrollRefs: ScrollRefs;
  listRef: RefObject<GestureScrollView | null>;
  onClose: () => void;
  onOpenDay: (day: DayResponse) => void;
}) {
  const styles = useStyles();
  const visible = isDrawerVisible(state);
  const hiddenOffset = width + 24;
  const offset = useSharedValue(hiddenOffset);
  // Where the panel rests for the current state; read by the swipe instead of assuming "open".
  const restingOffset = useSharedValue(hiddenOffset);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    const target = visible ? 0 : hiddenOffset;
    restingOffset.set(target);
    offset.set(withTiming(target, { duration: 220 }));
    backdrop.set(withTiming(visible ? 1 : 0, { duration: 220 }));
  }, [visible, hiddenOffset, offset, restingOffset, backdrop]);

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .enabled(visible)
        .activeOffsetX(16)
        .failOffsetY([-12, 12])
        .onUpdate((event) => {
          if (restingOffset.get() !== 0) return;
          offset.set(Math.max(0, event.translationX));
        })
        // onEnd, not onFinalize: onFinalize also runs for taps on X and for Day drags that cancel this swipe,
        // and snapping the panel back to "open" there left a visible panel whose state was already closed.
        .onEnd((event, success) => {
          if (success && restingOffset.get() === 0 && (event.translationX > 80 || event.velocityX > 600)) onClose();
          else offset.set(withTiming(restingOffset.get(), { duration: 160 }));
        }),
    [visible, offset, restingOffset, onClose],
  );

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));
  const itemRefs = useMemo<ScrollRefs>(() => [...scrollRefs, listRef], [scrollRefs, listRef]);

  return (
    <View pointerEvents="box-none" style={styles.drawerRoot}>
      <Animated.View pointerEvents={visible ? "auto" : "none"} style={[styles.backdrop, backdropStyle]}>
        <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="날짜 없음 닫기" onPress={onClose} />
      </Animated.View>
      <GestureDetector gesture={swipe}>
        <Animated.View pointerEvents={isDrawerPanelTouchable(state) ? "auto" : "none"} style={[styles.drawer, { width }, panelStyle]}>
          <View style={styles.drawerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.drawerTitle}>날짜 없음 · {days.length}</Text>
              <Text style={styles.drawerHint}>길게 눌러 Calendar의 시간이나 날짜 칸으로 끌어오세요.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="닫기" hitSlop={10} onPress={onClose} style={styles.closeButton}>
              <Text style={styles.drawerTitle}>✕</Text>
            </Pressable>
          </View>
          <GestureScrollView ref={listRef} contentContainerStyle={styles.drawerList}>
            {days.length === 0 ? <EmptyState>날짜 없는 Day가 없어요.</EmptyState> : null}
            {days.map((day) => (
              <DrawerDayItem key={day.id} day={day} goalLine={dayGoalLine(day, goalsById)} controller={controller} scrollRefs={itemRefs} onOpen={onOpenDay} />
            ))}
          </GestureScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const DrawerDayItem = memo(function DrawerDayItem({
  day,
  goalLine,
  controller,
  scrollRefs,
  onOpen,
}: {
  day: DayResponse;
  goalLine: string | null;
  controller: CalendarDragController;
  scrollRefs: ScrollRefs;
  onOpen: (day: DayResponse) => void;
}) {
  const styles = useStyles();
  const size = useMemo(() => ({ width: 160, height: blockHeight(day.estimatedMinutes) }), [day.estimatedMinutes]);
  const openDay = useMemo(() => () => onOpen(day), [onOpen, day]);
  const gesture = useDayGesture(day, "drawer", controller, size, scrollRefs, openDay);
  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.drawerItem} accessible accessibilityRole="button" accessibilityLabel={`${day.title}, ${day.estimatedMinutes}분. 길게 눌러 Calendar로 옮기기`}>
        <Text style={styles.blockTitle} numberOfLines={2}>
          {day.title}
        </Text>
        <Row>
          <Text style={styles.drawerHint}>{day.estimatedMinutes}분</Text>
          {day.priority !== "NONE" ? <Badge label={DAY_PRIORITY_LABEL[day.priority]} soft /> : null}
          {day.coreDay ? <Badge label="핵심" /> : null}
        </Row>
        {goalLine ? (
          <Text style={styles.drawerHint} numberOfLines={1}>
            🎯 {goalLine}
          </Text>
        ) : null}
        {day.tags.length > 0 ? (
          <Row>
            {day.tags.map((tag) => (
              <View key={tag.id} style={styles.tag}>
                <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
                <Text style={styles.drawerHint}>{tag.name}</Text>
              </View>
            ))}
          </Row>
        ) : null}
      </View>
    </GestureDetector>
  );
});

function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>{children}</View>;
}

const useStyles = makeStyles((c) => ({
  dayBlock: {
    position: "absolute",
    borderRadius: 4,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: c.accent2,
    backgroundColor: c.accentSoft,
    overflow: "hidden",
  },
  dayBlockCore: { borderColor: c.accent, borderLeftColor: c.accent },
  /** Drawn taller than the real duration: outlined, with only the real part filled (dayFill / eventFill). */
  blockFloored: { backgroundColor: c.surface },
  dayFill: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: c.accentSoft },
  eventFill: { position: "absolute", top: 0, left: 0, right: 0 },
  blockBody: { flex: 1, paddingHorizontal: 4, paddingVertical: BLOCK_METRICS.padding, overflow: "hidden" },
  blockBodyTiny: { paddingVertical: 0, justifyContent: "center" },
  blockBodyWithHandle: { paddingBottom: BLOCK_METRICS.handleHeight },
  blockTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  blockTitle: { flexShrink: 1, fontSize: fontSize.caption, lineHeight: BLOCK_METRICS.titleLine, fontWeight: "700", color: c.text },
  blockTitleTiny: { fontSize: fontSize.caption - 2, lineHeight: BLOCK_METRICS.tinyTitleLine },
  blockTime: { fontSize: fontSize.caption - 2, lineHeight: BLOCK_METRICS.timeLine, color: c.textSecondary },
  done: { textDecorationLine: "line-through", color: c.textSecondary },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4 },
  resizeHandle: { position: "absolute", height: BLOCK_METRICS.handleHeight, alignItems: "center", justifyContent: "center", zIndex: 2 },
  resizeHandleBelow: { justifyContent: "flex-start" },
  resizeGrip: { width: 22, height: 3, borderRadius: 2, backgroundColor: c.accent2 },
  eventBlock: { position: "absolute", borderRadius: 4, borderWidth: 1, borderLeftWidth: 3, overflow: "hidden" },
  eventLabel: { fontSize: fontSize.caption - 2, lineHeight: BLOCK_METRICS.timeLine, fontWeight: "800" },
  nowLine: { position: "absolute", left: 0, right: 0, height: 2, backgroundColor: c.nowLine, zIndex: 5 },
  nowDot: { position: "absolute", left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: c.nowLine },
  allDayChip: { height: 22, borderRadius: 5, paddingHorizontal: 6, justifyContent: "center", marginBottom: 3 },
  allDayText: { fontSize: fontSize.caption - 1, fontWeight: "800", color: "#ffffff" },
  dateOnlyChip: {
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: c.accent2,
    backgroundColor: c.surface,
    paddingHorizontal: 5,
    marginBottom: 3,
  },
  ring: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: c.accent2 },
  ringDone: { backgroundColor: c.accent, borderColor: c.accent },
  dateOnlyText: { flexShrink: 1, fontSize: fontSize.caption - 1, color: c.text },
  ghost: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 50,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: c.accent,
    backgroundColor: c.surfaceElevated,
    padding: 6,
    gap: 2,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  ghostTitle: { fontSize: fontSize.caption, fontWeight: "700", color: c.text },
  ghostLabel: { fontSize: fontSize.caption - 1, fontWeight: "800", color: c.accent },
  drawerRoot: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.overlay },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: c.surface,
    borderLeftWidth: 1,
    borderLeftColor: c.border,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  drawerHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  drawerTitle: { fontSize: fontSize.title, fontWeight: "800", color: c.text },
  drawerHint: { fontSize: fontSize.caption, color: c.textSecondary },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  drawerList: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  drawerItem: { borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceMuted, padding: spacing.md, gap: 4 },
}));
