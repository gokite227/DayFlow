import type { DayResponse, EventOccurrenceResponse, GoalResponse } from "@dayflow/api-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type RefObject } from "react";
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import { ScrollView as GestureScrollView } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import {
  CALENDAR_CONTENTS,
  CALENDAR_CONTENT_LABEL,
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABEL,
  HOUR_HEIGHT,
  MINUTES_PER_DAY,
  clamp,
  columnPlacement,
  contentDays,
  dateOnlyItems,
  describeDropAction,
  initialScrollY,
  parseCalendarContent,
  parseCalendarView,
  planDrop,
  resolveDrop,
  selectedDateFromParam,
  shiftViewDate,
  unscheduledDays,
  viewDates,
  viewRangeLabel,
  type CalendarContent,
  type CalendarView,
  type DropAction,
  type DropGeometry,
  type Rect,
} from "@/features/calendar/calendar-grid";
import { createHoverStore, useHover, type CalendarDragController, type HoverStore } from "@/features/calendar/calendar-drag";
import {
  AllDayEventChip,
  DateOnlyDayChip,
  DayBlock,
  DragGhost,
  EventBlock,
  NowLine,
  UnscheduledDrawer,
  type ScrollRefs,
} from "@/features/calendar/calendar-parts";
import { MonthView } from "@/features/calendar/month-view";
import { CLOSED_DRAWER, drawerReducer } from "@/features/calendar/unscheduled-drawer";
import { useCalendarDayActions } from "@/features/calendar/use-calendar-day-actions";
import { useDays } from "@/features/days/day-queries";
import { useEventOccurrences } from "@/features/events/event-queries";
import { useGoals, usePeriodGoals } from "@/features/goals/goal-queries";
import { useSettings } from "@/features/settings/settings-provider";
import { WEEKDAYS_KR, weekdayIndex } from "@/lib/dates";
import { useNowMinutes, useToday } from "@/lib/use-today";
import { ErrorState } from "@/ui/components";
import { TOUCH_TARGET, fontSize, makeStyles, radius, spacing, withAlpha } from "@/ui/theme";

const GUTTER_WIDTH = 44;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DATE_ONLY_VISIBLE = 3;
const DATE_ONLY_ITEM_HEIGHT = 25;
const AUTO_SCROLL_EDGE = 40;
const AUTO_SCROLL_STEP = 12;

type GeometryKey = "root" | "grid" | "dateOnly" | "unscheduled";

/**
 * CAL-001..006 on mobile: a time grid for 하루 / 3일 / 주 with the date-only row on top, the "날짜 없음"
 * drawer on the right, long-press drag for Days, a resize handle, and tap-only Events.
 */
export default function CalendarScreen() {
  const styles = useStyles();
  const today = useToday();
  const nowMinutes = useNowMinutes();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; view?: string; content?: string }>();
  const { settings } = useSettings();

  // View, date and content follow the link that opened the Calendar (a Goal, the Events screen) until the user
  // picks another one here; they are not persisted, like the view and date always were.
  const [pickedView, setPickedView] = useState<{ param: string | undefined; view: CalendarView } | null>(null);
  const view: CalendarView = pickedView !== null && pickedView.param === params.view ? pickedView.view : parseCalendarView(params.view);
  const [pickedContent, setPickedContent] = useState<{ param: string | undefined; content: CalendarContent } | null>(null);
  const content: CalendarContent =
    pickedContent !== null && pickedContent.param === params.content ? pickedContent.content : parseCalendarContent(params.content);
  // A date chosen here belongs to the current ?date= link; opening another link (e.g. from a Goal) starts there.
  const [picked, setPicked] = useState<{ param: string | undefined; date: string } | null>(null);
  const date = picked !== null && picked.param === params.date ? picked.date : selectedDateFromParam(params.date, today);
  const setDate = (next: string) => setPicked({ param: params.date, date: next });
  const setView = (next: CalendarView) => setPickedView({ param: params.view, view: next });

  const dates = useMemo(() => viewDates(view, date, settings.calendarWeekStart), [view, date, settings.calendarWeekStart]);
  const rangeStart = dates[0]!;
  const rangeEnd = dates[dates.length - 1]!;
  // One full Day list feeds the grid, the date-only row and the drawer, so an optimistic drop updates all three.
  const daysQuery = useDays();
  const occurrencesQuery = useEventOccurrences(rangeStart, rangeEnd);
  const goalsQuery = useGoals();
  const periodGoalsQuery = usePeriodGoals();
  const goalsById = useMemo(
    () => new Map<string, GoalResponse>([...(goalsQuery.data ?? []), ...(periodGoalsQuery.data ?? [])].map((goal) => [goal.id, goal])),
    [goalsQuery.data, periodGoalsQuery.data],
  );
  const actions = useCalendarDayActions((day) => (day.goalId === null ? undefined : goalsById.get(day.goalId)));

  // 일정만: no Day reaches the grid, the date-only row, the month or the drawer (nothing hidden stays interactive).
  const days = useMemo(() => contentDays(daysQuery.data ?? [], content), [daysQuery.data, content]);
  const occurrences = useMemo(() => occurrencesQuery.data ?? [], [occurrencesQuery.data]);
  const unscheduled = useMemo(() => unscheduledDays(days), [days]);

  const [width, setWidth] = useState(0);
  const available = Math.max(width - GUTTER_WIDTH, 1);
  const columnWidth = view === "day" ? available : view === "3day" ? available / 3 : available / 7 >= 90 ? available / 7 : available / 3.5;
  const contentWidth = columnWidth * dates.length;

  const [drawer, dispatchDrawer] = useReducer(drawerReducer, CLOSED_DRAWER);
  const openUnscheduledDrawer = useCallback(() => dispatchDrawer({ type: "open" }), []);
  /** The only way the drawer closes (X, backdrop, swipe, opening a Day); also clears any drag-hidden state. */
  const closeUnscheduledDrawer = useCallback(() => dispatchDrawer({ type: "close" }), []);
  const [ghost, setGhost] = useState<{ dayId: string; title: string; width: number; height: number } | null>(null);
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);
  const hoverStore = useMemo(() => createHoverStore(), []);

  const rootRef = useRef<View>(null);
  const gridViewportRef = useRef<View>(null);
  const dateOnlyRowRef = useRef<View>(null);
  const unscheduledButtonRef = useRef<View>(null);
  const verticalRef = useRef<GestureScrollView>(null);
  const horizontalRef = useRef<GestureScrollView>(null);
  const drawerListRef = useRef<GestureScrollView>(null);
  const headerScrollRef = useRef<ScrollView>(null);
  const dateOnlyScrollRef = useRef<ScrollView>(null);
  const scrollRefs = useMemo<ScrollRefs>(() => [verticalRef, horizontalRef], []);
  const rects = useRef<Record<GeometryKey, Rect | null>>({ root: null, grid: null, dateOnly: null, unscheduled: null });
  const scroll = useRef({ x: 0, y: 0 });
  const drag = useRef<{ day: DayResponse; touchX: number; touchY: number; lastX: number; lastY: number } | null>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const didInitialScroll = useRef(false);

  // Values the stable drag controller reads at gesture time.
  const latest = useRef({ dates, columnWidth, contentWidth, view, apply: actions.apply });
  useEffect(() => {
    latest.current = { dates, columnWidth, contentWidth, view, apply: actions.apply };
  });

  const measure = useCallback((ref: RefObject<View | null>, key: GeometryKey) => {
    ref.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      rects.current[key] = { x, y, width: measuredWidth, height: measuredHeight };
    });
  }, []);
  const measureAll = useCallback(() => {
    measure(rootRef, "root");
    measure(gridViewportRef, "grid");
    measure(dateOnlyRowRef, "dateOnly");
    measure(unscheduledButtonRef, "unscheduled");
  }, [measure]);

  const controller = useMemo<CalendarDragController>(() => {
    const geometry = (): DropGeometry => ({
      dates: latest.current.dates,
      grid: rects.current.grid,
      dateOnly: rects.current.dateOnly,
      unscheduled: rects.current.unscheduled ? [rects.current.unscheduled] : [],
      gutterWidth: GUTTER_WIDTH,
      columnWidth: latest.current.columnWidth,
      scrollX: scroll.current.x,
      scrollY: scroll.current.y,
      hourHeight: HOUR_HEIGHT,
    });
    const resolve = (x: number, y: number): DropAction | undefined => {
      const current = drag.current;
      if (!current) return undefined;
      const resolved = resolveDrop({ x, y }, y - current.touchY, geometry());
      return resolved ? planDrop(current.day, resolved.target, resolved.offsetPx) : undefined;
    };
    const hover = (x: number, y: number) => {
      const current = drag.current;
      if (!current) return;
      const resolved = resolveDrop({ x, y }, y - current.touchY, geometry());
      hoverStore.set({
        label: resolved ? describeDropAction(planDrop(current.day, resolved.target, resolved.offsetPx), current.day) : null,
        overUnscheduled: resolved?.target.kind === "unscheduled",
      });
    };
    const place = (x: number, y: number) => {
      const current = drag.current;
      const root = rects.current.root;
      if (!current) return;
      ghostX.set(x - current.touchX - (root?.x ?? 0));
      ghostY.set(y - current.touchY - (root?.y ?? 0));
    };
    const stopAutoScroll = () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    };
    // While the finger rests near an edge of the time grid, scroll so any hour or day can be reached.
    const autoScrollTick = () => {
      const current = drag.current;
      const grid = rects.current.grid;
      if (!current || !grid) return;
      const insideX = current.lastX >= grid.x && current.lastX <= grid.x + grid.width;
      const insideY = current.lastY >= grid.y && current.lastY <= grid.y + grid.height;
      if (!insideX || !insideY) return;
      let dy = 0;
      if (current.lastY < grid.y + AUTO_SCROLL_EDGE) dy = -AUTO_SCROLL_STEP;
      else if (current.lastY > grid.y + grid.height - AUTO_SCROLL_EDGE) dy = AUTO_SCROLL_STEP;
      let dx = 0;
      if (latest.current.view === "week") {
        if (current.lastX < grid.x + GUTTER_WIDTH + AUTO_SCROLL_EDGE) dx = -AUTO_SCROLL_STEP;
        else if (current.lastX > grid.x + grid.width - AUTO_SCROLL_EDGE) dx = AUTO_SCROLL_STEP;
      }
      if (dy !== 0) {
        const nextY = clamp(scroll.current.y + dy, 0, Math.max(24 * HOUR_HEIGHT - grid.height, 0));
        if (nextY !== scroll.current.y) {
          scroll.current.y = nextY;
          verticalRef.current?.scrollTo({ y: nextY, animated: false });
        }
      }
      if (dx !== 0) {
        const nextX = clamp(scroll.current.x + dx, 0, Math.max(latest.current.contentWidth - (grid.width - GUTTER_WIDTH), 0));
        if (nextX !== scroll.current.x) {
          scroll.current.x = nextX;
          horizontalRef.current?.scrollTo({ x: nextX, animated: false });
        }
      }
      if (dx !== 0 || dy !== 0) hover(current.lastX, current.lastY);
    };

    return {
      begin: (day, source, touch, size) => {
        measureAll();
        drag.current = {
          day,
          touchX: source === "grid" ? clamp(touch.x, 0, size.width) : Math.min(touch.x, 24),
          touchY: source === "grid" ? clamp(touch.y, 0, size.height) : 12,
          lastX: touch.absoluteX,
          lastY: touch.absoluteY,
        };
        setGhost({ dayId: day.id, title: day.title, width: size.width, height: size.height });
        dispatchDrawer({ type: "dragStart", dayId: day.id, source });
        place(touch.absoluteX, touch.absoluteY);
        hover(touch.absoluteX, touch.absoluteY);
        stopAutoScroll();
        autoScrollTimer.current = setInterval(autoScrollTick, 16);
      },
      move: (x, y) => {
        const current = drag.current;
        if (!current) return;
        current.lastX = x;
        current.lastY = y;
        place(x, y);
        hover(x, y);
      },
      end: (x, y, cancelled) => {
        const current = drag.current;
        if (!current) return;
        stopAutoScroll();
        const action = cancelled ? undefined : resolve(x, y);
        drag.current = null;
        setGhost(null);
        dispatchDrawer({ type: "dragEnd", outcome: action ? "dropped" : "cancelled" });
        hoverStore.set({ label: null, overUnscheduled: false });
        if (action) latest.current.apply(current.day, action);
      },
    };
  }, [ghostX, ghostY, hoverStore, measureAll]);

  useEffect(() => () => {
    if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
  }, []);

  /**
   * Leaving the time grid for good (일정만, or the month view without drop targets) first cancels a running
   * Day drag: the ghost, the hover label and the auto-scroll timer go away and nothing is applied. 일정만 also
   * closes the drawer and clears its drag state, so switching back to 전체 starts clean.
   */
  const cancelActiveDrag = () => {
    if (drag.current) controller.end(drag.current.lastX, drag.current.lastY, true);
  };
  const changeContent = (next: CalendarContent) => {
    if (next === "events") {
      cancelActiveDrag();
      dispatchDrawer({ type: "close" });
    }
    setPickedContent({ param: params.content, content: next });
  };
  const changeView = (next: CalendarView) => {
    // The month view has no drop targets, so the drawer (a drag source) is closed and cannot be opened there.
    if (next === "month") {
      cancelActiveDrag();
      dispatchDrawer({ type: "close" });
    }
    setView(next);
  };

  // Week view scrolls horizontally: keep the selected date (or today) in view when the range changes.
  useEffect(() => {
    const index = Math.max(dates.indexOf(date), 0);
    const x = view === "week" ? index * columnWidth : 0;
    scroll.current.x = x;
    horizontalRef.current?.scrollTo({ x, animated: false });
    headerScrollRef.current?.scrollTo({ x, animated: false });
    dateOnlyScrollRef.current?.scrollTo({ x, animated: false });
  }, [dates, date, view, columnWidth]);

  const scrollToNow = () => {
    const y = initialScrollY(nowMinutes);
    scroll.current.y = y;
    verticalRef.current?.scrollTo({ y, animated: true });
  };

  const onGridLayout = () => {
    measureAll();
    // Only the first time: later the user's own scroll position is kept.
    if (!didInitialScroll.current) {
      didInitialScroll.current = true;
      const y = initialScrollY(nowMinutes);
      scroll.current.y = y;
      requestAnimationFrame(() => verticalRef.current?.scrollTo({ y, animated: false }));
    }
  };

  const openDay = useCallback((day: DayResponse) => router.push({ pathname: "/days/edit", params: { dayId: day.id } }), [router]);
  const openEvent = useCallback(
    (occurrence: EventOccurrenceResponse) =>
      router.push({ pathname: "/events/[eventId]", params: { eventId: occurrence.eventId, occurrence: occurrence.startAt ?? occurrence.startDate ?? "" } }),
    [router],
  );
  const openDayFromDrawer = useCallback(
    (day: DayResponse) => {
      closeUnscheduledDrawer();
      openDay(day);
    },
    [closeUnscheduledDrawer, openDay],
  );
  const resize = useCallback((day: DayResponse, length: number) => actions.resize(day, length), [actions]);

  const topItems = useMemo(() => dates.map((column) => dateOnlyItems(column, days, occurrences)), [dates, days, occurrences]);
  const columns = useMemo(() => dates.map((column) => columnPlacement(column, days, occurrences)), [dates, days, occurrences]);
  const topCount = Math.min(Math.max(...topItems.map((items) => items.allDayEvents.length + items.dateOnlyDays.length), 0), DATE_ONLY_VISIBLE + 1);
  const topHeight = Math.max(topCount, 1) * DATE_ONLY_ITEM_HEIGHT + 8;
  const syncHorizontal = (x: number) => {
    scroll.current.x = x;
    headerScrollRef.current?.scrollTo({ x, animated: false });
    dateOnlyScrollRef.current?.scrollTo({ x, animated: false });
  };

  return (
    <View
      ref={rootRef}
      style={styles.root}
      onLayout={(event: LayoutChangeEvent) => {
        setWidth(event.nativeEvent.layout.width);
        measureAll();
      }}
    >
      <View style={styles.toolbar}>
        <View style={styles.toolbarRow}>
          <ToolbarButton label="‹" accessibilityLabel="이전 기간" onPress={() => setDate(shiftViewDate(view, date, -1))} />
          <Text style={styles.rangeLabel} numberOfLines={1} adjustsFontSizeToFit>
            {viewRangeLabel(view, date, dates)}
          </Text>
          <ToolbarButton label="›" accessibilityLabel="다음 기간" onPress={() => setDate(shiftViewDate(view, date, 1))} />
          <ToolbarButton
            label="오늘"
            accessibilityLabel="오늘로 이동"
            onPress={() => {
              setDate(today);
              scrollToNow();
            }}
          />
        </View>
        <View style={styles.toolbarRow}>
          <View style={styles.viewSwitch} accessibilityRole="radiogroup" accessibilityLabel="기간 보기">
            {CALENDAR_VIEWS.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: value === view }}
                onPress={() => changeView(value)}
                style={[styles.viewOption, value === view && styles.viewOptionSelected]}
              >
                <Text style={[styles.viewText, value === view && styles.viewTextSelected]}>{CALENDAR_VIEW_LABEL[value]}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.viewSwitch} accessibilityRole="radiogroup" accessibilityLabel="표시 내용">
            {CALENDAR_CONTENTS.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: value === content }}
                onPress={() => changeContent(value)}
                style={[styles.contentOption, value === content && styles.viewOptionSelected]}
              >
                <Text style={[styles.viewText, value === content && styles.viewTextSelected]}>{CALENDAR_CONTENT_LABEL[value]}</Text>
              </Pressable>
            ))}
          </View>
          {content === "all" && view !== "month" ? (
            <View ref={unscheduledButtonRef} collapsable={false} onLayout={measureAll} style={{ marginLeft: "auto" }}>
              <UnscheduledButton count={unscheduled.length} hoverStore={hoverStore} onPress={openUnscheduledDrawer} />
            </View>
          ) : null}
        </View>
        {actions.pending || daysQuery.isFetching ? <Text style={styles.saving}>{actions.pending ? "저장 중…" : "불러오는 중…"}</Text> : null}
      </View>

      {actions.problem ? <Text style={styles.problem}>{actions.problem} 날짜를 바꾸지 않았어요.</Text> : null}
      {actions.error ? <ErrorState error={actions.error} onRetry={actions.reset} /> : null}
      {daysQuery.isError ? <ErrorState error={daysQuery.error} onRetry={() => void daysQuery.refetch()} /> : null}
      {occurrencesQuery.isError ? <ErrorState error={occurrencesQuery.error} onRetry={() => void occurrencesQuery.refetch()} /> : null}

      {view === "month" ? (
        <MonthView
          dates={dates}
          selectedDate={date}
          today={today}
          content={content}
          days={days}
          occurrences={occurrences}
          goalsById={goalsById}
          onSelectDate={setDate}
          onOpenDay={openDay}
          onOpenEvent={openEvent}
        />
      ) : (
        <>
      <View style={styles.headerRow}>
        <View style={{ width: GUTTER_WIDTH }} />
        <ScrollView ref={headerScrollRef} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", width: contentWidth }}>
            {dates.map((column) => (
              <Pressable
                key={column}
                accessibilityRole="button"
                accessibilityLabel={`${Number(column.slice(5, 7))}월 ${Number(column.slice(8, 10))}일 하루 보기`}
                onPress={() => {
                  setDate(column);
                  setView("day");
                }}
                style={[styles.headerCell, { width: columnWidth }]}
              >
                <Text style={[styles.weekday, column === today && styles.todayText]}>{WEEKDAYS_KR[weekdayIndex(column)]}</Text>
                <View style={[styles.dayNumber, column === today && styles.dayNumberToday]}>
                  <Text style={[styles.dayNumberText, column === today && styles.dayNumberTodayText]}>{Number(column.slice(8, 10))}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      <View ref={dateOnlyRowRef} collapsable={false} onLayout={measureAll} style={[styles.dateOnlyRow, { height: topHeight }]}>
        <View style={[styles.gutter, { justifyContent: "center" }]}>
          <Text style={styles.gutterLabel}>종일{"\n"}날짜만</Text>
        </View>
        <ScrollView ref={dateOnlyScrollRef} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", width: contentWidth }}>
            {dates.map((column, index) => {
              const items = topItems[index]!;
              const all = items.allDayEvents.length + items.dateOnlyDays.length;
              const eventsShown = items.allDayEvents.slice(0, DATE_ONLY_VISIBLE);
              const daysShown = items.dateOnlyDays.slice(0, Math.max(DATE_ONLY_VISIBLE - eventsShown.length, 0));
              return (
                <View key={column} style={[styles.dateOnlyCell, { width: columnWidth }]}>
                  {eventsShown.map((occurrence, eventIndex) => (
                    <AllDayEventChip key={`${occurrence.eventId}:${eventIndex}`} occurrence={occurrence} onOpen={openEvent} />
                  ))}
                  {daysShown.map((day) => (
                    <DateOnlyDayChip key={day.id} day={day} width={columnWidth - 6} dimmed={ghost?.dayId === day.id} controller={controller} scrollRefs={scrollRefs} onOpen={openDay} />
                  ))}
                  {all > eventsShown.length + daysShown.length ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setDate(column);
                        setView("day");
                      }}
                    >
                      <Text style={styles.more}>+{all - eventsShown.length - daysShown.length}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <View ref={gridViewportRef} collapsable={false} style={styles.gridViewport} onLayout={onGridLayout}>
        <GestureScrollView
          ref={verticalRef}
          scrollEnabled={ghost === null}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scroll.current.y = event.nativeEvent.contentOffset.y;
          }}
        >
          <View style={{ flexDirection: "row", height: 24 * HOUR_HEIGHT }}>
            <View style={styles.gutter}>
              {HOURS.map((hour) => (
                <Text key={hour} style={[styles.hourLabel, { top: hour * HOUR_HEIGHT - 7 }]}>
                  {hour === 0 ? "" : `${String(hour).padStart(2, "0")}:00`}
                </Text>
              ))}
            </View>
            <GestureScrollView
              ref={horizontalRef}
              horizontal
              scrollEnabled={view === "week" && ghost === null}
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(event) => syncHorizontal(event.nativeEvent.contentOffset.x)}
            >
              <View style={{ width: contentWidth, height: 24 * HOUR_HEIGHT }}>
                <GridLines width={contentWidth} columns={dates.length} columnWidth={columnWidth} />
                {dates.map((column, index) => {
                  const placement = columns[index]!;
                  return (
                    <View key={column} style={[styles.column, { left: index * columnWidth, width: columnWidth }, column === today && styles.todayColumn]}>
                      {placement.events.map((event) => (
                        <EventBlock key={event.key} placement={event} slot={placement.slots.get(event.key)} columnWidth={columnWidth} onOpen={openEvent} />
                      ))}
                      {placement.days.map((day) => (
                        <DayBlock
                          key={day.key}
                          placement={day}
                          slot={placement.slots.get(day.key)}
                          columnWidth={columnWidth}
                          dimmed={ghost?.dayId === day.day.id}
                          controller={controller}
                          scrollRefs={scrollRefs}
                          onOpen={openDay}
                          onResize={resize}
                        />
                      ))}
                      {column === today ? <NowLine minutes={clamp(nowMinutes, 0, MINUTES_PER_DAY)} /> : null}
                    </View>
                  );
                })}
              </View>
            </GestureScrollView>
          </View>
        </GestureScrollView>
      </View>
        </>
      )}

      {/* 일정만 has no Days: no drawer at all (its state was already closed and cleared on the switch). */}
      {content === "all" ? (
        <UnscheduledDrawer
          state={drawer}
          days={unscheduled}
          goalsById={goalsById}
          width={Math.min(Math.max(width * 0.84, 260), 380)}
          controller={controller}
          scrollRefs={scrollRefs}
          listRef={drawerListRef}
          onClose={closeUnscheduledDrawer}
          onOpenDay={openDayFromDrawer}
        />
      ) : null}
      <DragGhost ghost={ghost} x={ghostX} y={ghostY} hoverStore={hoverStore} />
    </View>
  );
}

function ToolbarButton({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.toolbarButton, pressed && { opacity: 0.6 }]}>
      <Text style={styles.toolbarButtonText}>{label}</Text>
    </Pressable>
  );
}

/** Opens the drawer; while a Day is dragged it is also the drop zone for "날짜 없음". */
function UnscheduledButton({ count, hoverStore, onPress }: { count: number; hoverStore: HoverStore; onPress: () => void }) {
  const styles = useStyles();
  const { overUnscheduled } = useHover(hoverStore);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`날짜 없음 ${count}개 열기`}
      onPress={onPress}
      style={[styles.unscheduledButton, overUnscheduled && styles.unscheduledButtonActive]}
    >
      <Text style={[styles.unscheduledText, overUnscheduled && styles.unscheduledTextActive]}>날짜 없음 {count}</Text>
    </Pressable>
  );
}

function GridLines({ width, columns, columnWidth }: { width: number; columns: number; columnWidth: number }) {
  const styles = useStyles();
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width, height: 24 * HOUR_HEIGHT }}>
      {HOURS.map((hour) => (
        <View key={`h${hour}`}>
          <View style={[styles.majorLine, { top: hour * HOUR_HEIGHT, width }]} />
          <View style={[styles.minorLine, { top: hour * HOUR_HEIGHT + HOUR_HEIGHT / 2, width }]} />
        </View>
      ))}
      {Array.from({ length: columns }, (_, index) => (
        <View key={`c${index}`} style={[styles.columnLine, { left: index * columnWidth }]} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.background },
  toolbar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs, gap: spacing.xs, backgroundColor: c.background },
  toolbarRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  toolbarButton: {
    minWidth: TOUCH_TARGET - 6,
    height: TOUCH_TARGET - 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarButtonText: { fontSize: fontSize.body, fontWeight: "700", color: c.text },
  rangeLabel: { flex: 1, textAlign: "center", fontSize: fontSize.title, fontWeight: "800", color: c.text },
  viewSwitch: { flexDirection: "row", borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 2, gap: 2 },
  viewOption: { minWidth: 48, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
  viewOptionSelected: { backgroundColor: c.accent },
  contentOption: { minWidth: 52, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
  viewText: { fontSize: fontSize.caption + 1, color: c.text },
  viewTextSelected: { color: c.onAccent, fontWeight: "800" },
  saving: { fontSize: fontSize.caption, color: c.textSecondary },
  problem: { fontSize: fontSize.caption, color: c.danger, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  unscheduledButton: { height: 34, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.accent2, backgroundColor: c.surfaceMuted, justifyContent: "center" },
  unscheduledButtonActive: { backgroundColor: c.accent, borderColor: c.accent },
  unscheduledText: { fontSize: fontSize.caption + 1, fontWeight: "700", color: c.text },
  unscheduledTextActive: { color: c.onAccent },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border },
  headerCell: { alignItems: "center", paddingVertical: 4, gap: 2 },
  weekday: { fontSize: fontSize.caption - 1, color: c.textSecondary },
  todayText: { color: c.accent, fontWeight: "800" },
  dayNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  dayNumberToday: { backgroundColor: c.accent },
  dayNumberText: { fontSize: fontSize.body, fontWeight: "700", color: c.text },
  dayNumberTodayText: { color: c.onAccent },
  dateOnlyRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface },
  dateOnlyCell: { paddingHorizontal: 3, paddingTop: 4, borderLeftWidth: 1, borderLeftColor: c.gridLine },
  more: { fontSize: fontSize.caption - 1, fontWeight: "700", color: c.accent, paddingLeft: 4 },
  gutter: { width: GUTTER_WIDTH },
  gutterLabel: { fontSize: fontSize.caption - 3, color: c.textSecondary, textAlign: "center" },
  hourLabel: { position: "absolute", right: 6, fontSize: fontSize.caption - 2, color: c.textSecondary },
  gridViewport: { flex: 1 },
  column: { position: "absolute", top: 0, bottom: 0 },
  todayColumn: { backgroundColor: withAlpha(c.accentSoft, 0.35) },
  majorLine: { position: "absolute", left: 0, height: 1, backgroundColor: c.gridLine },
  minorLine: { position: "absolute", left: 0, height: 1, backgroundColor: c.gridLineMinor },
  columnLine: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: c.gridLine },
}));
