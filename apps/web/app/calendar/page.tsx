import { Suspense } from "react";
import { LoadingState } from "@/components/query-state";
import { CalendarView } from "@/features/calendar/calendar-view";

// ?date= deep links (from Goal period labels) are read with useSearchParams, which needs Suspense.
export default function CalendarPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CalendarView />
    </Suspense>
  );
}
