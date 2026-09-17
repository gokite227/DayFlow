import { isPeriodGoalResponse, type DayResponse, type GoalResponse } from "@dayflow/api-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { DayScheduleSaveError, useDayTags, useDays, useDeleteDay, useSaveDay, useUpdateDay } from "@/features/days/day-queries";
import {
  SCHEDULE_FORM_PROBLEM_MESSAGE,
  planScheduleSave,
  scheduleFormProblem,
  scheduleFormValues,
  type ScheduleFormValues,
} from "@/features/days/day-schedule-values";
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
import { DayFocusSettingsCard } from "@/features/focus/day-focus-settings-card";
import { canFocusOnDay } from "@/features/focus/focus-display";
import { useFocus } from "@/features/focus/focus-provider";
import { useGoals, usePeriodGoals } from "@/features/goals/goal-queries";
import { useOpenScreen } from "@/features/navigation/use-open-screen";
import { dayDateProblem, periodGoalOptionLabel, selectablePeriodGoals } from "@/features/goals/period-goal-helpers";
import { isLocalDate } from "@/lib/dates";
import { useToday } from "@/lib/use-today";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorState, FieldLabel, layout, LoadingState, Screen, SwitchRow, TextField, useTextStyles } from "@/ui/components";
import { DateField, TimeField } from "@/ui/date-fields";

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
  const periodGoalsQuery = usePeriodGoals();
  const tagsQuery = useDayTags();
  const saveDay = useSaveDay();
  const updateDay = useUpdateDay();
  const deleteDay = useDeleteDay();
  // The exact stored times; only a real change of them is sent (planScheduleSave).
  const [scheduleInitial] = useState(() => scheduleFormValues(editing, Number(initial.estimatedMinutes) || 60));
  const [schedule, setScheduleValues] = useState<ScheduleFormValues>(scheduleInitial);
  const openScreen = useOpenScreen();
  const { state: focusState } = useFocus();
  const runningFocus = focusState.current?.status === "ACTIVE" ? focusState.current : null;
  const saving = saveDay.isPending || updateDay.isPending;
  const error = saveDay.error ?? updateDay.error ?? deleteDay.error;
  const scheduleProblem = scheduleFormProblem(schedule, values.plannedDate);
  const problem = dayFormProblem(values);
  const set = <Key extends keyof DayFormValues>(key: Key, value: DayFormValues[Key]) => setValues((current) => ({ ...current, [key]: value }));

  const goals = goalsQuery.data ?? [];
  const periodGoals = periodGoalsQuery.data ?? [];
  const choices = weekGoalChoices(goals, values.plannedDate);
  const periodChoices = selectablePeriodGoals(periodGoals, today, initial.goalId).filter(
    (goal) => values.plannedDate === "" || (goal.startDate <= values.plannedDate && values.plannedDate <= goal.endDate),
  );
  const selectedGoal: GoalResponse | undefined = goals.find((goal) => goal.id === values.goalId) ?? periodGoals.find((goal) => goal.id === values.goalId);
  // A linked Goal that no longer contains the date stays visible, so the conflict is shown instead of hidden.
  const goalOptions = selectedGoal?.kind === "CALENDAR" && !choices.some((goal) => goal.id === selectedGoal.id) ? [selectedGoal, ...choices] : choices;
  const periodOptions =
    selectedGoal && isPeriodGoalResponse(selectedGoal) && !periodChoices.some((goal) => goal.id === selectedGoal.id)
      ? [selectedGoal, ...periodChoices]
      : periodChoices;
  const dateProblem = dayDateProblem(selectedGoal, values.plannedDate);
  const tags = [...(tagsQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const submit = () => {
    if (problem || dateProblem || scheduleProblem) return;
    const plan = planScheduleSave(editing, scheduleInitial, schedule, values.plannedDate);
    saveDay.mutate(
      editing
        ? { dayId: editing.id, update: toUpdateDayRequest(values, editing), schedule: plan }
        : { dayId: null, create: toCreateDayRequest(values), schedule: plan },
      {
        onSuccess: () => router.back(),
        // A new Day was created but its time could not be placed: continue on that Day, so saving again never duplicates it.
        onError: (failure) => {
          if (failure instanceof DayScheduleSaveError) router.replace({ pathname: "/days/edit", params: { dayId: failure.day.id } });
        },
      },
    );
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
          fallback={selectedGoal && !(selectedGoal.startDate <= today && today <= selectedGoal.endDate) ? selectedGoal.startDate : today}
          min={selectedGoal?.startDate}
          max={selectedGoal?.endDate}
          onChange={(plannedDate) => set("plannedDate", plannedDate)}
          onClear={() => set("plannedDate", "")}
        />
        {dateProblem ? <Text style={text.danger}>{dateProblem}</Text> : null}
        <SwitchRow
          label="시간 정하기"
          hint="Calendar에 이 시간으로 배치해요. 분 단위로 정할 수 있어요."
          value={schedule.enabled}
          onValueChange={(enabled) => setScheduleValues((current) => ({ ...current, enabled }))}
        />
        {schedule.enabled ? (
          <View style={layout.row}>
            <TimeField label="시작" value={schedule.start} onChange={(start) => setScheduleValues((current) => ({ ...current, start }))} />
            <TimeField label="종료" value={schedule.end} onChange={(end) => setScheduleValues((current) => ({ ...current, end }))} />
          </View>
        ) : null}
        {scheduleProblem ? <Text style={text.danger}>{SCHEDULE_FORM_PROBLEM_MESSAGE[scheduleProblem]}</Text> : null}
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
        <FieldLabel>목표 (선택)</FieldLabel>
        <Text style={text.muted}>
          {values.plannedDate === "" ? "Goal 없이도 괜찮아요. 날짜를 고르면 그 날짜를 포함하는 목표만 보여줘요." : "이 날짜를 포함하는 목표만 보여줘요."}
        </Text>
        <View style={layout.rowWrap}>
          <Chip label="연결 안 함" selected={values.goalId === ""} onPress={() => set("goalId", "")} />
        </View>
        <Text style={text.muted}>계획 목표 (주간)</Text>
        <View style={layout.rowWrap}>
          {goalOptions.length === 0 ? <Text style={text.muted}>고를 수 있는 주간 목표가 없어요.</Text> : null}
          {goalOptions.map((goal) => (
            <Chip key={goal.id} label={goalChipLabel(goal)} selected={values.goalId === goal.id} onPress={() => set("goalId", goal.id)} />
          ))}
        </View>
        <Text style={text.muted}>기간 목표</Text>
        <View style={layout.rowWrap}>
          {periodOptions.length === 0 ? <Text style={text.muted}>고를 수 있는 기간 목표가 없어요.</Text> : null}
          {periodOptions.map((goal) => (
            <Chip key={goal.id} label={periodGoalOptionLabel(goal, today)} selected={values.goalId === goal.id} onPress={() => set("goalId", goal.id)} />
          ))}
        </View>
        {selectedGoal ? (
          <Button
            label="목표 열기"
            variant="ghost"
            small
            onPress={() => {
              router.back();
              router.push({ pathname: "/goals/[goalId]", params: { goalId: selectedGoal.id } });
            }}
          />
        ) : null}
      </Card>

      {problem ? <Text style={text.danger}>{problem === "title" ? "제목을 입력해주세요." : "예상 시간은 1분 이상이어야 해요."}</Text> : null}
      <Button label={saving ? "저장 중…" : editing ? "저장" : "추가"} disabled={saving || problem !== null || dateProblem !== null || scheduleProblem !== null} onPress={submit} />
      {editing && editing.plannedDate !== null ? (
        <Button
          label="날짜 없음으로 이동"
          variant="secondary"
          disabled={saving}
          accessibilityLabel="날짜와 시간 배치를 지우고 날짜 없음으로 이동"
          onPress={() => updateDay.mutate({ dayId: editing.id, body: { plannedDate: null, version: editing.version } }, { onSuccess: () => router.back() })}
        />
      ) : null}
      {editing?.schedule && canFocusOnDay(editing) ? <DayFocusSettingsCard day={editing} /> : null}
      {editing && canFocusOnDay(editing) ? (
        <Button
          label={runningFocus && runningFocus.dayId !== editing.id ? "진행 중인 집중 보기" : "집중 시작"}
          variant="secondary"
          accessibilityLabel={`${editing.title} 집중 시작`}
          onPress={() => {
            // Focus is a separate screen: close this form, then open Focus with this Day (or the running Focus).
            router.back();
            openScreen("focus", { dayId: editing.id });
          }}
        />
      ) : null}
      {editing ? <Button label={deleteDay.isPending ? "삭제 중…" : "삭제"} variant="danger" disabled={deleteDay.isPending} onPress={confirmDelete} /> : null}
      <Button label="취소" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}