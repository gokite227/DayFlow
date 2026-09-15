import { Suspense } from "react";
import { LoadingState } from "@/components/query-state";
import { GoalDetailView } from "@/features/goals/goal-detail-view";

// The WEEK detail reads ?layout= (useSearchParams), which needs a Suspense boundary.
export default async function GoalDetailPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  return (
    <Suspense fallback={<LoadingState />}>
      <GoalDetailView goalId={goalId} />
    </Suspense>
  );
}
