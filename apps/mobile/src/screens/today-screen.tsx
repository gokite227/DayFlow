import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { DayRow } from "@/components/day-row";
import { useDays, useUpdateDay } from "@/features/days/day-queries";
import { dayGoalLine, doneToggleRequest } from "@/features/days/day-values";
import { formatRate, goalPeriodLabel, summarizeGoal } from "@/features/goals/goal-helpers";
import { useGoals } from "@/features/goals/goal-queries";
import { useRecoveryCandidates, useRecoveryDays } from "@/features/recovery/recovery-queries";
import { currentWeekGoals, dayGoalPath, todayDays, todayProgress } from "@/features/today/today-helpers";
import { formatKoreanDate, koreanShortDate } from "@/lib/dates";
import { useOpenScreen } from "@/features/navigation/use-open-screen";
import { useToday } from "@/lib/use-today";
import { Button, Card, EmptyState, ErrorState, layout, ListRow, LoadingState, Notice, ProgressBar, Screen, SectionHeader, useTextStyles } from "@/ui/components";

export default function TodayScreen() {
  const text = useTextStyles();
  const today = useToday();
  const router = useRouter();
  const daysQuery = useDays({ from: today, to: today });
  // Goal progress counts every Day of the Goal, not only today's.
  const allDaysQuery = useDays();
  const goalsQuery = useGoals();
  const updateDay = useUpdateDay();

  const goals = goalsQuery.data ?? [];
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const days = todayDays(daysQuery.data ?? [], today);
  const progress = todayProgress(days);
  const weekGoals = currentWeekGoals(goals, today);

  const refresh = () => {
    void daysQuery.refetch();
    void allDaysQuery.refetch();
    void goalsQuery.refetch();
  };

  return (
    <Screen refreshing={daysQuery.isRefetching} onRefresh={refresh}>
      <View style={layout.spaceBetween}>
        <View>
          <Text style={text.heading}>{formatKoreanDate(today)}</Text>
          <Text style={text.muted}>
            오늘 Day {progress.done}/{progress.total} 완료
          </Text>
        </View>
        <Button label="+ Day" small onPress={() => router.push({ pathname: "/days/edit", params: { date: today } })} />
      </View>

      <RecoveryBanner today={today} />

      <Card>
        <SectionHeader title="오늘의 Day" subtitle="핵심 Day가 먼저 보여요" />
        {updateDay.error ? <ErrorState error={updateDay.error} /> : null}
        {daysQuery.isPending ? (
          <LoadingState label="오늘의 Day를 불러오는 중…" />
        ) : daysQuery.isError ? (
          <ErrorState error={daysQuery.error} onRetry={() => void daysQuery.refetch()} />
        ) : days.length === 0 ? (
          <EmptyState>오늘 계획된 Day가 없어요. + Day로 오늘 할 일을 정해보세요.</EmptyState>
        ) : (
          days.map((day) => (
            <View key={day.id}>
              <DayRow
                day={day}
                goalLine={dayGoalLine(day, goalsById)}
                toggling={updateDay.isPending && updateDay.variables?.dayId === day.id}
                onToggle={() => updateDay.mutate({ dayId: day.id, body: doneToggleRequest(day) })}
                onPress={() => router.push({ pathname: "/days/edit", params: { dayId: day.id } })}
              />
              {dayGoalPath(day, goals) ? (
                <Text style={[text.muted, { marginLeft: 48, marginBottom: 4 }]} numberOfLines={1}>
                  {dayGoalPath(day, goals)}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </Card>

      <Card>
        <SectionHeader title="이번 주 목표 진행률" subtitle="오늘이 포함된 주간 목표" />
        {goalsQuery.isPending ? (
          <LoadingState />
        ) : goalsQuery.isError ? (
          <ErrorState error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
        ) : weekGoals.length === 0 ? (
          <EmptyState>오늘이 포함된 주간 목표가 없어요.</EmptyState>
        ) : (
          weekGoals.map((goal) => {
            const summary = allDaysQuery.data ? summarizeGoal(goals, allDaysQuery.data, goal.id) : null;
            return (
              <ListRow key={goal.id} onPress={() => router.push({ pathname: "/goals/[goalId]", params: { goalId: goal.id } })} accessibilityLabel={`${goal.title} 목표 열기`}>
                <View style={[layout.flex, { gap: 6 }]}>
                  <View style={layout.spaceBetween}>
                    <Text style={[text.strong, layout.flex]} numberOfLines={1}>
                      {goal.title}
                    </Text>
                    <Text style={text.strong}>{goal.progressPolicy === "MANUAL" ? "수동" : formatRate(summary?.completionRate ?? null)}</Text>
                  </View>
                  <Text style={text.muted}>{goalPeriodLabel(goal, true)}</Text>
                  {goal.progressPolicy === "AUTO" ? <ProgressBar rate={summary?.completionRate ?? null} /> : null}
                </View>
              </ListRow>
            );
          })
        )}
      </Card>
    </Screen>
  );
}

/** REC-001/REC-002 entry: missed plans or today's Recovery Day. */
function RecoveryBanner({ today }: { today: string }) {
  const openScreen = useOpenScreen();
  const candidatesQuery = useRecoveryCandidates(today);
  const recoveryDaysQuery = useRecoveryDays(today, today);
  const missed = candidatesQuery.data?.length ?? 0;
  const recoveryDay = recoveryDaysQuery.data?.[0];
  if (missed === 0 && !recoveryDay) return null;
  return (
    <>
      {recoveryDay ? (
        <Notice tone="success" action={<Button label="Recovery Day 보기" small variant="secondary" onPress={() => openScreen("recovery")} />}>
          오늘은 Recovery Day예요.{recoveryDay.returnDate ? ` ${koreanShortDate(recoveryDay.returnDate)}에 평소 계획으로 돌아와요.` : " 천천히 회복해요."}
        </Notice>
      ) : null}
      {missed > 0 ? (
        <Notice tone="warning" action={<Button label="다시 정리하기" small variant="secondary" onPress={() => openScreen("recovery")} />}>
          놓친 계획이 {missed}개 있어요. 오늘 기준으로 다시 정리할 수 있어요.
        </Notice>
      ) : null}
    </>
  );
}