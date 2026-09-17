import { isPeriodGoalResponse, type PeriodGoalResponse } from "@dayflow/api-client";
import { daysOutsideRange, periodGoalFormIssue } from "@dayflow/domain";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { useDays } from "@/features/days/day-queries";
import { useCreatePeriodGoal, useGoal, useUpdatePeriodGoal } from "@/features/goals/goal-queries";
import {
  PERIOD_FORM_ISSUE_MESSAGE,
  PERIOD_SHRINK_BLOCKED_MESSAGE,
  newPeriodGoalValues,
  periodGoalToValues,
  type PeriodGoalFormValues,
} from "@/features/goals/period-goal-helpers";
import { ApiError } from "@/lib/api-error";
import { useToday } from "@/lib/use-today";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, TextField, useTextStyles } from "@/ui/components";
import { DateField } from "@/ui/date-fields";

/** Create (no param) or edit (?goalId=) a PERIOD Goal: a title and a free start/end date, nothing else. */
export default function PeriodGoalEditScreen() {
  const { goalId } = useLocalSearchParams<{ goalId?: string }>();
  const today = useToday();
  const goalQuery = useGoal(goalId);
  if (!goalId) return <PeriodGoalForm initial={newPeriodGoalValues(today)} editing={null} />;
  if (goalQuery.data && isPeriodGoalResponse(goalQuery.data)) {
    return <PeriodGoalForm key={`${goalQuery.data.id}:${goalQuery.data.version}`} initial={periodGoalToValues(goalQuery.data)} editing={goalQuery.data} />;
  }
  return (
    <Screen>
      {goalQuery.isPending ? (
        <LoadingState />
      ) : goalQuery.isError && !(goalQuery.error instanceof ApiError && goalQuery.error.status === 404) ? (
        <ErrorState error={goalQuery.error} onRetry={() => void goalQuery.refetch()} />
      ) : (
        <EmptyState>기간 목표를 찾을 수 없어요. 이미 삭제되었을 수 있어요.</EmptyState>
      )}
    </Screen>
  );
}

function PeriodGoalForm({ initial, editing }: { initial: PeriodGoalFormValues; editing: PeriodGoalResponse | null }) {
  const text = useTextStyles();
  const router = useRouter();
  const today = useToday();
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState(false);
  // The full Day list is the shared cache the other screens use; the linked Days are filtered from it.
  const daysQuery = useDays();
  const linkedDays = editing ? (daysQuery.data ?? []).filter((day) => day.goalId === editing.id) : [];
  const createGoal = useCreatePeriodGoal();
  const updateGoal = useUpdatePeriodGoal();
  const saving = createGoal.isPending || updateGoal.isPending;
  const error = createGoal.error ?? updateGoal.error;

  const issue = periodGoalFormIssue(values);
  const outside = editing && issue === null ? daysOutsideRange(linkedDays, values) : [];
  const shrinkRejected = error instanceof ApiError && error.problem?.code === "DATE_OUTSIDE_GOAL_PERIOD";
  const set = <Key extends keyof PeriodGoalFormValues>(key: Key, value: PeriodGoalFormValues[Key]) => {
    setTouched(true);
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = () => {
    setTouched(true);
    if (issue !== null || outside.length > 0) return;
    if (editing) {
      updateGoal.mutate({ goal: editing, values }, { onSuccess: () => router.back() });
    } else {
      createGoal.mutate(values, {
        onSuccess: (created) => {
          router.back();
          router.push({ pathname: "/goals/[goalId]", params: { goalId: created.id } });
        },
      });
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? "기간 목표 수정" : "새 기간 목표" }} />
      {shrinkRejected ? <Text style={text.danger}>{PERIOD_SHRINK_BLOCKED_MESSAGE}</Text> : error ? <ErrorState error={error} /> : null}
      <Card>
        <TextField label="목표 제목" value={values.title} maxLength={200} placeholder="예: 중간고사 준비" onChangeText={(title) => set("title", title)} />
        <DateField label="시작일" value={values.startDate} fallback={today} onChange={(startDate) => set("startDate", startDate)} />
        <DateField
          label="종료일"
          value={values.endDate}
          fallback={values.startDate || today}
          min={values.startDate || undefined}
          onChange={(endDate) => set("endDate", endDate)}
          onClear={() => set("endDate", "")}
        />
        <Text style={text.muted}>상위 목표나 단계 없이 이 기간 동안 이어지는 목표예요. Day를 연결하면 이 기간 안의 날짜만 고를 수 있어요.</Text>
      </Card>
      {touched && issue ? <Text style={text.danger}>{PERIOD_FORM_ISSUE_MESSAGE[issue]}</Text> : null}
      {outside.length > 0 ? (
        <Text style={text.danger}>
          {PERIOD_SHRINK_BLOCKED_MESSAGE}
          {"\n"}
          {outside
            .slice(0, 5)
            .map((day) => `· ${day.title} (${day.plannedDate})`)
            .join("\n")}
        </Text>
      ) : null}
      <Button label={saving ? "저장 중…" : editing ? "저장" : "만들기"} disabled={saving || issue !== null || outside.length > 0} onPress={submit} />
      <Button label="취소" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
