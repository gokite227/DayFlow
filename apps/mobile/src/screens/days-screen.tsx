import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { DayRow } from "@/components/day-row";
import { useCreateDay, useDayTags, useDays, useUpdateDay } from "@/features/days/day-queries";
import {
  DAYS_VIEWS,
  DAYS_VIEW_LABEL,
  DAY_PRIORITIES,
  DAY_PRIORITY_LABEL,
  GOAL_FILTER_LABEL,
  countByView,
  dayGoalLine,
  doneToggleRequest,
  emptyDaysFilters,
  filterDays,
  quickAddDayRequest,
  sortDays,
  type DaysFilters,
  type GoalFilter,
} from "@/features/days/day-values";
import { useGoals } from "@/features/goals/goal-queries";
import { useToday } from "@/lib/use-today";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorState, FieldLabel, layout, LoadingState, Screen, useTextStyles } from "@/ui/components";
import { fontSize, radius, spacing, TOUCH_TARGET, usePalette } from "@/ui/theme";

const GOAL_FILTERS: readonly GoalFilter[] = ["all", "with", "without"];

/** DAY-006 Task Inbox. Loads the whole Day list once and filters on the device. */
export default function DaysScreen() {
  const text = useTextStyles();
  const palette = usePalette();
  const today = useToday();
  const router = useRouter();
  const [filters, setFilters] = useState<DaysFilters>(emptyDaysFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const daysQuery = useDays();
  const tagsQuery = useDayTags();
  const goalsQuery = useGoals();
  const createDay = useCreateDay();
  const updateDay = useUpdateDay();

  const allDays = daysQuery.data ?? [];
  const counts = countByView(allDays, today);
  const days = sortDays(filterDays(allDays, filters, today));
  const goalsById = new Map((goalsQuery.data ?? []).map((goal) => [goal.id, goal]));
  const tags = [...(tagsQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const update = (change: Partial<DaysFilters>) => setFilters((current) => ({ ...current, ...change }));

  const quickAdd = () => {
    if (quickTitle.trim() === "") return;
    createDay.mutate(quickAddDayRequest(quickTitle), { onSuccess: () => setQuickTitle("") });
  };

  return (
    <Screen refreshing={daysQuery.isRefetching} onRefresh={() => void daysQuery.refetch()}>
      <View style={[layout.row, { gap: spacing.sm }]}>
        <TextInput
          accessibilityLabel="빠른 추가"
          placeholder="할 일을 적고 추가 (Goal·날짜 없이도 돼요)"
          placeholderTextColor={palette.textSecondary}
          value={quickTitle}
          maxLength={200}
          onChangeText={setQuickTitle}
          onSubmitEditing={quickAdd}
          returnKeyType="done"
          style={{
            flex: 1,
            minHeight: TOUCH_TARGET,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            backgroundColor: palette.surface,
            fontSize: fontSize.body,
            color: palette.text,
          }}
        />
        <Button label={createDay.isPending ? "…" : "추가"} disabled={createDay.isPending || quickTitle.trim() === ""} onPress={quickAdd} />
      </View>
      {createDay.error ? <ErrorState error={createDay.error} /> : null}

      <ChipRow>
        {DAYS_VIEWS.map((view) => (
          <Chip key={view} label={DAYS_VIEW_LABEL[view]} count={counts[view]} selected={filters.view === view} onPress={() => update({ view })} />
        ))}
      </ChipRow>

      <View style={layout.spaceBetween}>
        <Button label={showFilters ? "필터 닫기" : "필터"} variant="secondary" small onPress={() => setShowFilters(!showFilters)} />
        <Button label="+ 자세히 추가" small variant="ghost" onPress={() => router.push("/days/edit")} />
      </View>

      {showFilters ? (
        <Card>
          <FieldLabel>Goal</FieldLabel>
          <ChipRow>
            {GOAL_FILTERS.map((goal) => (
              <Chip key={goal} label={GOAL_FILTER_LABEL[goal]} selected={filters.goal === goal} onPress={() => update({ goal })} />
            ))}
          </ChipRow>
          <FieldLabel>우선순위</FieldLabel>
          <ChipRow>
            <Chip label="전체" selected={filters.priority === "all"} onPress={() => update({ priority: "all" })} />
            {DAY_PRIORITIES.map((priority) => (
              <Chip key={priority} label={DAY_PRIORITY_LABEL[priority]} selected={filters.priority === priority} onPress={() => update({ priority })} />
            ))}
          </ChipRow>
          <FieldLabel>태그 (하나라도 있으면 표시)</FieldLabel>
          {tags.length === 0 ? (
            <Text style={text.muted}>태그가 아직 없어요. 태그 관리는 Web Days 화면에서 할 수 있어요.</Text>
          ) : (
            <ChipRow>
              {tags.map((tag) => {
                const active = filters.tagIds.includes(tag.id);
                return (
                  <Chip
                    key={tag.id}
                    label={tag.name}
                    dotColor={tag.color}
                    selected={active}
                    onPress={() => update({ tagIds: active ? filters.tagIds.filter((id) => id !== tag.id) : [...filters.tagIds, tag.id] })}
                  />
                );
              })}
            </ChipRow>
          )}
          <Button label="필터 초기화" variant="ghost" small onPress={() => setFilters({ ...emptyDaysFilters(), view: filters.view })} />
        </Card>
      ) : null}

      <Card>
        {updateDay.error ? <ErrorState error={updateDay.error} /> : null}
        {daysQuery.isPending ? (
          <LoadingState label="Day를 불러오는 중…" />
        ) : daysQuery.isError ? (
          <ErrorState error={daysQuery.error} onRetry={() => void daysQuery.refetch()} />
        ) : days.length === 0 ? (
          <EmptyState>조건에 맞는 Day가 없어요.</EmptyState>
        ) : (
          days.map((day) => (
            <DayRow
              key={day.id}
              day={day}
              goalLine={dayGoalLine(day, goalsById)}
              toggling={updateDay.isPending && updateDay.variables?.dayId === day.id}
              onToggle={() => updateDay.mutate({ dayId: day.id, body: doneToggleRequest(day) })}
              onPress={() => router.push({ pathname: "/days/edit", params: { dayId: day.id } })}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}