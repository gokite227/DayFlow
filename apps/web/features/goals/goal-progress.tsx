import type { DayResponse, GoalResponse } from "@dayflow/api-client";
import { formatRate, summarizeGoal } from "@/features/review/review-summary";

/**
 * GOAL-003: AUTO progress is the existing Day-completion rate of the Goal and its descendants (the same
 * calculation as Review; let-go Days are not counted). MANUAL has no stored value yet, so nothing is invented.
 */
export function GoalProgress({
  goal,
  goals,
  days,
}: {
  goal: GoalResponse;
  goals: readonly GoalResponse[];
  days: readonly DayResponse[] | undefined;
}) {
  if (goal.progressPolicy === "MANUAL") {
    return <div className="mini">수동 진행률 · 아직 입력된 값이 없어요</div>;
  }
  if (days === undefined) {
    return <div className="mini">진행률 계산 중…</div>;
  }
  const summary = summarizeGoal(goals, days, goal.id);
  const rate = summary.completionRate;
  return (
    <div className="progress-line" title={`완료 Day ${summary.done}/${summary.total - summary.skipped}`}>
      <div className="progress">
        <span style={{ width: `${Math.round((rate ?? 0) * 100)}%` }} />
      </div>
      <strong className="progress-value">{formatRate(rate)}</strong>
    </div>
  );
}
