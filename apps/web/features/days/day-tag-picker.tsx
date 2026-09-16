"use client";

import type { DayTagResponse } from "@dayflow/api-client";
import { useState } from "react";
import { ErrorNotice } from "@/components/query-state";
import { DayTagPills } from "./day-tag-pills";
import { useCreateDayTag, useDayTags } from "./day-tag-queries";
import {
  DAY_TAG_COLORS,
  MAX_DAY_TAG_NAME_LENGTH,
  MAX_TAGS_PER_DAY,
  isDuplicateTagName,
  sortTags,
  suggestTagColor,
  toCreateDayTagRequest,
} from "./day-tag-values";

/**
 * DAY-005 Tag field of the Day form: pick several existing Tags or create one inline, without
 * leaving the form. Full Tag management lives on the Days screen (태그 관리).
 */
export function DayTagPicker({
  selectedIds,
  onChange,
}: {
  selectedIds: readonly string[];
  onChange: (tagIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const tagsQuery = useDayTags();
  const createTag = useCreateDayTag();

  const tags = sortTags(tagsQuery.data ?? []);
  const selected = selectedIds
    .map((id) => tags.find((tag) => tag.id === id))
    .filter((tag): tag is DayTagResponse => tag !== undefined);
  const full = selectedIds.length >= MAX_TAGS_PER_DAY;
  const duplicate = newName.trim() !== "" && isDuplicateTagName(tags, newName);

  const toggle = (tagId: string) => {
    if (selectedIds.includes(tagId)) {
      onChange(selectedIds.filter((id) => id !== tagId));
    } else if (!full) {
      onChange([...selectedIds, tagId]);
    }
  };

  const createAndSelect = () => {
    const name = newName.trim();
    if (name === "" || duplicate) return;
    createTag.mutate(toCreateDayTagRequest(name, suggestTagColor(tags)), {
      onSuccess: (tag) => {
        setNewName("");
        if (!full) onChange([...selectedIds, tag.id]);
      },
    });
  };

  return (
    <div className="field wide">
      <span className="field-label">태그</span>
      <div className="tag-picker">
        <DayTagPills tags={selected} onRemove={(tag) => toggle(tag.id)} />
        <button type="button" className="btn ghost small" onClick={() => setOpen((value) => !value)}>
          {open ? "태그 닫기" : "+ 태그"}
        </button>
      </div>

      {open && (
        <div className="tag-popover">
          {tagsQuery.isPending ? (
            <div className="mini">태그를 불러오는 중…</div>
          ) : tagsQuery.isError ? (
            <ErrorNotice error={tagsQuery.error} onRetry={() => void tagsQuery.refetch()} />
          ) : tags.length === 0 ? (
            <div className="mini">아직 태그가 없습니다. 아래에서 새로 만들어보세요.</div>
          ) : (
            <div className="tag-choice-list">
              {tags.map((tag) => {
                const checked = selectedIds.includes(tag.id);
                return (
                  <label key={tag.id} className="tag-choice">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && full}
                      onChange={() => toggle(tag.id)}
                    />
                    <span className="tag-dot" style={{ background: tag.color }} />
                    <span>{tag.name}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="tag-create-line">
            <input
              type="text"
              maxLength={MAX_DAY_TAG_NAME_LENGTH}
              placeholder="새 태그 이름"
              aria-label="새 태그 이름"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <button
              type="button"
              className="btn small"
              onClick={createAndSelect}
              disabled={newName.trim() === "" || duplicate || createTag.isPending}
            >
              {createTag.isPending ? "추가 중…" : "태그 추가"}
            </button>
          </div>
          {duplicate && <div className="mini">같은 이름의 태그가 이미 있습니다.</div>}
          {createTag.error ? <ErrorNotice error={createTag.error} /> : null}
          <div className="mini">
            색상은 DayFlow 팔레트({DAY_TAG_COLORS.length}색)에서 자동으로 고르고, 태그 관리에서 바꿀 수 있습니다.
            {full && " 한 Day에는 최대 10개까지 붙일 수 있습니다."}
          </div>
        </div>
      )}
    </div>
  );
}
