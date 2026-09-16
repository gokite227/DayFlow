import { GoalFlowView } from "@/features/goals/goal-flow-view";

export default async function GoalFlowPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  return <GoalFlowView goalId={goalId} />;
}
