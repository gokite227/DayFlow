"use client";

import type { GoalResponse } from "@dayflow/api-client";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { GoalFormModal, type GoalFormTarget } from "./goal-form-modal";
import { useDeleteGoal, useGoals } from "./goal-queries";
import {
  GOAL_TYPE_LABEL,
  GOAL_TYPE_ORDER,
  PROGRESS_POLICY_LABEL,
  buildGoalTree,
  childTypeOf,
  formatPeriod,
  goalPath,
  sortGoals,
  type GoalNode,
  type GoalType,
} from "./goal-tree";

type GoalTab = "ALL" | GoalType;

function yearPeriod() {
  const year = new Date().getFullYear();
  return { defaultStart: `${year}-01-01`, defaultEnd: `${year}-12-31` };
}

export function GoalsView() {
  const [tab, setTab] = useState<GoalTab>("ALL");
  const [formTarget, setFormTarget] = useState<GoalFormTarget | null>(null);
  const goalsQuery = useGoals();
  const deleteGoal = useDeleteGoal();
  const goals = goalsQuery.data ?? [];

  // Starting another action dismisses a previous delete error.
  const openCreate = (type: GoalType, parent: GoalResponse | null) => {
    deleteGoal.reset();
    setFormTarget({ mode: "create", type, parent, ...yearPeriod() });
  };

  const actions: GoalActions = {
    addChild: (goal) => {
      const childType = childTypeOf(goal.type);
      if (childType) openCreate(childType, goal);
    },
    edit: (goal) => {
      deleteGoal.reset();
      setFormTarget({ mode: "edit", goal });
    },
    remove: (goal) => {
      if (window.confirm(`"${goal.title}" 목표를 삭제할까요? 되돌릴 수 없습니다.`)) {
        deleteGoal.mutate(goal.id);
      }
    },
    deletingId: deleteGoal.isPending ? deleteGoal.variables : undefined,
  };

  return (
    <>
      <PageHeader
        title="Goals"
        subtitle="연간 → 분기 → 월간 → 주간까지 목표를 쪼개고, 주간 아래에서 Day를 계획합니다."
        action={
          <button type="button" className="btn" onClick={() => openCreate("YEAR", null)}>
            + 새 연간 목표
          </button>
        }
      />

      <div className="goal-tabs" role="tablist" aria-label="목표 단계">
        {(["ALL", ...GOAL_TYPE_ORDER] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "active" : undefined}
            onClick={() => setTab(value)}
          >
            {value === "ALL" ? "전체" : GOAL_TYPE_LABEL[value]}
          </button>
        ))}
      </div>

      {deleteGoal.error && (
        <div style={{ marginBottom: 14 }}>
          <ErrorNotice error={deleteGoal.error} />
        </div>
      )}

      {goalsQuery.isPending ? (
        <LoadingState label="목표를 불러오는 중…" />
      ) : goalsQuery.isError ? (
        <ErrorNotice error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
      ) : goals.length === 0 ? (
        <div className="card">
          <EmptyState>
            아직 목표가 없습니다. <strong>+ 새 연간 목표</strong>로 첫 목표를 만들어보세요.
          </EmptyState>
        </div>
      ) : tab === "ALL" ? (
        <div className="goal-tree">
          {buildGoalTree(goals).map((node) => (
            <GoalTreeNode key={node.goal.id} node={node} actions={actions} root />
          ))}
        </div>
      ) : (
        <GoalTypeList goals={goals} type={tab} actions={actions} />
      )}

      {formTarget && <GoalFormModal target={formTarget} goals={goals} onClose={() => setFormTarget(null)} />}
    </>
  );
}

interface GoalActions {
  addChild: (goal: GoalResponse) => void;
  edit: (goal: GoalResponse) => void;
  remove: (goal: GoalResponse) => void;
  deletingId: string | undefined;
}

function GoalTreeNode({ node, actions, root = false }: { node: GoalNode; actions: GoalActions; root?: boolean }) {
  return (
    <div>
      <GoalCard goal={node.goal} actions={actions} root={root} />
      {node.children.length > 0 && (
        <div className="goal-children">
          {node.children.map((child) => (
            <GoalTreeNode key={child.goal.id} node={child} actions={actions} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalTypeList({ goals, type, actions }: { goals: GoalResponse[]; type: GoalType; actions: GoalActions }) {
  const ofType = sortGoals(goals.filter((goal) => goal.type === type));
  if (ofType.length === 0) {
    return (
      <div className="card">
        <EmptyState>{GOAL_TYPE_LABEL[type]} 목표가 없습니다.</EmptyState>
      </div>
    );
  }
  return (
    <div className="goal-tree">
      {ofType.map((goal) => (
        <GoalCard
          key={goal.id}
          goal={goal}
          actions={actions}
          path={goalPath(goals, goal)
            .slice(0, -1)
            .map((ancestor) => ancestor.title)
            .join(" › ")}
        />
      ))}
    </div>
  );
}

function GoalCard({
  goal,
  actions,
  root = false,
  path,
}: {
  goal: GoalResponse;
  actions: GoalActions;
  root?: boolean;
  path?: string;
}) {
  const childType = childTypeOf(goal.type);
  const deleting = actions.deletingId === goal.id;

  return (
    <article className={`goal-node${root ? " root" : ""}`} aria-busy={deleting}>
      <div className="goal-node-head">
        <div style={{ minWidth: 0 }}>
          <span className="goal-type">{GOAL_TYPE_LABEL[goal.type]}</span>{" "}
          <span className="mini">{formatPeriod(goal)}</span>
          <div className="goal-node-title">{goal.title}</div>
          {path && <div className="goal-path">{path}</div>}
          <div className="mini">
            우선순위 {goal.priority} · {PROGRESS_POLICY_LABEL[goal.progressPolicy]}
          </div>
          {goal.why && <div className="goal-why">{goal.why}</div>}
        </div>
        <div className="card-actions">
          {childType && (
            <button type="button" className="btn secondary small" onClick={() => actions.addChild(goal)}>
              + {GOAL_TYPE_LABEL[childType]}
            </button>
          )}
          <button type="button" className="btn ghost small" onClick={() => actions.edit(goal)}>
            수정
          </button>
          <button
            type="button"
            className="btn danger small"
            onClick={() => actions.remove(goal)}
            disabled={deleting}
          >
            {deleting ? "삭제 중…" : "삭제"}
          </button>
        </div>
      </div>
    </article>
  );
}
