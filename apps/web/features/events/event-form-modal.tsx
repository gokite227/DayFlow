"use client";

import type { EventCategorySummary, EventRecurrence, EventResponse } from "@dayflow/api-client";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { ErrorNotice, LoadingState } from "@/components/query-state";
import { useGoals } from "@/features/goals/goal-queries";
import { GOAL_TYPE_LABEL, sortGoals } from "@/features/goals/goal-tree";
import { useEventCategories } from "./event-category-queries";
import { UNCATEGORIZED_LABEL, categoryStyle, sortCategories } from "./event-category-values";
import { useCreateEvent, useDeleteEvent, useEvent, useUpdateEvent } from "./event-queries";
import {
  MAX_REMINDERS,
  MAX_REMINDER_OFFSET_MINUTES,
  RECURRENCE_LABEL,
  REMINDER_PRESETS,
  eventFormProblem,
  eventToValues,
  newEventValues,
  reminderLabel,
  toCreateEventRequest,
  toUpdateEventRequest,
  type EventFormValues,
} from "./event-values";

export type EventFormTarget = { mode: "create"; date: string } | { mode: "edit"; eventId: string };

const PROBLEM_MESSAGE = {
  timezone: "올바른 IANA timezone을 입력해주세요. 예: Asia/Seoul",
  endBeforeStart: "종료가 시작보다 빠를 수 없습니다.",
  reminders: `알림은 서로 다른 시간으로 최대 ${MAX_REMINDERS}개까지 설정할 수 있어요.`,
} as const;

/** Event create/edit. Changing an Event's time is only possible here (CAL-005: no drag/resize). */
export function EventFormModal({ target, onClose }: { target: EventFormTarget; onClose: () => void }) {
  if (target.mode === "create") {
    return <EventForm initial={newEventValues(target.date)} editing={null} onClose={onClose} />;
  }
  return <EditEventLoader eventId={target.eventId} onClose={onClose} />;
}

function EditEventLoader({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const eventQuery = useEvent(eventId);
  if (eventQuery.data) {
    return <EventForm initial={eventToValues(eventQuery.data)} editing={eventQuery.data} onClose={onClose} />;
  }
  return (
    <Modal label="EVENT" title="일정" onClose={onClose}>
      {eventQuery.isError ? <ErrorNotice error={eventQuery.error} /> : <LoadingState label="일정을 불러오는 중…" />}
    </Modal>
  );
}

function EventForm({
  initial,
  editing,
  onClose,
}: {
  initial: EventFormValues;
  /** The Event as loaded when the form opened; its version guards the save. */
  editing: EventResponse | null;
  onClose: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [customMinutes, setCustomMinutes] = useState("");
  const goalsQuery = useGoals();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

  const saving = createEvent.isPending || updateEvent.isPending;
  const busy = saving || deleteEvent.isPending;
  const error = createEvent.error ?? updateEvent.error ?? deleteEvent.error;
  const problem = eventFormProblem(values);
  const goals = sortGoals(goalsQuery.data ?? []);
  const categoriesQuery = useEventCategories();
  const categories = sortCategories(categoriesQuery.data ?? []);
  // Keeps the saved Category selectable while the list loads or after it was deleted elsewhere.
  const categoryOptions: EventCategorySummary[] =
    editing?.category && !categories.some((category) => category.id === editing.category?.id)
      ? [...categories, editing.category]
      : categories;
  const selectedCategory = categoryOptions.find((category) => category.id === values.categoryId) ?? null;

  const set = <Key extends keyof EventFormValues>(key: Key, value: EventFormValues[Key]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const toggleReminder = (offset: number) =>
    set(
      "reminders",
      values.reminders.includes(offset)
        ? values.reminders.filter((current) => current !== offset)
        : [...values.reminders, offset].sort((a, b) => a - b),
    );

  const customOffset = Number(customMinutes);
  const canAddCustom =
    customMinutes !== "" &&
    Number.isInteger(customOffset) &&
    customOffset >= 0 &&
    customOffset <= MAX_REMINDER_OFFSET_MINUTES &&
    !values.reminders.includes(customOffset) &&
    values.reminders.length < MAX_REMINDERS;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    if (editing) {
      updateEvent.mutate({ eventId: editing.id, body: toUpdateEventRequest(values, editing.version) }, { onSuccess: onClose });
    } else {
      createEvent.mutate(toCreateEventRequest(values), { onSuccess: onClose });
    }
  };

  const remove = () => {
    if (editing && window.confirm(`"${editing.title}" 일정을 삭제할까요? 반복 일정이면 모든 반복이 함께 삭제됩니다.`)) {
      deleteEvent.mutate({ eventId: editing.id, version: editing.version }, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      label="EVENT"
      title={editing ? editing.title : "새 일정"}
      subtitle="이미 정해진 일정입니다. 시간 변경은 이 화면에서 저장해야 반영돼요."
      onClose={onClose}
    >
      <form onSubmit={submit} className="event-form">
        {error && (
          <div style={{ marginBottom: 12 }}>
            <ErrorNotice error={error} />
          </div>
        )}

        <div className="form-grid">
          <label className="field wide">
            <span className="field-label">제목</span>
            <input
              required
              maxLength={200}
              value={values.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="예: 포트폴리오 제출 마감"
            />
          </label>

          <label className="field wide">
            <span className="field-label">카테고리</span>
            <span className="event-category-select">
              <span
                className="tag-dot"
                aria-hidden
                style={{ background: categoryStyle(selectedCategory)["--event-color"] }}
              />
              <select
                aria-label="카테고리"
                value={values.categoryId}
                onChange={(event) => set("categoryId", event.target.value)}
              >
                <option value="">{UNCATEGORIZED_LABEL}</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="switch-line field wide">
            <input type="checkbox" checked={values.allDay} onChange={(event) => set("allDay", event.target.checked)} />
            <span>하루 종일</span>
          </label>

          <label className="field">
            <span className="field-label">{values.allDay ? "시작 날짜" : "시작"}</span>
            <span className="event-when">
              <input
                type="date"
                required
                aria-label="시작 날짜"
                value={values.startDate}
                onChange={(event) => {
                  const startDate = event.target.value;
                  setValues((current) => ({
                    ...current,
                    startDate,
                    endDate: current.endDate < startDate ? startDate : current.endDate,
                  }));
                }}
              />
              {!values.allDay && (
                <input
                  type="time"
                  required
                  aria-label="시작 시간"
                  value={values.startTime}
                  onChange={(event) => set("startTime", event.target.value)}
                />
              )}
            </span>
          </label>

          <label className="field">
            <span className="field-label">{values.allDay ? "마지막 날짜" : "종료"}</span>
            <span className="event-when">
              <input
                type="date"
                required
                aria-label="종료 날짜"
                min={values.startDate}
                value={values.endDate}
                onChange={(event) => set("endDate", event.target.value)}
              />
              {!values.allDay && (
                <input
                  type="time"
                  required
                  aria-label="종료 시간"
                  value={values.endTime}
                  onChange={(event) => set("endTime", event.target.value)}
                />
              )}
            </span>
          </label>

          <label className="field">
            <span className="field-label">Timezone</span>
            <input
              required
              maxLength={64}
              value={values.timezone}
              onChange={(event) => set("timezone", event.target.value.trim())}
              placeholder="Asia/Seoul"
            />
          </label>

          <label className="field">
            <span className="field-label">반복</span>
            <select value={values.recurrence} onChange={(event) => set("recurrence", event.target.value as EventRecurrence)}>
              {(Object.keys(RECURRENCE_LABEL) as EventRecurrence[]).map((recurrence) => (
                <option key={recurrence} value={recurrence}>
                  {RECURRENCE_LABEL[recurrence]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">장소 (선택)</span>
            <input maxLength={200} value={values.location} onChange={(event) => set("location", event.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">연결 목표 (선택)</span>
            <select value={values.linkedGoalId} onChange={(event) => set("linkedGoalId", event.target.value)}>
              <option value="">연결 안 함</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  [{GOAL_TYPE_LABEL[goal.type]}] {goal.title}
                </option>
              ))}
            </select>
          </label>

          <div className="field wide">
            <span className="field-label">
              알림 ({values.reminders.length}/{MAX_REMINDERS}){values.allDay ? " · 하루 종일 일정은 그날 09:00 기준" : ""}
            </span>
            <div className="event-reminders">
              {REMINDER_PRESETS.map((offset) => {
                const active = values.reminders.includes(offset);
                return (
                  <button
                    key={offset}
                    type="button"
                    aria-pressed={active}
                    className={`reminder-chip${active ? " active" : ""}`}
                    disabled={!active && values.reminders.length >= MAX_REMINDERS}
                    onClick={() => toggleReminder(offset)}
                  >
                    {reminderLabel(offset)}
                  </button>
                );
              })}
              {values.reminders
                .filter((offset) => !REMINDER_PRESETS.includes(offset))
                .map((offset) => (
                  <button
                    key={offset}
                    type="button"
                    aria-pressed
                    className="reminder-chip active"
                    onClick={() => toggleReminder(offset)}
                    title="눌러서 제거"
                  >
                    {reminderLabel(offset)} ×
                  </button>
                ))}
            </div>
            <div className="field-row" style={{ marginTop: 6 }}>
              <input
                type="number"
                min={0}
                max={MAX_REMINDER_OFFSET_MINUTES}
                step={1}
                aria-label="사용자 지정 알림(분 전)"
                placeholder="사용자 지정: 분 전"
                value={customMinutes}
                onChange={(event) => setCustomMinutes(event.target.value)}
              />
              <button
                type="button"
                className="btn ghost small"
                disabled={!canAddCustom}
                onClick={() => {
                  toggleReminder(customOffset);
                  setCustomMinutes("");
                }}
              >
                알림 추가
              </button>
            </div>
            <span className="mini">알림 데이터만 저장됩니다. 기기 알림은 모바일 앱에서 제공될 예정이에요.</span>
          </div>

          <label className="field wide">
            <span className="field-label">메모 (선택)</span>
            <textarea rows={3} maxLength={2000} value={values.notes} onChange={(event) => set("notes", event.target.value)} />
          </label>
        </div>

        {problem && (
          <div className="field-error" style={{ marginTop: 10 }}>
            {PROBLEM_MESSAGE[problem]}
          </div>
        )}

        <div className="modal-footer">
          {editing && (
            <button type="button" className="btn danger small" onClick={remove} disabled={busy}>
              {deleteEvent.isPending ? "삭제 중…" : "삭제"}
            </button>
          )}
          <div className="end">
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button type="submit" className="btn" disabled={busy || problem !== null}>
              {saving ? "저장 중…" : editing ? "저장" : "추가"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
