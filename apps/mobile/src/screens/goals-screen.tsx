import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native";
import { GoalListRow } from "@/components/goal-list-row";
import { useDays } from "@/features/days/day-queries";
import { GOAL_TYPE_LABEL, GOAL_TYPE_ORDER, goalsOfType, isCurrentGoal, type GoalType } from "@/features/goals/goal-helpers";

import { useGoals } from "@/features/goals/goal-queries";
import { useToday } from "@/lib/use-today";
import { Card, Chip, ChipRow, EmptyState, ErrorState, LoadingState, Screen, useTextStyles } from "@/ui/components";

/** GOAL-005 on mobile: 연간 / 분기 / 월간 / 주간 lists; tapping a Goal drills down into its detail. */
export default function GoalsScreen() {
  const text = useTextStyles();
  const params = useLocalSearchParams<{ type?: string }>();
  const router = useRouter();
  const today = useToday();
  const type: GoalType = (GOAL_TYPE_ORDER as readonly string[]).includes(params.type ?? "") ? (params.type as GoalType) : "YEAR";
  const goalsQuery = useGoals();
  const daysQuery = useDays();

  const goals = goalsQuery.data ?? [];
  const list = goalsOfType(goals, type);

  return (
    <Screen refreshing={goalsQuery.isRefetching} onRefresh={() => void goalsQuery.refetch()}>
      <ChipRow>
        {GOAL_TYPE_ORDER.map((value) => (
          <Chip key={value} label={GOAL_TYPE_LABEL[value]} selected={value === type} onPress={() => router.setParams({ type: value })} />
        ))}
      </ChipRow>
      <Text style={text.muted}>목표 만들기와 기간 수정은 Web Goals 화면에서 할 수 있어요.</Text>
      <Card>
        {goalsQuery.isPending ? (
          <LoadingState label="목표를 불러오는 중…" />
        ) : goalsQuery.isError ? (
          <ErrorState error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState>{GOAL_TYPE_LABEL[type]} 목표가 아직 없어요.</EmptyState>
        ) : (
          list.map((goal) => (
            <GoalListRow
              key={goal.id}
              goal={goal}
              goals={goals}
              days={daysQuery.data}
              current={isCurrentGoal(goal, today)}
              onPress={() => router.push({ pathname: "/goals/[goalId]", params: { goalId: goal.id } })}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}
