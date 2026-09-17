import { Stack, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { parseReviewDetailParams } from "@/features/review/review-archive";
import { REVIEW_TYPE_LABEL, reviewPeriod } from "@/features/review/review-helpers";
import { useToday } from "@/lib/use-today";
import { ReviewPeriodContent } from "@/screens/review-screen";
import { EmptyState, Screen, useTextStyles } from "@/ui/components";

/**
 * One saved review opened from 회고 모아보기: the same editor as 회고 작성 (edits keep the usual rules), on the
 * stack with a back button. The period identity (type + periodStart) only reaches the current user's review.
 */
export default function ReviewDetailScreen() {
  const text = useTextStyles();
  const today = useToday();
  const target = parseReviewDetailParams(useLocalSearchParams<{ type?: string; periodStart?: string }>());
  if (!target) {
    return (
      <Screen>
        <EmptyState>회고를 찾을 수 없어요.</EmptyState>
      </Screen>
    );
  }
  const period = reviewPeriod(target.type, target.periodStart);
  return (
    <Screen>
      <Stack.Screen options={{ title: `${REVIEW_TYPE_LABEL[target.type]} 회고` }} />
      <Text style={text.title}>
        {REVIEW_TYPE_LABEL[target.type]} 회고 · {period.label}
      </Text>
      {/* Archive detail: no AI draft (회고 작성 only). */}
      <ReviewPeriodContent key={`${period.type}:${period.start}`} period={period} today={today} showCoach={false} />
    </Screen>
  );
}
