import type { EventResponse } from "@dayflow/api-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { NotificationPermissionCard } from "@/components/notification-permission-card";
import {
  EVENT_FORM_PROBLEM_MESSAGE,
  MAX_REMINDERS,
  MAX_REMINDER_OFFSET_MINUTES,
  RECURRENCES,
  RECURRENCE_LABEL,
  REMINDER_PRESETS,
  UNCATEGORIZED_LABEL,
  eventFormProblem,
  eventToValues,
  newEventValues,
  reminderLabel,
  sortCategories,
  toCreateEventRequest,
  toUpdateEventRequest,
  toggleReminder,
  type EventFormValues,
} from "@/features/events/event-display";
import { useCreateEvent, useEvent, useEventCategories, useUpdateEvent } from "@/features/events/event-queries";
import { goalChipLabel, sortGoals } from "@/features/goals/goal-helpers";
import { useGoals } from "@/features/goals/goal-queries";
import { deviceTimeZone, isLocalDate } from "@/lib/dates";
import { useToday } from "@/lib/use-today";
import { Button, Card, Chip, ChipRow, ErrorState, FieldLabel, layout, LoadingState, Screen, SwitchRow, TextField, useTextStyles } from "@/ui/components";
import { DateField, TimeField } from "@/ui/date-fields";

export default function EventEditScreen() {
  const { eventId, date } = useLocalSearchParams<{ eventId?: string; date?: string }>();
  const today = useToday();
  if (eventId) return <EditLoader eventId={eventId} />;
  return <EventForm initial={newEventValues(date && isLocalDate(date) ? date : today, deviceTimeZone())} editing={null} />;
}

function EditLoader({ eventId }: { eventId: string }) {
  const eventQuery = useEvent(eventId);
  if (eventQuery.data) return <EventForm initial={eventToValues(eventQuery.data)} editing={eventQuery.data} />;
  return <Screen>{eventQuery.isError ? <ErrorState error={eventQuery.error} onRetry={() => void eventQuery.refetch()} /> : <LoadingState />}</Screen>;
}

function EventForm({ initial, editing }: { initial: EventFormValues; editing: EventResponse | null }) {
  const text = useTextStyles();
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [customMinutes, setCustomMinutes] = useState("");
  const categoriesQuery = useEventCategories();
  const goalsQuery = useGoals();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const saving = createEvent.isPending || updateEvent.isPending;
  const error = createEvent.error ?? updateEvent.error;
  const problem = eventFormProblem(values);

  const set = <Key extends keyof EventFormValues>(key: Key, value: EventFormValues[Key]) => setValues((current) => ({ ...current, [key]: value }));

  const categories = sortCategories(categoriesQuery.data ?? []);
  // Keep a Category that was deleted elsewhere selectable while editing.
  const categoryOptions =
    editing?.category && !categories.some((category) => category.id === editing.category?.id) ? [...categories, { ...editing.category, sortOrder: 999 }] : categories;
  const goals = sortGoals(goalsQuery.data ?? []);

  const customOffset = Number(customMinutes);
  const canAddCustom =
    customMinutes !== "" &&
    Number.isInteger(customOffset) &&
    customOffset >= 0 &&
    customOffset <= MAX_REMINDER_OFFSET_MINUTES &&
    !values.reminders.includes(customOffset) &&
    values.reminders.length < MAX_REMINDERS;

  const submit = () => {
    if (problem) return;
    const onSuccess = () => router.back();
    if (editing) updateEvent.mutate({ eventId: editing.id, body: toUpdateEventRequest(values, editing.version) }, { onSuccess });
    else createEvent.mutate(toCreateEventRequest(values), { onSuccess });
  };

  return (
    <Screen>
      {error ? <ErrorState error={error} /> : null}
      <Card>
        <TextField label="제목" value={values.title} maxLength={200} placeholder="예: 포트폴리오 제출 마감" onChangeText={(text) => set("title", text)} />

        <FieldLabel>카테고리</FieldLabel>
        <ChipRow>
          <Chip label={UNCATEGORIZED_LABEL} selected={values.categoryId === ""} onPress={() => set("categoryId", "")} />
          {categoryOptions.map((category) => (
            <Chip key={category.id} label={category.name} dotColor={category.color} selected={values.categoryId === category.id} onPress={() => set("categoryId", category.id)} />
          ))}
        </ChipRow>
      </Card>

      <Card>
        <SwitchRow label="하루 종일" value={values.allDay} onValueChange={(allDay) => set("allDay", allDay)} />
        <View style={layout.row}>
          <DateField
            label={values.allDay ? "시작 날짜" : "시작"}
            value={values.startDate}
            fallback={values.startDate}
            onChange={(startDate) => setValues((current) => ({ ...current, startDate, endDate: current.endDate < startDate ? startDate : current.endDate }))}
          />
          {!values.allDay ? <TimeField label="시작 시간" value={values.startTime} onChange={(startTime) => set("startTime", startTime)} /> : null}
        </View>
        <View style={layout.row}>
          <DateField label={values.allDay ? "마지막 날짜" : "종료"} value={values.endDate} fallback={values.endDate} min={values.startDate} onChange={(endDate) => set("endDate", endDate)} />
          {!values.allDay ? <TimeField label="종료 시간" value={values.endTime} onChange={(endTime) => set("endTime", endTime)} /> : null}
        </View>
        <TextField label="Timezone" value={values.timezone} autoCapitalize="none" autoCorrect={false} onChangeText={(text) => set("timezone", text.trim())} />
        <FieldLabel>반복</FieldLabel>
        <ChipRow>
          {RECURRENCES.map((recurrence) => (
            <Chip key={recurrence} label={RECURRENCE_LABEL[recurrence]} selected={values.recurrence === recurrence} onPress={() => set("recurrence", recurrence)} />
          ))}
        </ChipRow>
      </Card>

      <Card>
        <FieldLabel>
          알림 ({values.reminders.length}/{MAX_REMINDERS}){values.allDay ? " · 하루 종일 일정은 그날 09:00 기준" : ""}
        </FieldLabel>
        <View style={layout.rowWrap}>
          {REMINDER_PRESETS.map((offset) => {
            const active = values.reminders.includes(offset);
            return (
              <Chip
                key={offset}
                label={reminderLabel(offset)}
                selected={active}
                disabled={!active && values.reminders.length >= MAX_REMINDERS}
                onPress={() => set("reminders", toggleReminder(values.reminders, offset))}
              />
            );
          })}
          {values.reminders
            .filter((offset) => !REMINDER_PRESETS.includes(offset))
            .map((offset) => (
              <Chip key={offset} label={`${reminderLabel(offset)} ×`} selected onPress={() => set("reminders", toggleReminder(values.reminders, offset))} />
            ))}
        </View>
        <View style={layout.row}>
          <View style={layout.flex}>
            <TextField label="사용자 지정 (분 전)" keyboardType="number-pad" value={customMinutes} onChangeText={setCustomMinutes} placeholder="예: 90" />
          </View>
          <View style={{ paddingTop: 20 }}>
            <Button
              label="추가"
              variant="secondary"
              disabled={!canAddCustom}
              onPress={() => {
                set("reminders", toggleReminder(values.reminders, customOffset));
                setCustomMinutes("");
              }}
            />
          </View>
        </View>
      </Card>
      {values.reminders.length > 0 ? <NotificationPermissionCard compact /> : null}

      <Card>
        <TextField label="장소 (선택)" value={values.location} maxLength={200} onChangeText={(text) => set("location", text)} />
        <FieldLabel>연결 목표 (선택)</FieldLabel>
        <ChipRow>
          <Chip label="연결 안 함" selected={values.linkedGoalId === ""} onPress={() => set("linkedGoalId", "")} />
          {goals.map((goal) => (
            <Chip key={goal.id} label={goalChipLabel(goal, true)} selected={values.linkedGoalId === goal.id} onPress={() => set("linkedGoalId", goal.id)} />
          ))}
        </ChipRow>
        <TextField label="메모 (선택)" value={values.notes} maxLength={2000} multiline onChangeText={(text) => set("notes", text)} />
      </Card>

      {problem ? <Text style={text.danger}>{EVENT_FORM_PROBLEM_MESSAGE[problem]}</Text> : null}
      <Button label={saving ? "저장 중…" : editing ? "저장" : "추가"} disabled={saving || problem !== null} onPress={submit} />
      <Button label="취소" variant="ghost" disabled={saving} onPress={() => router.back()} />
    </Screen>
  );
}