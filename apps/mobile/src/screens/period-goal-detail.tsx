import type { DayResponse, PeriodGoalResponse } from "@dayflow/api-client";
import { groupDaysByWeek, periodGoalStatus } from "@dayflow/domain";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { DayRow } from "@/components/day-row";
import { useDays, useUpdateDay } from "@/features/days/day-queries";
import { doneToggleRequest, sortDays } from "@/features/days/day-values";
import { periodRangeLabel } from "@/features/goals/goal-helpers";
import { useDeletePeriodGoal } from "@/features/goals/goal-queries";
import { PlanningCoachCard } from "@/features/goals/planning-coach-card";
import {
  PERIOD_DELETE_BLOCKED_MESSAGE,
  PERIOD_STATUS_COLOR,
  PERIOD_STATUS_LABEL,
  defaultDayDate,
  periodCountLabel,
  periodGoalCalendarParams,
  periodProgressLabel,
  summarizePeriodGoal,
} from "@/features/goals/period-goal-helpers";
import { useOpenScreen } from "@/features/navigation/use-open-screen";
import { Badge, Button, Card, EmptyState, ErrorState, layout, LoadingState, ProgressBar, Screen, SectionHeader, Segmented, useTextStyles } from "@/ui/components";

type DayLayout = "all" | "week";

/**
 * A PERIOD Goal on mobile: range, derived status, progress, linked Days (all or grouped by week) and the
 * edit / delete / Calendar actions. Grouping is visual only; no WEEK Goals are created.
 */
export function PeriodGoalDetail({ goal, today }: { goal: PeriodGoalResponse; today: string }) {
  const text = useTextStyles();
  const router = useRouter();
  const openScreen = useOpenScreen();
  const [dayLayout, setDayLayout] = useState<DayLayout>("week");
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const daysQuery = useDays();
  const updateDay = useUpdateDay();
  const deleteGoal = useDeletePeriodGoal();
  const linkedDays = sortDays((daysQuery.data ?? []).filter((day) => day.goalId === goal.id));
  const summary = summarizePeriodGoal(linkedDays, goal.id);
  const status = periodGoalStatus(goal, today);

  const confirmDelete = () => {
    setDeleteBlocked(false);
    // The server refuses to delete a Goal that still has Days (GOAL_IN_USE); say so before asking.
    if (linkedDays.length > 0) {
      setDeleteBlocked(true);
      return;
    }
    Alert.alert(`"${goal.title}" 기간 목표를 삭제할까요?`, "삭제하면 되돌릴 수 없어요.", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => deleteGoal.mutate(goal.id, { onSuccess: () => router.back() }) },
    ]);
  };

  const renderDay = (day: DayResponse) => (
    <DayRow
      key={day.id}
      day={day}
      goalLine={null}
      toggling={updateDay.isPending && updateDay.variables?.dayId === day.id}
      onToggle={() => updateDay.mutate({ dayId: day.id, body: doneToggleRequest(day) })}
      onPress={() => router.push({ pathname: "/days/edit", params: { dayId: day.id } })}
    />
  );

  return (
    <Screen refreshing={daysQuery.isRefetching} onRefresh={() => void daysQuery.refetch()}>
      <Stack.Screen options={{ title: "기간 목표" }} />
      <Card>
        <View style={layout.rowWrap}>
          <Badge label="기간 목표" />
          <Badge label={PERIOD_STATUS_LABEL[status]} color={PERIOD_STATUS_COLOR[status]} />
        </View>
        <Text style={text.heading}>{goal.title}</Text>
        {goal.why ? <Text style={text.body}>Why · {goal.why}</Text> : null}
        <Text style={text.muted}>
          {goal.startDate} ~ {goal.endDate}
        </Text>
        <View style={layout.spaceBetween}>
          <Text style={text.muted}>{daysQuery.data ? periodCountLabel(summary) : "…"}</Text>
          <Text style={text.strong}>{periodProgressLabel(summary)}</Text>
        </View>
        <ProgressBar rate={summary.completionRate ?? 0} />
        {deleteBlocked ? <Text style={text.danger}>{PERIOD_DELETE_BLOCKED_MESSAGE}</Text> : null}
        {deleteGoal.error ? <ErrorState error={deleteGoal.error} /> : null}
        <View style={layout.rowWrap}>
          <Button label="캘린더에서 보기" variant="secondary" small onPress={() => openScreen("calendar", periodGoalCalendarParams(goal))} />
          <Button label="수정" variant="ghost" small onPress={() => router.push({ pathname: "/goals/period-edit", params: { goalId: goal.id } })} />
          <Button label={deleteGoal.isPending ? "삭제 중…" : "삭제"} variant="danger" small disabled={deleteGoal.isPending || daysQuery.isPending} onPress={confirmDelete} />
        </View>
      </Card>

      <Card>
        <SectionHeader
          title="연결된 Day"
          subtitle={`${periodRangeLabel(goal)} 동안 이 목표로 실행할 Day`}
          action={<Button label="+ Day" small onPress={() => router.push({ pathname: "/days/edit", params: { goalId: goal.id, date: defaultDayDate(goal, today) } })} />}
        />
        <Segmented
          label="Day 보기"
          value={dayLayout}
          onChange={setDayLayout}
          options={[
            { value: "all", label: "전체" },
            { value: "week", label: "주차별" },
          ]}
        />
        {updateDay.error ? <ErrorState error={updateDay.error} /> : null}
        {daysQuery.isPending ? (
          <LoadingState />
        ) : daysQuery.isError ? (
          <ErrorState error={daysQuery.error} onRetry={() => void daysQuery.refetch()} />
        ) : linkedDays.length === 0 ? (
          <EmptyState>아직 연결된 Day가 없어요.</EmptyState>
        ) : dayLayout === "all" ? (
          linkedDays.map(renderDay)
        ) : (
          groupDaysByWeek(linkedDays, goal).map((group) => (
            <View key={group.key} style={{ gap: 2 }}>
              <Text style={text.strong}>{group.range ? periodRangeLabel(group.range) : "날짜 없음"}</Text>
              {group.days.map(renderDay)}
            </View>
          ))
        )}
      </Card>

      {daysQuery.isSuccess ? (
        <PlanningCoachCard goal={goal} today={today} openDayCount={linkedDays.filter((day) => day.status !== "DONE" && day.status !== "SKIPPED").length} />
      ) : null}
    </Screen>
  );
}
