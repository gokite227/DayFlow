import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Text, View } from "react-native";
import {
  RECURRENCE_LABEL,
  categoryColors,
  categoryLabel,
  describeOccurrenceTime,
  reminderLabel,
} from "@/features/events/event-display";
import { useDeleteEvent, useEvent } from "@/features/events/event-queries";
import { goalChipLabel } from "@/features/goals/goal-helpers";
import { useGoals } from "@/features/goals/goal-queries";
import { isLocalDate, koreanShortDate, koreanTime, wallClock } from "@/lib/dates";
import { Badge, Button, Card, EmptyState, ErrorState, layout, LoadingState, Notice, Screen, useTextStyles } from "@/ui/components";

function describeOccurrenceParam(value: string): string {
  if (isLocalDate(value)) return `${koreanShortDate(value)} · 하루 종일`;
  const clock = wallClock(value);
  return isLocalDate(clock.date) ? `${koreanShortDate(clock.date)} · ${koreanTime(clock.minutes)}` : value;
}

export default function EventDetailScreen() {
  const text = useTextStyles();
  const { eventId, occurrence } = useLocalSearchParams<{ eventId: string; occurrence?: string }>();
  const router = useRouter();
  const eventQuery = useEvent(eventId);
  const goalsQuery = useGoals();
  const deleteEvent = useDeleteEvent();

  if (eventQuery.isPending) {
    return (
      <Screen>
        <LoadingState label="일정을 불러오는 중…" />
      </Screen>
    );
  }
  if (eventQuery.isError) {
    return (
      <Screen>
        <ErrorState error={eventQuery.error} onRetry={() => void eventQuery.refetch()} />
      </Screen>
    );
  }
  const event = eventQuery.data;
  const { color, soft } = categoryColors(event.category);
  const goal = event.linkedGoalId ? goalsQuery.data?.find((candidate) => candidate.id === event.linkedGoalId) : undefined;

  const confirmDelete = () =>
    Alert.alert(`"${event.title}" 일정을 삭제할까요?`, event.recurrence !== "NONE" ? "반복 일정이면 모든 반복이 함께 삭제돼요." : undefined, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => deleteEvent.mutate({ eventId: event.id, version: event.version }, { onSuccess: () => router.back() }),
      },
    ]);

  return (
    <Screen refreshing={eventQuery.isRefetching} onRefresh={() => void eventQuery.refetch()}>
      <Stack.Screen options={{ title: event.title }} />
      {occurrence ? <Notice>이 알림의 일정 · {describeOccurrenceParam(occurrence)}</Notice> : null}
      <Card style={{ borderLeftWidth: 6, borderLeftColor: color, backgroundColor: soft }}>
        <Badge label={categoryLabel(event.category)} color={color} />
        <Text style={text.heading}>{event.title}</Text>
        <Text style={[text.strong, { color }]}>{describeOccurrenceTime(event)}</Text>
        <Text style={text.muted}>Timezone · {event.timezone}</Text>
      </Card>
      <Card>
        <DetailLine label="반복" value={RECURRENCE_LABEL[event.recurrence]} />
        <DetailLine label="알림" value={event.reminders.length > 0 ? [...event.reminders].sort((a, b) => a - b).map(reminderLabel).join(", ") : "없음"} />
        <DetailLine label="장소" value={event.location ?? "없음"} />
        <DetailLine label="연결 목표" value={goal ? goalChipLabel(goal, true) : event.linkedGoalId ? "불러오는 중" : "없음"} />
        {event.notes ? <DetailLine label="메모" value={event.notes} /> : null}
      </Card>
      {deleteEvent.error ? <ErrorState error={deleteEvent.error} /> : null}
      <View style={layout.row}>
        <View style={layout.flex}>
          <Button label="수정" variant="secondary" onPress={() => router.push({ pathname: "/events/edit", params: { eventId: event.id } })} />
        </View>
        <View style={layout.flex}>
          <Button label={deleteEvent.isPending ? "삭제 중…" : "삭제"} variant="danger" disabled={deleteEvent.isPending} onPress={confirmDelete} />
        </View>
      </View>
      {deleteEvent.isSuccess ? <EmptyState>삭제했어요.</EmptyState> : null}
    </Screen>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const text = useTextStyles();
  return (
    <View style={{ gap: 2, paddingVertical: 4 }}>
      <Text style={text.muted}>{label}</Text>
      <Text style={text.body}>{value}</Text>
    </View>
  );
}