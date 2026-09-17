import type { DayResponse, PeriodGoalResponse } from "@dayflow/api-client";
import { periodGoalStatus } from "@dayflow/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { GoalListRow } from "@/components/goal-list-row";
import { useDays } from "@/features/days/day-queries";
import { GOAL_TYPE_LABEL, GOAL_TYPE_ORDER, goalsOfType, isCurrentGoal, periodRangeLabel, type GoalType } from "@/features/goals/goal-helpers";
import { useGoals, usePeriodGoals } from "@/features/goals/goal-queries";
import {
  PERIOD_FILTERS,
  PERIOD_FILTER_LABEL,
  PERIOD_STATUS_COLOR,
  PERIOD_STATUS_LABEL,
  filterPeriodGoals,
  parsePeriodFilter,
  periodCountLabel,
  periodProgressLabel,
  summarizePeriodGoal,
} from "@/features/goals/period-goal-helpers";
import { useToday } from "@/lib/use-today";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, ErrorState, layout, ListRow, LoadingState, ProgressBar, Screen, SectionHeader, useTextStyles } from "@/ui/components";

type GoalsTab = GoalType | "PERIOD";

/**
 * GOAL-005 on mobile: "진행 중인 목표" (running PERIOD Goals) on top, then 연간 / 분기 / 월간 / 주간 lists and the
 * 기간 list. Tapping a Goal drills down into its detail.
 */
export default function GoalsScreen() {
  const text = useTextStyles();
  const params = useLocalSearchParams<{ type?: string; status?: string }>();
  const router = useRouter();
  const today = useToday();
  const tab: GoalsTab =
    params.type === "PERIOD" ? "PERIOD" : (GOAL_TYPE_ORDER as readonly string[]).includes(params.type ?? "") ? (params.type as GoalType) : "YEAR";
  const filter = parsePeriodFilter(params.status);
  const goalsQuery = useGoals();
  const periodGoalsQuery = usePeriodGoals();
  const daysQuery = useDays();

  const goals = goalsQuery.data ?? [];
  const periodGoals = periodGoalsQuery.data ?? [];
  const active = filterPeriodGoals(periodGoals, "ACTIVE", today);
  const openGoal = (goalId: string) => router.push({ pathname: "/goals/[goalId]", params: { goalId } });
  const refresh = () => {
    void goalsQuery.refetch();
    void periodGoalsQuery.refetch();
  };

  return (
    <Screen refreshing={goalsQuery.isRefetching || periodGoalsQuery.isRefetching} onRefresh={refresh}>
      <Card>
        <SectionHeader
          title="진행 중인 목표"
          subtitle="오늘 진행 중인 기간 목표"
          action={<Button label="+ 기간 목표" small onPress={() => router.push("/goals/period-edit")} />}
        />
        {periodGoalsQuery.isPending ? (
          <LoadingState label="기간 목표를 불러오는 중…" />
        ) : periodGoalsQuery.isError ? (
          <ErrorState error={periodGoalsQuery.error} onRetry={() => void periodGoalsQuery.refetch()} />
        ) : active.length === 0 ? (
          <EmptyState>{periodGoals.length === 0 ? "아직 기간 목표가 없어요." : "진행 중인 기간 목표가 없어요."}</EmptyState>
        ) : (
          active.map((goal) => <PeriodGoalRow key={goal.id} goal={goal} days={daysQuery.data} today={today} onPress={() => openGoal(goal.id)} />)
        )}
      </Card>

      <ChipRow>
        {GOAL_TYPE_ORDER.map((value) => (
          <Chip key={value} label={GOAL_TYPE_LABEL[value]} selected={value === tab} onPress={() => router.setParams({ type: value })} />
        ))}
        <Chip label="기간" selected={tab === "PERIOD"} onPress={() => router.setParams({ type: "PERIOD" })} />
      </ChipRow>

      {tab === "PERIOD" ? (
        <>
          <ChipRow>
            {PERIOD_FILTERS.map((value) => (
              <Chip key={value} label={PERIOD_FILTER_LABEL[value]} selected={filter === value} onPress={() => router.setParams({ type: "PERIOD", status: value })} />
            ))}
          </ChipRow>
          <Card>
            {periodGoalsQuery.isPending ? (
              <LoadingState label="기간 목표를 불러오는 중…" />
            ) : periodGoalsQuery.isError ? (
              <ErrorState error={periodGoalsQuery.error} onRetry={() => void periodGoalsQuery.refetch()} />
            ) : periodGoals.length === 0 ? (
              <EmptyState>아직 기간 목표가 없어요.</EmptyState>
            ) : filterPeriodGoals(periodGoals, filter, today).length === 0 ? (
              <EmptyState>{filter === "ACTIVE" ? "진행 중인 기간 목표가 없어요." : `${PERIOD_FILTER_LABEL[filter]} 기간 목표가 없어요.`}</EmptyState>
            ) : (
              filterPeriodGoals(periodGoals, filter, today).map((goal) => (
                <PeriodGoalRow key={goal.id} goal={goal} days={daysQuery.data} today={today} onPress={() => openGoal(goal.id)} />
              ))
            )}
          </Card>
        </>
      ) : (
        <>
          <Text style={text.muted}>계획 목표(연간·분기·월간·주간) 만들기와 기간 수정은 Web Goals 화면에서 할 수 있어요.</Text>
          <Card>
            {goalsQuery.isPending ? (
              <LoadingState label="목표를 불러오는 중…" />
            ) : goalsQuery.isError ? (
              <ErrorState error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
            ) : goalsOfType(goals, tab).length === 0 ? (
              <EmptyState>{GOAL_TYPE_LABEL[tab]} 목표가 아직 없어요.</EmptyState>
            ) : (
              goalsOfType(goals, tab).map((goal) => (
                <GoalListRow key={goal.id} goal={goal} goals={goals} days={daysQuery.data} current={isCurrentGoal(goal, today)} onPress={() => openGoal(goal.id)} />
              ))
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

export function PeriodGoalRow({
  goal,
  days,
  today,
  onPress,
}: {
  goal: PeriodGoalResponse;
  days: DayResponse[] | undefined;
  today: string;
  onPress: () => void;
}) {
  const text = useTextStyles();
  const status = periodGoalStatus(goal, today);
  const summary = days ? summarizePeriodGoal(days, goal.id) : null;
  return (
    <ListRow onPress={onPress} accessibilityLabel={`${goal.title} 기간 목표 열기`}>
      <View style={[layout.flex, { gap: 4 }]}>
        <View style={layout.rowWrap}>
          <Badge label="기간" soft />
          <Badge label={PERIOD_STATUS_LABEL[status]} color={PERIOD_STATUS_COLOR[status]} />
        </View>
        <Text style={text.strong}>{goal.title}</Text>
        <View style={layout.spaceBetween}>
          <Text style={text.muted}>{periodRangeLabel(goal)}</Text>
          <Text style={text.muted}>{summary ? `${periodCountLabel(summary)} · ${periodProgressLabel(summary)}` : "…"}</Text>
        </View>
        <ProgressBar rate={summary?.completionRate ?? 0} />
      </View>
      <Text style={text.muted}>›</Text>
    </ListRow>
  );
}
