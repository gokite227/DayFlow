import { Suspense } from "react";
import { LoadingState } from "@/components/query-state";
import { GoalsView } from "@/features/goals/goals-view";

// The view tabs read the query string (useSearchParams), which needs a Suspense boundary.
export default function GoalsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <GoalsView />
    </Suspense>
  );
}
