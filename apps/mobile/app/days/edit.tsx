import type { DayResponse } from "@dayflow/api-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useCreateDay, useDayTags, useDays, useDeleteDay, useUpdateDay } from "@/features/days/day-queries";
import {
  DAY_PRIORITIES,
  DAY_PRIORITY_LABEL,
  DAY_STATUS_LABEL,
  dayFormProblem,
  dayToValues,
  newDayValues,
  toCreateDayRequest,
  toUpdateDayRequest,
  weekGoalChoices,
  type DayFormValues,
  type DayStatus,
} from "@/features/days/day-values";
import { goalChipLabel } from "@/features/goals/goal-helpers";
import { useGoals } from "@/features/goals/goal-queries";
import { isLocalDate } from "@/lib/dates";
import { useToday } from "@/lib/use-today";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorState, FieldLabel, layout, LoadingState, Screen, SwitchRow, TextField, useTextStyles } from "@/ui/components";
import { DateField } from "@/ui/date-fields";

const STATUSES = Object.keys(DAY_STATUS_LABEL) as DayStatus[];
const MAX_TAGS_PER_DAY = 10;

export default function DayEditScreen() {
  const { dayId, goalId, date } = useLocalSearchParams<{ dayId?: string; goalId?: string; date?: string }>();
  const daysQuery = useDays();
  if (!dayId) return <DayForm initial={newDayValues(goalId ?? "", date && isLocalDate(date) ? date : "")} editing={null} />;
  const day = daysQuery.data?.find((candidate) => candidate.id === dayId);
  if (day) return <DayForm key={`${day.id}:${day.version}`} initial={dayToValues(day)} editing={day} />;
  return (
    <Screen>
      {daysQuery.isPending ? <LoadingState /> : daysQuery.isError ? <ErrorState error={daysQuery.error} onRetry={() => void daysQuery.refetch()} /> : <EmptyState>Day를 찾을 수 없어요. 이미 삭제되었을 수 있어요.</EmptyState>}
    </Screen>
  );
}

function DayForm({ initial, editing }: { initial: DayFormValues; editing: DayResponse | null }) {
  const text = useTextStyles();
  const router = useRouter();
  const today = useToday();
  const [values, setValues] = useState(initial);
  const goalsQuery = useGoals();
  const tagsQuery = useDayTags();
  const createDay = useCreateDay();
  const updateDay = useUpdateDay();
  const deleteDay = useDeleteDay();
  const saving = createDay.isPending || updateDay.isPending;
  const error = createDay.error ?? updateDay.error ?? deleteDay.error;
  const problem = dayFormProblem(values);
  const set = <Key extends keyof DayFormValues>(key: Key, value: DayFormValues[Key]) => setValues((current) => ({ ...current, [key]: value }));

  const goals = goalsQuery.data ?? [];
  const choices = weekGoalChoices(goals, values.plannedDate);
  const selectedGoal = goals.find((goal) => goal.id === values.goalId);
  // A linked Goal that no longer contains the date stays visible, so the conflict is shown instead of hidden.
  const goalOptions = selectedGoal && !choices.some((goal) => goal.id === selectedGoal.id) ? [selectedGoal, ...choices] : choices;
  const tags = [...(tagsQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const submit = () => {
    if (problem) return;
    const onSuccess = () => router.back();
    if (editing) updateDay.mutate({ dayId: editing.id, body: toUpdateDayRequest(values, editing) }, { onSuccess });
    else createDay.mutate(toCreateDayRequest(values), { onSuccess });
  };

  const confirmDelete = () => {
    if (!editing) return;
    Alert.alert(`"${editing.title}" Day를 삭제할까요?`, "삭제하면 되돌릴 수 없어요.", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => deleteDay.mutate(editing.id, { onSuccess: () => router.back() }) },
    ]);
  };

  return (
    <Screen>
      {error ? <ErrorState error={error} /> : null}
      <Card>
        <TextField label="제목" value={values.title} maxLength={200} placeholder="예: 알고리즘 2문제" onChangeText={(text) => set("title", text)} />
        <DateField
          label="실행 날짜 (선택)"
          value={values.plannedDate}
          fallback={today}
          onChange={(plannedDate) => set("plannedDate", plannedDate)}
          onClear={() => set("plannedDate", "")}
        />
        <TextField label="예상 시간(분)" keyboardType="number-pad" value={values.estimatedMinutes} onChangeText={(text) => set("estimatedMinutes", text)} />
        <SwitchRow label="오늘의 핵심 Day" hint="우선순위와는 다른, 꼭 지키고 싶은 실행이에요." value={values.coreDay} onValueChange={(coreDay) => set("coreDay", coreDay)} />
      </Card>

      <Card>
        <FieldLabel>우선순위</FieldLabel>
        <ChipRow>
          {DAY_PRIORITIES.map((priority) => (
            <Chip key={priority} label={DAY_PRIORITY_LABEL[priority]} selected={values.priority === priority} onPress={() => set("priority", priority)} />
          ))}
        </ChipRow>
        {editing ? (
          <>
            <FieldLabel>상태</FieldLabel>
            <ChipRow>
              {STATUSES.map((status) => (
                <Chip key={status} label={DAY_STATUS_LABEL[status]} selected={values.status === status} onPress={() => set("status", status)} />
              ))}
            </ChipRow>
          </>
        ) : null}
        <FieldLabel>
          태그 ({values.tagIds.length}/{MAX_TAGS_PER_DAY})
        </FieldLabel>
        {tags.length === 0 ? (
          <Text style={text.muted}>태그가 아직 없어요. 태그 만들기는 Web Days 화면에서 할 수 있어요.</Text>
        ) : (
          <View style={layout.rowWrap}>
            {tags.map((tag) => {
              const active = values.tagIds.includes(tag.id);
              return (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  dotColor={tag.color}
                  selected={active}
                  disabled={!active && values.tagIds.length >= MAX_TAGS_PER_DAY}
                  onPress={() => set("tagIds", active ? values.tagIds.filter((id) => id !== tag.id) : [...values.tagIds, tag.id])}
                />
              );
            })}
          </View>
        )}
      </Card>

      <Card>
        <FieldLabel>주간 목표 (선택)</FieldLabel>
        <Text style={text.muted}>
          {values.plannedDate === "" ? "Goal 없이도 괜찮아요. 날짜를 고르면 그 날짜가 속한 주간 목표만 보여줘요." : "이 날짜를 포함하는 주간 목표만 보여줘요."}
        </Text>
        <View style={layout.rowWrap}>
          <Chip label="연결 안 함" selected={values.goalId === ""} onPress={() => set("goalId", "")} />
          {goalOptions.map((goal) => (
            <Chip key={goal.id} label={goalChipLabel(goal)} selected={values.goalId === goal.id} onPress={() => set("goalId", goal.id)} />
          ))}
        </View>
      </Card>

      {problem ? <Text style={text.danger}>{problem === "title" ? "제목을 입력해주세요." : "예상 시간은 1분 이상이어야 해요."}</Text> : null}
      <Button label={saving ? "저장 중…" : editing ? "저장" : "추가"} disabled={saving || problem !== null} onPress={submit} />
      {editing && editing.plannedDate !== null ? (
        <Button
          label="날짜 없음으로 이동"
          variant="secondary"
          disabled={saving}
          accessibilityLabel="날짜와 시간 배치를 지우고 날짜 없음으로 이동"
          onPress={() => updateDay.mutate({ dayId: editing.id, body: { plannedDate: null, version: editing.version } }, { onSuccess: () => router.back() })}
        />
      ) : null}
      {editing ? <Button label={deleteDay.isPending ? "삭제 중…" : "삭제"} variant="danger" disabled={deleteDay.isPending} onPress={confirmDelete} /> : null}
      <Button label="취소" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}