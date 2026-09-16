import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { EventRow } from "@/components/event-row";
import { NotificationPermissionCard } from "@/components/notification-permission-card";
import {
  UNCATEGORIZED_LABEL,
  describeEventExtras,
  describeOccurrenceTime,
  matchesCategoryFilter,
  nextOccurrences,
  sortCategories,
  type CategoryFilter,
} from "@/features/events/event-display";
import { useEventCategories, useEventOccurrences, useEvents } from "@/features/events/event-queries";
import { addDays } from "@/lib/dates";
import { useToday } from "@/lib/use-today";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorState, layout, LoadingState, Screen, SectionHeader, useTextStyles } from "@/ui/components";

/** Upcoming = the next occurrence of each Event within a year (API range limit 366 days). */
const UPCOMING_DAYS = 365;

const filterKey = (filter: CategoryFilter) => (typeof filter === "object" ? filter.categoryId : filter);

export default function EventsScreen() {
  const text = useTextStyles();
  const today = useToday();
  const router = useRouter();
  const [selected, setSelected] = useState<CategoryFilter>("ALL");
  const occurrencesQuery = useEventOccurrences(today, addDays(today, UPCOMING_DAYS));
  const eventsQuery = useEvents();
  const categoriesQuery = useEventCategories();

  const categories = sortCategories(categoriesQuery.data ?? []);
  // A Category deleted elsewhere falls back to 전체.
  const filter: CategoryFilter =
    typeof selected === "object" && !categories.some((category) => category.id === selected.categoryId) ? "ALL" : selected;
  const upcomingAll = nextOccurrences(occurrencesQuery.data ?? []);
  const upcoming = upcomingAll.filter((occurrence) => matchesCategoryFilter(occurrence.category, filter));
  const upcomingIds = new Set(upcomingAll.map((occurrence) => occurrence.eventId));
  const eventsById = new Map((eventsQuery.data ?? []).map((event) => [event.id, event]));
  const others = (eventsQuery.data ?? []).filter((event) => !upcomingIds.has(event.id) && matchesCategoryFilter(event.category, filter));
  const count = (value: CategoryFilter) => upcomingAll.filter((occurrence) => matchesCategoryFilter(occurrence.category, value)).length;

  const filters: { value: CategoryFilter; label: string; color?: string }[] = [
    { value: "ALL", label: "전체" },
    { value: "UNCATEGORIZED", label: UNCATEGORIZED_LABEL },
    ...categories.map((category) => ({ value: { categoryId: category.id }, label: category.name, color: category.color })),
  ];

  return (
    <Screen
      refreshing={occurrencesQuery.isRefetching}
      onRefresh={() => {
        void occurrencesQuery.refetch();
        void eventsQuery.refetch();
        void categoriesQuery.refetch();
      }}
    >
      <View style={layout.spaceBetween}>
        <Text style={[text.muted, layout.flex]}>면접·시험·생일·마감처럼 이미 정해진 일정</Text>
        <Button label="+ 새 일정" small onPress={() => router.push({ pathname: "/events/edit", params: { date: today } })} />
      </View>

      <ChipRow>
        {filters.map((entry) => (
          <Chip
            key={filterKey(entry.value)}
            label={entry.label}
            dotColor={entry.color}
            selected={filterKey(entry.value) === filterKey(filter)}
            count={occurrencesQuery.isSuccess ? count(entry.value) : undefined}
            onPress={() => setSelected(entry.value)}
          />
        ))}
      </ChipRow>

      <NotificationPermissionCard compact />

      <Card>
        <SectionHeader title="다가오는 일정" />
        {occurrencesQuery.isPending ? (
          <LoadingState label="일정을 불러오는 중…" />
        ) : occurrencesQuery.isError ? (
          <ErrorState error={occurrencesQuery.error} onRetry={() => void occurrencesQuery.refetch()} />
        ) : upcoming.length === 0 ? (
          <EmptyState>앞으로 1년 안에 예정된 일정이 없어요.</EmptyState>
        ) : (
          upcoming.map((occurrence) => {
            const event = eventsById.get(occurrence.eventId);
            return (
              <EventRow
                key={occurrence.eventId}
                title={occurrence.title}
                category={occurrence.category}
                timeLabel={describeOccurrenceTime(occurrence)}
                detail={event ? describeEventExtras(event) : null}
                onPress={() =>
                  router.push({
                    pathname: "/events/[eventId]",
                    params: { eventId: occurrence.eventId, occurrence: occurrence.startAt ?? occurrence.startDate ?? "" },
                  })
                }
              />
            );
          })
        )}
      </Card>

      {others.length > 0 ? (
        <Card>
          <SectionHeader title="그 밖의 일정" subtitle="이미 지났거나 1년 뒤에 있는 일정" />
          {others.map((event) => (
            <EventRow
              key={event.id}
              title={event.title}
              category={event.category}
              timeLabel={describeOccurrenceTime(event)}
              detail={describeEventExtras(event)}
              muted
              onPress={() => router.push({ pathname: "/events/[eventId]", params: { eventId: event.id } })}
            />
          ))}
        </Card>
      ) : null}
      {eventsQuery.isError ? <ErrorState error={eventsQuery.error} onRetry={() => void eventsQuery.refetch()} /> : null}
    </Screen>
  );
}