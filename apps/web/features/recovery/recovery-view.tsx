"use client";

import type { ApplyRecoveryResponse, DayResponse, GoalResponse, RecoveryDayResponse } from "@dayflow/api-client";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { addDays, formatKoreanDate } from "@/features/calendar/calendar-time";
import { useDays, useUpdateDay } from "@/features/days/day-queries";
import { DAY_STATUS_LABEL } from "@/features/days/day-values";
import { useGoals } from "@/features/goals/goal-queries";
import { isOpen } from "@/features/review/review-summary";
import { isStaleDataError } from "@/lib/api-error";
import { useToday } from "@/lib/use-today";
import {
  RECOVERY_ACTIONS,
  RECOVERY_ACTION_LABEL,
  draftProblem,
  initialDraft,
  moveRange,
  previewLines,
  shortDate,
  toApplyRequest,
  type RecoveryDraft,
} from "./recovery-plan";
import {
  useApplyRecovery,
  useDeleteRecoveryDay,
  useRecoveryDays,
  useSaveRecoveryDay,
} from "./recovery-queries";

const PROBLEM_MESSAGE = {
  reduceMinutes: "지금 예상 시간보다 작은 값으로 정해주세요.",
  reduceTitle: "제목을 비워둘 수 없어요.",
  moveDate: "주간 목표 기간 안의 오늘 이후 날짜를 골라주세요.",
} as const;

export function RecoveryView() {
  const today = useToday();
  return (
    <>
      <PageHeader
        title="Recovery"
        subtitle="지난 계획을 오늘 기준으로 다시 정리합니다. 확인하기 전에는 아무것도 바뀌지 않아요."
        action={today && <span className="pill">{formatKoreanDate(today)}</span>}
      />
      {today === null ? (
        <LoadingState />
      ) : (
        <div className="stack">
          <MissedDaysSection today={today} />
          <RecoveryDaySection today={today} />
        </div>
      )}
    </>
  );
}

/** A snapshot of what the user confirmed: apply sends exactly these Day versions. */
interface Preview {
  days: DayResponse[];
  drafts: Record<string, RecoveryDraft>;
}

function MissedDaysSection({ today }: { today: string }) {
  const daysQuery = useDays({ to: addDays(today, -1) });
  const goalsQuery = useGoals();
  const apply = useApplyRecovery();
  const [drafts, setDrafts] = useState<Record<string, RecoveryDraft>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<ApplyRecoveryResponse | null>(null);

  const goalsById = new Map((goalsQuery.data ?? []).map((goal) => [goal.id, goal]));
  const missed = (daysQuery.data ?? [])
    .filter(isOpen)
    .sort((a, b) => (a.plannedDate ?? "").localeCompare(b.plannedDate ?? "") || a.title.localeCompare(b.title));
  const rangeOf = (day: DayResponse) => moveRange(goalsById.get(day.goalId), today);
  const draftOf = (day: DayResponse) => drafts[day.id] ?? initialDraft(day, rangeOf(day)?.min ?? null);
  const hasProblem = missed.some((day) => draftProblem(day, draftOf(day), rangeOf(day)) !== null);

  const updateDraft = (day: DayResponse, change: Partial<RecoveryDraft>) =>
    setDrafts((current) => ({ ...current, [day.id]: { ...draftOf(day), ...change } }));

  const openPreview = () => {
    apply.reset();
    setApplied(null);
    setPreview({ days: missed, drafts: Object.fromEntries(missed.map((day) => [day.id, draftOf(day)])) });
  };

  const confirm = (snapshot: Preview) =>
    apply.mutate(toApplyRequest(today, snapshot.days, snapshot.drafts), {
      onSuccess: (response) => {
        setApplied(response);
        setPreview(null);
        setDrafts({});
      },
      onError: (error) => {
        // Someone changed a Day after the preview: go back so the user reviews the latest state.
        if (isStaleDataError(error)) setPreview(null);
      },
    });

  if (preview) {
    return <PreviewCard preview={preview} pending={apply.isPending} error={apply.error} onBack={() => setPreview(null)} onConfirm={confirm} />;
  }

  return (
    <section className="card">
      <h3 className="card-title">지난 계획 다시 정리하기</h3>
      <div className="mini" style={{ marginBottom: 12 }}>
        어제까지 계획했지만 아직 끝나지 않은 Day예요. 하나씩 오늘 기준으로 어떻게 할지 골라주세요. 자동으로 옮기지 않아요.
      </div>
      {applied && (
        <div className="notice success" style={{ marginBottom: 12 }} role="status">
          다시 정리했어요. Day {applied.days.length}개에 반영했습니다.{" "}
          <Link href="/today">Today로 돌아가기</Link>
        </div>
      )}
      {apply.error && (
        <div style={{ marginBottom: 12 }}>
          <ErrorNotice error={apply.error} />
        </div>
      )}
      {daysQuery.isPending || goalsQuery.isPending ? (
        <LoadingState />
      ) : daysQuery.isError ? (
        <ErrorNotice error={daysQuery.error} onRetry={() => void daysQuery.refetch()} />
      ) : goalsQuery.isError ? (
        <ErrorNotice error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
      ) : missed.length === 0 ? (
        <EmptyState>
          다시 정리할 지난 계획이 없어요. <Link href="/today">Today</Link>에서 오늘 계획을 이어가세요.
        </EmptyState>
      ) : (
        <>
          <div className="recovery-list">
            {missed.map((day) => (
              <MissedDayRow
                key={day.id}
                day={day}
                goal={goalsById.get(day.goalId)}
                draft={draftOf(day)}
                range={rangeOf(day)}
                onChange={(change) => updateDraft(day, change)}
              />
            ))}
          </div>
          <div className="modal-footer">
            <span className="mini">{hasProblem ? "입력을 확인해주세요." : `Day ${missed.length}개`}</span>
            <div className="end">
              <button type="button" className="btn" disabled={hasProblem} onClick={openPreview}>
                변경 미리보기
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function MissedDayRow({
  day,
  goal,
  draft,
  range,
  onChange,
}: {
  day: DayResponse;
  goal: GoalResponse | undefined;
  draft: RecoveryDraft;
  range: { min: string; max: string } | null;
  onChange: (change: Partial<RecoveryDraft>) => void;
}) {
  const problem = draftProblem(day, draft, range);
  return (
    <div className="recovery-row" data-day-id={day.id}>
      <div className="recovery-row-head">
        <div>
          <strong>{day.title}</strong>
          {day.coreDay && <span className="core-badge">핵심</span>}
          <div className="mini">
            {day.plannedDate && `${shortDate(day.plannedDate)} 계획`} · {day.estimatedMinutes}분
            {goal && ` · ${goal.title}`}
          </div>
        </div>
        <span className="mini">{DAY_STATUS_LABEL[day.status]}</span>
      </div>

      <div className="recovery-actions" role="radiogroup" aria-label={`${day.title} 정리 방법`}>
        {RECOVERY_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            role="radio"
            aria-checked={draft.action === action}
            className={draft.action === action ? "active" : undefined}
            disabled={action === "MOVE" && range === null}
            onClick={() => onChange({ action })}
          >
            {RECOVERY_ACTION_LABEL[action]}
          </button>
        ))}
      </div>

      {draft.action === "KEEP" && <div className="mini" style={{ marginTop: 8 }}>날짜와 내용을 바꾸지 않아요.</div>}

      {draft.action === "REDUCE" && (
        <div className="recovery-fields">
          <label className="field">
            <span className="field-label">예상 시간(분) · 지금 {day.estimatedMinutes}분</span>
            <input
              type="number"
              min={1}
              max={day.estimatedMinutes - 1}
              value={Number.isNaN(draft.estimatedMinutes) ? "" : draft.estimatedMinutes}
              onChange={(event) => onChange({ estimatedMinutes: event.target.valueAsNumber })}
            />
          </label>
          <label className="field">
            <span className="field-label">제목 (작게 바꿔도 좋아요)</span>
            <input maxLength={200} value={draft.title} onChange={(event) => onChange({ title: event.target.value })} />
          </label>
        </div>
      )}

      {draft.action === "MOVE" && range && (
        <div className="recovery-fields">
          <label className="field">
            <span className="field-label">새 날짜 (시간 배치는 해제돼요)</span>
            <input
              type="date"
              min={range.min}
              max={range.max}
              value={draft.plannedDate}
              onChange={(event) => onChange({ plannedDate: event.target.value })}
            />
          </label>
        </div>
      )}

      {range === null && (
        <div className="mini" style={{ marginTop: 8 }}>
          주간 목표 기간이 지나서 날짜만 옮길 수는 없어요. 다른 주에 다시 하려면 <Link href="/days">Days</Link>에서 목표와
          날짜를 함께 바꿔주세요.
        </div>
      )}

      {draft.action === "DROP" && (
        <div className="mini" style={{ marginTop: 8 }}>
          상태를 &apos;건너뜀&apos;으로 바꿔요. 삭제하지 않으니 Review에서 기록을 다시 볼 수 있어요.
        </div>
      )}

      {problem && (
        <div className="field-error" style={{ marginTop: 6 }}>
          {PROBLEM_MESSAGE[problem]}
        </div>
      )}
    </div>
  );
}

function PreviewCard({
  preview,
  pending,
  error,
  onBack,
  onConfirm,
}: {
  preview: Preview;
  pending: boolean;
  error: unknown;
  onBack: () => void;
  onConfirm: (preview: Preview) => void;
}) {
  const lines = previewLines(preview.days, preview.drafts);
  const keepCount = preview.days.length - lines.length;
  return (
    <section className="card" aria-label="변경 미리보기">
      <h3 className="card-title">이번 계획을 다시 정리할까요?</h3>
      <div className="mini">확인을 누르기 전까지는 아무것도 바뀌지 않아요.</div>
      {error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorNotice error={error} />
        </div>
      ) : null}
      {lines.length > 0 && (
        <div className="preview-list">
          {lines.map((line) => (
            <div key={line.dayId} className="preview-row">
              <div>
                <strong>{line.title}</strong>
                <div className="mini">{line.detail}</div>
              </div>
              <span className="goal-type">{RECOVERY_ACTION_LABEL[line.action]}</span>
            </div>
          ))}
        </div>
      )}
      <div className="review-note" style={{ marginTop: 12 }}>
        {keepCount > 0 ? `그대로 두는 Day ${keepCount}개는 바뀌지 않아요.` : "모든 Day에 새 방향을 정했어요."}
      </div>
      <div className="modal-footer">
        <div className="end">
          <button type="button" className="btn secondary" onClick={onBack} disabled={pending}>
            돌아가서 고치기
          </button>
          <button type="button" className="btn" onClick={() => onConfirm(preview)} disabled={pending}>
            {pending ? "적용 중…" : "확인하고 적용"}
          </button>
        </div>
      </div>
    </section>
  );
}

function RecoveryDaySection({ today }: { today: string }) {
  const recoveryQuery = useRecoveryDays(today, today);
  const todayDaysQuery = useDays({ from: today, to: today });

  return (
    <section className="card">
      <h3 className="card-title">Recovery Day</h3>
      <div className="mini" style={{ marginBottom: 12 }}>
        오늘은 속도를 낮추고 회복하는 날로 정할 수 있어요. 핵심 Day를 0~1개로 줄이고, 다시 평소 계획으로 돌아올 날을 정해요.
      </div>
      {recoveryQuery.isPending || todayDaysQuery.isPending ? (
        <LoadingState />
      ) : recoveryQuery.isError ? (
        <ErrorNotice error={recoveryQuery.error} onRetry={() => void recoveryQuery.refetch()} />
      ) : todayDaysQuery.isError ? (
        <ErrorNotice error={todayDaysQuery.error} onRetry={() => void todayDaysQuery.refetch()} />
      ) : (
        <RecoveryDayForm
          key={recoveryQuery.data[0]?.version ?? "new"}
          today={today}
          existing={recoveryQuery.data[0] ?? null}
          todayDays={todayDaysQuery.data}
        />
      )}
    </section>
  );
}

const NO_CORE = "none";

function RecoveryDayForm({
  today,
  existing,
  todayDays,
}: {
  today: string;
  existing: RecoveryDayResponse | null;
  todayDays: DayResponse[];
}) {
  const coreDays = todayDays.filter((day) => day.coreDay && isOpen(day));
  const [keepCoreId, setKeepCoreId] = useState(coreDays[0]?.id ?? NO_CORE);
  const [returnDate, setReturnDate] = useState(existing ? (existing.returnDate ?? "") : addDays(today, 1));
  const [note, setNote] = useState(existing?.note ?? "");
  const [pendingCore, setPendingCore] = useState(false);
  const updateDay = useUpdateDay();
  const save = useSaveRecoveryDay();
  const release = useDeleteRecoveryDay();
  const busy = pendingCore || save.isPending || release.isPending;
  const error = updateDay.error ?? save.error ?? release.error;

  const submit = async () => {
    updateDay.reset();
    save.reset();
    setPendingCore(true);
    try {
      // Unmark the other core Days one by one; the PATCH contract checks each version.
      for (const day of coreDays.filter((core) => core.id !== keepCoreId)) {
        await updateDay.mutateAsync({ dayId: day.id, body: { version: day.version, coreDay: false } });
      }
    } catch {
      return;
    } finally {
      setPendingCore(false);
    }
    save.mutate({
      date: today,
      body: { returnDate: returnDate === "" ? null : returnDate, note: note.trim(), expectedVersion: existing?.version ?? null },
    });
  };

  return (
    <>
      {existing && (
        <div className="recovery-banner" style={{ marginBottom: 12 }}>
          <span>
            <strong>오늘은 Recovery Day예요.</strong>
            {existing.returnDate ? ` ${shortDate(existing.returnDate)}에 다시 평소 계획으로 돌아와요.` : " 돌아올 날은 아직 정하지 않았어요."}
          </span>
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 12 }}>
          <ErrorNotice error={error} />
        </div>
      )}

      {coreDays.length > 1 ? (
        <>
          <div className="field-label">오늘 남길 핵심 Day (지금 {coreDays.length}개)</div>
          <div className="recovery-core-options" role="radiogroup">
            <label>
              <input type="radio" name="keep-core" checked={keepCoreId === NO_CORE} onChange={() => setKeepCoreId(NO_CORE)} />
              핵심 Day 없이 쉬어가기
            </label>
            {coreDays.map((day) => (
              <label key={day.id}>
                <input type="radio" name="keep-core" checked={keepCoreId === day.id} onChange={() => setKeepCoreId(day.id)} />
                {day.title}만 핵심으로 남기기
              </label>
            ))}
          </div>
          <div className="mini" style={{ marginBottom: 10 }}>
            나머지는 핵심 표시만 해제되고 Day는 그대로 남아요.
          </div>
        </>
      ) : coreDays.length === 1 ? (
        <>
          <div className="recovery-core-options" role="radiogroup" aria-label="오늘 남길 핵심 Day">
            <label>
              <input type="radio" name="keep-core" checked={keepCoreId === coreDays[0]?.id} onChange={() => setKeepCoreId(coreDays[0]?.id ?? NO_CORE)} />
              {coreDays[0]?.title}을(를) 핵심으로 남기기
            </label>
            <label>
              <input type="radio" name="keep-core" checked={keepCoreId === NO_CORE} onChange={() => setKeepCoreId(NO_CORE)} />
              핵심 Day 없이 쉬어가기
            </label>
          </div>
        </>
      ) : (
        <div className="mini" style={{ marginBottom: 10 }}>
          오늘 남아 있는 핵심 Day가 없어요.
        </div>
      )}

      <div className="form-grid">
        <label className="field">
          <span className="field-label">돌아올 날 (선택)</span>
          <input type="date" min={addDays(today, 1)} value={returnDate} onChange={(event) => setReturnDate(event.target.value)} />
        </label>
        <label className="field wide">
          <span className="field-label">오늘의 메모 (선택)</span>
          <input
            maxLength={500}
            placeholder="예: 오늘은 컨디션을 회복하는 데 집중하기"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>

      <div className="modal-footer">
        {existing && (
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => release.mutate(today)}
          >
            Recovery Day 해제
          </button>
        )}
        <div className="end">
          <button type="button" className="btn" disabled={busy} onClick={() => void submit()}>
            {busy ? "저장 중…" : existing ? "Recovery Day 저장" : "오늘을 Recovery Day로 정하기"}
          </button>
        </div>
      </div>
    </>
  );
}
