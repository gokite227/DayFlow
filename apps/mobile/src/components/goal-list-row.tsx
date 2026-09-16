import type { DayResponse, GoalResponse } from "@dayflow/api-client";
import { Text, View } from "react-native";
import { formatRate, goalPath, goalPeriodLabel, periodRangeLabel, summarizeGoal } from "@/features/goals/goal-helpers";
import { Badge, layout, ListRow, ProgressBar, useTextStyles } from "@/ui/components";
export function GoalListRow({
  goal,
  goals,
  days,
  current,
  onPress,
}: {
  goal: GoalResponse;
  goals: GoalResponse[];
  days: DayResponse[] | undefined;
  current: boolean;
  onPress: () => void;
}) {
  const text = useTextStyles();
  const summary = days ? summarizeGoal(goals, days, goal.id) : null;
  const context = goalPath(goals, goal)
    .slice(0, -1)
    .map((ancestor) => ancestor.title)
    .join(" › ");
  return (
    <ListRow onPress={onPress} accessibilityLabel={`${goal.title} 목표 열기`}>
      <View style={[layout.flex, { gap: 4 }]}>
        <View style={layout.rowWrap}>
          <Badge label={goalPeriodLabel(goal, goal.type !== "YEAR")} soft />
          {current ? <Badge label="진행 중" color="#2a927f" /> : null}
        </View>
        <Text style={text.strong}>{goal.title}</Text>
        {context ? (
          <Text style={text.muted} numberOfLines={1}>
            {context}
          </Text>
        ) : null}
        <View style={layout.spaceBetween}>
          <Text style={text.muted}>{periodRangeLabel(goal)}</Text>
          <Text style={text.muted}>{goal.progressPolicy === "MANUAL" ? "수동 진행률" : formatRate(summary?.completionRate ?? null)}</Text>
        </View>
        {goal.progressPolicy === "AUTO" ? <ProgressBar rate={summary?.completionRate ?? null} /> : null}
      </View>
      <Text style={text.muted}>›</Text>
    </ListRow>
  );
}