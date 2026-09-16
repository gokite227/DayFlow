import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { weekGoalChoices } from "@/features/days/day-values";
import { goalChipLabel } from "@/features/goals/goal-helpers";
import { useGoals } from "@/features/goals/goal-queries";
import { REVIEW_TYPES, type ReviewType } from "@/features/review/review-helpers";
import { useConvertTryItem, useReview } from "@/features/review/review-queries";
import { useToday } from "@/lib/use-today";
import { Button, Card, Chip, EmptyState, ErrorState, FieldLabel, layout, LoadingState, Screen, TextField, useTextStyles } from "@/ui/components";
import { DateField } from "@/ui/date-fields";

/** REV-004 Try → Day. The Goal is optional; with a date only WEEK Goals containing it are offered. */
export default function TryToDayScreen() {
  const params = useLocalSearchParams<{ itemId: string; type: string; periodStart: string }>();
  const type: ReviewType = (REVIEW_TYPES as readonly string[]).includes(params.type) ? (params.type as ReviewType) : "WEEK";
  const reviewQuery = useReview(type, params.periodStart);
  const item = reviewQuery.data?.items.find((candidate) => candidate.id === params.itemId);

  if (reviewQuery.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (!item) {
    return <Screen>{reviewQuery.isError ? <ErrorState error={reviewQuery.error} /> : <EmptyState>회고 항목을 찾을 수 없어요.</EmptyState>}</Screen>;
  }
  return <TryForm itemId={item.id} content={item.content} type={type} periodStart={params.periodStart} />;
}

function TryForm({ itemId, content, type, periodStart }: { itemId: string; content: string; type: ReviewType; periodStart: string }) {
  const text = useTextStyles();
  const router = useRouter();
  const today = useToday();
  const goalsQuery = useGoals();
  const convert = useConvertTryItem(type, periodStart);
  const [title, setTitle] = useState(content.slice(0, 200));
  const [plannedDate, setPlannedDate] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [goalId, setGoalId] = useState("");
  const candidates = weekGoalChoices(goalsQuery.data ?? [], plannedDate);
  const goal = candidates.find((candidate) => candidate.id === goalId);
  const invalid = title.trim() === "" || !(Number.isInteger(Number(minutes)) && Number(minutes) >= 1);

  const changeDate = (date: string) => {
    setPlannedDate(date);
    const next = weekGoalChoices(goalsQuery.data ?? [], date);
    // Suggest the single WEEK Goal containing the date; never force it.
    if (!next.some((candidate) => candidate.id === goalId)) setGoalId(next.length === 1 ? next[0]!.id : "");
  };

  return (
    <Screen>
      <Card>
        <Text style={text.muted}>Try · {content}</Text>
        {convert.error ? <ErrorState error={convert.error} /> : null}
        <TextField label="Day 제목" value={title} maxLength={200} onChangeText={setTitle} />
        <DateField label="실행 날짜 (선택)" value={plannedDate} fallback={today} onChange={changeDate} onClear={() => changeDate("")} />
        <TextField label="예상 시간(분)" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} />
        <FieldLabel>주간 목표 (선택)</FieldLabel>
        <View style={layout.rowWrap}>
          <Chip label="Goal 연결 안 함" selected={!goal} onPress={() => setGoalId("")} />
          {candidates.map((candidate) => (
            <Chip key={candidate.id} label={goalChipLabel(candidate)} selected={goal?.id === candidate.id} onPress={() => setGoalId(candidate.id)} />
          ))}
        </View>
      </Card>
      <Button
        label={convert.isPending ? "추가 중…" : "Day로 추가"}
        disabled={convert.isPending || invalid}
        onPress={() =>
          convert.mutate(
            {
              itemId,
              body: {
                goalId: goal ? goal.id : null,
                title: title.trim(),
                status: "NOT_STARTED",
                priority: "NONE",
                estimatedMinutes: Number(minutes),
                plannedDate: plannedDate === "" ? null : plannedDate,
                planningMode: "ANYTIME",
                coreDay: false,
              },
            },
            { onSuccess: () => router.back() },
          )
        }
      />
      <Button label="취소" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}