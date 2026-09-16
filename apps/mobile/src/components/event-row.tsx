import type { EventCategorySummary } from "@dayflow/api-client";
import { Pressable, Text, View } from "react-native";
import { categoryColors, categoryLabel } from "@/features/events/event-display";
import { layout, useTextStyles } from "@/ui/components";
import { TOUCH_TARGET, fontSize, makeStyles, radius, spacing, useAppTheme, withAlpha } from "@/ui/theme";

/** An Event card: a solid Category-colored bar and label, so it never reads as a Day (EVT-006). */
export function EventRow({
  title,
  category,
  timeLabel,
  detail,
  onPress,
  muted = false,
}: {
  title: string;
  category: EventCategorySummary | null;
  timeLabel: string;
  detail?: string | null;
  onPress: () => void;
  muted?: boolean;
}) {
  const styles = useStyles();
  const text = useTextStyles();
  const { scheme } = useAppTheme();
  const { color, soft: lightSoft } = categoryColors(category);
  const soft = scheme === "dark" ? withAlpha(color, 0.22) : lightSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${categoryLabel(category)} 일정 ${title}, ${timeLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderLeftColor: color }, pressed && { backgroundColor: soft }, muted && { opacity: 0.6 }]}
    >
      <View style={[layout.flex, { gap: 3 }]}>
        <View style={layout.row}>
          <View style={[styles.label, { backgroundColor: color }]}>
            <Text style={styles.labelText} numberOfLines={1}>
              {categoryLabel(category)}
            </Text>
          </View>
          <Text style={[text.strong, layout.flex]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        <Text style={[styles.time, { color }]}>{timeLabel}</Text>
        {detail ? <Text style={text.muted}>{detail}</Text> : null}
      </View>
      <Text style={text.muted}>›</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((palette) => ({
  row: {
    minHeight: TOUCH_TARGET + 16,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    borderLeftWidth: 5,
    backgroundColor: palette.surface,
  },
  label: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, maxWidth: 110 },
  labelText: { color: "#ffffff", fontSize: fontSize.caption - 1, fontWeight: "800" },
  time: { fontSize: fontSize.caption + 1, fontWeight: "700" },
}));