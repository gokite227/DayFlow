import type { DayResponse, EventOccurrenceResponse, GoalResponse } from "@dayflow/api-client";
import { Pressable, ScrollView, Text, View } from "react-native";
import { DayRow } from "@/components/day-row";
import { EventRow } from "@/components/event-row";
import { dayGoalLine, describeDaySchedule } from "@/features/days/day-values";
import { describeOccurrenceTime } from "@/features/events/event-display";
import { koreanShortDate, WEEKDAYS_KR, weekdayIndex } from "@/lib/dates";
import { EmptyState, useTextStyles } from "@/ui/components";
import { fontSize, makeStyles, radius, spacing, usePalette } from "@/ui/theme";
import { monthEnd, monthStart, type CalendarContent } from "./calendar-grid";
import { hasEventsInMonth, monthCellSummary, monthListEmptyMessage, monthListItems } from "./calendar-month";

/**
 * 월 on mobile: a compact month grid (dots for Events, a count for Days) and, under it, the selected date's
 * Events and Days as readable rows. Tapping a date selects it. No drag or resize here: dates are changed in
 * the day / 3-day / week views.
 */
export function MonthView({
  dates,
  selectedDate,
  today,
  content,
  days,
  occurrences,
  goalsById,
  onSelectDate,
  onOpenDay,
  onOpenEvent,
}: {
  dates: string[];
  selectedDate: string;
  today: string;
  content: CalendarContent;
  days: readonly DayResponse[];
  occurrences: readonly EventOccurrenceResponse[];
  goalsById: ReadonlyMap<string, GoalResponse>;
  onSelectDate: (date: string) => void;
  onOpenDay: (day: DayResponse) => void;
  onOpenEvent: (occurrence: EventOccurrenceResponse) => void;
}) {
  const styles = useStyles();
  const text = useTextStyles();
  const palette = usePalette();
  const month = selectedDate.slice(0, 7);
  const weeks = Array.from({ length: Math.ceil(dates.length / 7) }, (_, index) => dates.slice(index * 7, index * 7 + 7));
  const items = monthListItems(selectedDate, days, occurrences);
  const noEventsThisMonth = content === "events" && !hasEventsInMonth(occurrences, monthStart(selectedDate), monthEnd(selectedDate));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.weekdays}>
        {dates.slice(0, 7).map((date) => (
          <Text key={date} style={styles.weekday}>
            {WEEKDAYS_KR[weekdayIndex(date)]}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={styles.week}>
          {week.map((date) => {
            const summary = monthCellSummary(date, days, occurrences);
            const selected = date === selectedDate;
            const outside = !date.startsWith(month);
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${koreanShortDate(date)} 일정 ${summary.eventCount}개${content === "all" ? `, Day ${summary.dayCount}개` : ""}`}
                onPress={() => onSelectDate(date)}
                style={[styles.cell, selected && styles.cellSelected]}
              >
                <View style={[styles.dateBadge, date === today && styles.dateBadgeToday]}>
                  <Text style={[styles.dateText, outside && styles.outsideText, date === today && styles.todayText]}>{Number(date.slice(8, 10))}</Text>
                </View>
                <View style={styles.dots}>
                  {summary.eventColors.map((color) => (
                    <View key={color} style={[styles.dot, { backgroundColor: color }, outside && { opacity: 0.5 }]} />
                  ))}
                </View>
                {content === "all" && summary.dayCount > 0 ? <Text style={[styles.dayCount, outside && styles.outsideText]}>Day {summary.dayCount}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      {noEventsThisMonth ? <Text style={[text.muted, styles.note]}>이 달에 일정이 없어요.</Text> : null}

      <View style={styles.list}>
        <Text style={text.strong}>{koreanShortDate(selectedDate)}</Text>
        {items.length === 0 ? (
          <EmptyState>{monthListEmptyMessage(content)}</EmptyState>
        ) : (
          items.map((item) =>
            item.kind === "event" ? (
              <EventRow
                key={item.key}
                title={item.occurrence.title}
                category={item.occurrence.category}
                timeLabel={describeOccurrenceTime(item.occurrence)}
                onPress={() => onOpenEvent(item.occurrence)}
              />
            ) : (
              <View key={item.key} style={[styles.dayItem, { borderLeftColor: palette.accent2 }]}>
                <DayRow day={item.day} goalLine={dayGoalLine(item.day, goalsById)} onPress={() => onOpenDay(item.day)} />
                <Text style={[text.muted, styles.dayKind]}>Day · {describeDaySchedule(item.day)}</Text>
              </View>
            ),
          )
        )}
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: 2, paddingBottom: spacing.xl },
  weekdays: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: fontSize.caption - 1, color: c.textSecondary, paddingVertical: 4 },
  week: { flexDirection: "row" },
  cell: { flex: 1, minHeight: 56, alignItems: "center", paddingTop: 4, gap: 2, borderRadius: radius.sm },
  cellSelected: { backgroundColor: c.accentSoft },
  dateBadge: { minWidth: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  dateBadgeToday: { backgroundColor: c.accent },
  dateText: { fontSize: fontSize.caption + 1, fontWeight: "700", color: c.text },
  todayText: { color: c.onAccent },
  outsideText: { color: c.textSecondary, opacity: 0.6 },
  dots: { flexDirection: "row", gap: 3, minHeight: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dayCount: { fontSize: fontSize.caption - 3, color: c.textSecondary },
  note: { textAlign: "center", paddingVertical: spacing.xs },
  list: { gap: spacing.sm, marginTop: spacing.md },
  dayItem: { borderLeftWidth: 3, borderRadius: radius.sm },
  dayKind: { paddingLeft: spacing.md },
}));
