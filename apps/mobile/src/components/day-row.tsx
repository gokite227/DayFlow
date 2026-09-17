import type { DayResponse } from "@dayflow/api-client";
import { Pressable, Text, View } from "react-native";
import { DAY_PRIORITY_LABEL, DAY_STATUS_LABEL, describeDaySchedule } from "@/features/days/day-values";
import { Badge, Checkbox, layout, ListRow, useTextStyles } from "@/ui/components";
import { makeStyles, spacing } from "@/ui/theme";

const PRIORITY_COLOR = { LOW: "#5fb7a5", MEDIUM: "#d7ae3c", HIGH: "#e0527f" } as const;

/**
 * One Day in a list: done toggle, title, core/priority badges, Tags, schedule and — only when the Day has
 * a Goal — its Goal line. Days without a Goal are shown the same way, just without that line (DAY-001).
 */
export function DayRow({
  day,
  goalLine,
  onToggle,
  toggling = false,
  onPress,
  onGoalPress,
  showSchedule = true,
}: {
  day: DayResponse;
  goalLine: string | null;
  onToggle?: () => void;
  toggling?: boolean;
  onPress?: () => void;
  /** Opens the Day's Goal (WEEK or PERIOD detail) from the Goal line. */
  onGoalPress?: () => void;
  showSchedule?: boolean;
}) {
  const styles = useStyles();
  const text = useTextStyles();
  const done = day.status === "DONE";
  return (
    <ListRow onPress={onPress} accessibilityLabel={`${day.title} 열기`} style={day.coreDay ? styles.core : undefined}>
      {onToggle ? <Checkbox checked={done} onPress={onToggle} busy={toggling} label={`${day.title} ${done ? "완료 취소" : "완료"}`} /> : null}
      <View style={[layout.flex, { gap: 3 }]}>
        <View style={layout.rowWrap}>
          <Text style={[text.strong, done && styles.done]} numberOfLines={2}>
            {day.title}
          </Text>
          {day.coreDay ? <Badge label="핵심" /> : null}
          {day.priority !== "NONE" ? <Badge label={DAY_PRIORITY_LABEL[day.priority]} color={PRIORITY_COLOR[day.priority as keyof typeof PRIORITY_COLOR]} /> : null}
        </View>
        {showSchedule ? (
          <Text style={text.muted}>
            {describeDaySchedule(day)}
            {day.status !== "NOT_STARTED" && day.status !== "DONE" ? ` · ${DAY_STATUS_LABEL[day.status]}` : ""}
          </Text>
        ) : null}
        {goalLine && onGoalPress ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`${goalLine} 목표 열기`} onPress={onGoalPress} hitSlop={6} style={styles.goalLink}>
            <Text style={[text.muted, styles.goalLinkText]} numberOfLines={1}>
              🎯 {goalLine} ›
            </Text>
          </Pressable>
        ) : goalLine ? (
          <Text style={text.muted} numberOfLines={1}>
            🎯 {goalLine}
          </Text>
        ) : null}
        {day.tags.length > 0 ? (
          <View style={layout.rowWrap}>
            {day.tags.map((tag) => (
              <View key={tag.id} style={styles.tag}>
                <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
                <Text style={text.muted}>{tag.name}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </ListRow>
  );
}

const useStyles = makeStyles((palette) => ({
  core: { backgroundColor: palette.accentSoft },
  done: { color: palette.textSecondary, textDecorationLine: "line-through" },
  goalLink: { alignSelf: "flex-start", minHeight: 24, justifyContent: "center" },
  goalLinkText: { color: palette.accent },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingRight: spacing.xs },
  tagDot: { width: 7, height: 7, borderRadius: 4 },
}));