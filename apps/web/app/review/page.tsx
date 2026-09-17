import { Suspense } from "react";
import { LoadingState } from "@/components/query-state";
import { ReviewView } from "@/features/review/review-view";

// Review reads ?mode=&type=&date=&q= (useSearchParams), which needs a Suspense boundary.
export default function ReviewPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ReviewView />
    </Suspense>
  );
}
