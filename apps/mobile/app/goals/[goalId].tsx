import { isPeriodGoalResponse } from "@dayflow/api-client";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { DayRow } from "@/components/day-row";
import { GoalListRow } from "@/components/goal-list-row";
import { useDays, useUpdateDay } from "@/features/days/day-queries";
import { doneToggleRequest, sortDays } from "@/features/days/day-values";
import {
  CHILD_TYPE,
  GOAL_TYPE_LABEL,
  childrenOf,
  formatRate,
  goalPath,
  goalPeriodLabel,
  isCurrentGoal,
  periodRangeLabel,
  summarizeGoal,
  yearFlowStages,
} from "@/features/goals/goal-helpers";
import { useGoal, useGoals } from "@/features/goals/goal-queries";
import { ApiError } from "@/lib/api-error";
import { PeriodGoalDetail } from "@/screens/period-goal-detail";
import { koreanShortDate } from "@/lib/dates";
import { goalCalendarParams } from "@/features/navigation/app-routes";
import { useOpenScreen } from "@/features/navigation/use-open-screen";
import { useToday } from "@/lib/use-today";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, ErrorState, layout, ListRow, LoadingState, ProgressBar, Screen, SectionHeader, useTextStyles } from "@/ui/components";


/** One Goal and its direct children (drill-down). A WEEK Goal lists its Days instead. */
export default function GoalDetailScreen() {
  const text = useTextStyles();
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const router = useRouter();
  const openScreen = useOpenScreen();
  const today = useToday();
  const goalQuery = useGoal(goalId);
  const goalsQuery = useGoals();
  const daysQuery = useDays();
  const updateDay = useUpdateDay();

  // The Goal is loaded by id first: a PERIOD Goal has its own detail, and another user's Goal is a 404.
  if (goalQuery.isPending) {
    return (
      <Screen>
        <LoadingState label="목표를 불러오는 중…" />
      </Screen>
    );
  }
  if (goalQuery.isError && !(goalQuery.error instanceof ApiError && goalQuery.error.status === 404)) {
    return (
      <Screen>
        <ErrorState error={goalQuery.error} onRetry={() => void goalQuery.refetch()} />
      </Screen>
    );
  }
  if (goalQuery.data && isPeriodGoalResponse(goalQuery.data)) {
    return <PeriodGoalDetail goal={goalQuery.data} today={today} />;
  }
  if (goalsQuery.isPending) {
    return (
      <Screen>
        <LoadingState label="목표를 불러오는 중…" />
      </Screen>
    );
  }
  if (goalsQuery.isError) {
    return (
      <Screen>
        <ErrorState error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
      </Screen>
    );
  }
  const goals = goalsQuery.data;
  const goal = goals.find((candidate) => candidate.id === goalId);
  if (!goal) {
    return (
      <Screen>
        <EmptyState>목표를 찾을 수 없어요. 이미 삭제되었을 수 있어요.</EmptyState>
      </Screen>
    );
  }

  const path = goalPath(goals, goal);
  const calendarParams = goalCalendarParams(goal, today);
  const summary = daysQuery.data ? summarizeGoal(goals, daysQuery.data, goal.id) : null;
  const childType = CHILD_TYPE[goal.type];
  const weekDays = goal.type === "WEEK" ? sortDays((daysQuery.data ?? []).filter((day) => day.goalId === goal.id)) : [];

  return (
    <Screen refreshing={goalsQuery.isRefetching} onRefresh={() => void goalsQuery.refetch()}>
      <Stack.Screen options={{ title: `${GOAL_TYPE_LABEL[goal.type]} 목표` }} />
      {path.length > 1 ? (
        <ChipRow>
          {path.slice(0, -1).map((ancestor) => (
            <Chip
              key={ancestor.id}
              label={`${goalPeriodLabel(ancestor)} ${ancestor.title}`}
              onPress={() => router.navigate({ pathname: "/goals/[goalId]", params: { goalId: ancestor.id } })}
            />
          ))}
        </ChipRow>
      ) : null}

      <Card>
        <View style={layout.rowWrap}>
          <Badge label={GOAL_TYPE_LABEL[goal.type]} />
          <Badge label={goalPeriodLabel(goal, goal.type !== "YEAR")} soft />
          {isCurrentGoal(goal, today) ? <Badge label="진행 중" color="#2a927f" /> : null}
        </View>
        <Text style={text.heading}>{goal.title}</Text>
        {goal.why ? <Text style={text.body}>Why · {goal.why}</Text> : null}
        <Text style={text.muted}>
          {periodRangeLabel(goal)} · 우선순위 {goal.priority}
        </Text>
        {goal.progressPolicy === "MANUAL" ? (
          <Text style={text.muted}>수동 진행률 · 아직 입력된 값이 없어요</Text>
        ) : (
          <>
            <View style={layout.spaceBetween}>
              <Text style={text.muted}>
                완료 Day {summary?.done ?? 0}/{summary ? summary.total - summary.skipped : 0}
              </Text>
              <Text style={text.strong}>{formatRate(summary?.completionRate ?? null)}</Text>
            </View>
            <ProgressBar rate={summary?.completionRate ?? null} />
          </>
        )}
        {calendarParams ? <Button label="이 기간 Calendar 보기" variant="secondary" small onPress={() => openScreen("calendar", calendarParams)} /> : null}
      </Card>

      {goal.type === "WEEK" ? (
        <Card>
          <SectionHeader
            title="이번 주 Days"
            subtitle="이 주간 목표에 연결된 Day"
            action={<Button label="+ Day" small onPress={() => router.push({ pathname: "/days/edit", params: { goalId: goal.id, date: isCurrentGoal(goal, today) ? today : goal.startDate } })} />}
          />
          {updateDay.error ? <ErrorState error={updateDay.error} /> : null}
          {daysQuery.isPending ? (
            <LoadingState />
          ) : weekDays.length === 0 ? (
            <EmptyState>아직 연결된 Day가 없어요.</EmptyState>
          ) : (
            weekDays.map((day) => (
              <DayRow
                key={day.id}
                day={day}
                goalLine={null}
                toggling={updateDay.isPending && updateDay.variables?.dayId === day.id}
                onToggle={() => updateDay.mutate({ dayId: day.id, body: doneToggleRequest(day) })}
                onPress={() => router.push({ pathname: "/days/edit", params: { dayId: day.id } })}
              />
            ))
          )}
        </Card>
      ) : (
        <Card>
          <SectionHeader title={`${childType ? GOAL_TYPE_LABEL[childType] : ""} 목표`} subtitle="눌러서 한 단계씩 들어가요" />
          {childrenOf(goals, goal.id).length === 0 ? (
            <EmptyState>아직 하위 목표가 없어요.</EmptyState>
          ) : (
            childrenOf(goals, goal.id).map((child) => (
              <GoalListRow
                key={child.id}
                goal={child}
                goals={goals}
                days={daysQuery.data}
                current={isCurrentGoal(child, today)}
                onPress={() => router.push({ pathname: "/goals/[goalId]", params: { goalId: child.id } })}
              />
            ))
          )}
        </Card>
      )}

      {goal.type === "YEAR" ? (
        <Card>
          <SectionHeader title="전체 흐름" subtitle="분기 → 월간 → 주간" />
          {yearFlowStages(goals, goal.id).map((stage) => (
            <View key={stage.type} style={{ gap: 4 }}>
              <Text style={text.strong}>
                {GOAL_TYPE_LABEL[stage.type]} · {stage.goals.length}개
              </Text>
              {stage.goals.length === 0 ? (
                <Text style={text.muted}>아직 없어요</Text>
              ) : (
                stage.goals.map((entry) => (
                  <ListRow key={entry.id} onPress={() => router.push({ pathname: "/goals/[goalId]", params: { goalId: entry.id } })} accessibilityLabel={`${entry.title} 열기`}>
                    <Text style={[text.muted, { width: 72 }]}>{goalPeriodLabel(entry)}</Text>
                    <Text style={[text.body, layout.flex]} numberOfLines={1}>
                      {entry.title}
                    </Text>
                  </ListRow>
                ))
              )}
            </View>
          ))}
          <Text style={text.muted}>기준일 {koreanShortDate(today)}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
