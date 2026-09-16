"use client";

import type { DayTagResponse } from "@dayflow/api-client";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { useCreateDayTag, useDayTags, useDeleteDayTag, useUpdateDayTag } from "./day-tag-queries";
import {
  DAY_TAG_COLORS,
  MAX_DAY_TAG_NAME_LENGTH,
  isDuplicateTagName,
  sortTags,
  suggestTagColor,
  toCreateDayTagRequest,
  toUpdateDayTagRequest,
} from "./day-tag-values";

/**
 * DAY-005 Tag management: list, add, rename, recolor, reorder and delete. Deleting a Tag keeps the
 * Days and only removes their links, so the confirmation says so.
 */
export function DayTagManager({ onClose }: { onClose: () => void }) {
  const [newName, setNewName] = useState("");
  const tagsQuery = useDayTags();
  const createTag = useCreateDayTag();
  const updateTag = useUpdateDayTag();
  const deleteTag = useDeleteDayTag();

  const tags = sortTags(tagsQuery.data ?? []);
  const error = createTag.error ?? updateTag.error ?? deleteTag.error;
  const duplicate = newName.trim() !== "" && isDuplicateTagName(tags, newName);

  const create = () => {
    if (newName.trim() === "" || duplicate) return;
    createTag.mutate(toCreateDayTagRequest(newName, suggestTagColor(tags)), {
      onSuccess: () => setNewName(""),
    });
  };

  const move = (tag: DayTagResponse, direction: -1 | 1) => {
    const index = tags.findIndex((candidate) => candidate.id === tag.id);
    const neighbour = tags[index + direction];
    if (!neighbour) return;
    // Swapping the two sort orders is enough and needs no drag and drop.
    updateTag.mutate({ tagId: tag.id, body: toUpdateDayTagRequest({ sortOrder: neighbour.sortOrder }, tag.version) });
    updateTag.mutate({
      tagId: neighbour.id,
      body: toUpdateDayTagRequest({ sortOrder: tag.sortOrder }, neighbour.version),
    });
  };

  const rename = (tag: DayTagResponse, name: string) => {
    if (name.trim() === "" || name.trim() === tag.name || isDuplicateTagName(tags, name, tag.id)) return;
    updateTag.mutate({ tagId: tag.id, body: toUpdateDayTagRequest({ name }, tag.version) });
  };

  const remove = (tag: DayTagResponse) => {
    if (window.confirm(`"${tag.name}" 태그를 삭제할까요? Day는 지워지지 않고 태그 연결만 사라집니다.`)) {
      deleteTag.mutate(tag.id);
    }
  };

  return (
    <Modal label="DAY TAG" title="태그 관리" subtitle="생활·업무 영역을 나타내는 태그입니다." onClose={onClose}>
      {error ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorNotice error={error} />
        </div>
      ) : null}

      <div className="tag-create-line" style={{ marginBottom: 12 }}>
        <input
          type="text"
          maxLength={MAX_DAY_TAG_NAME_LENGTH}
          placeholder="새 태그 이름 (최대 30자)"
          aria-label="새 태그 이름"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <button type="button" className="btn small" onClick={create} disabled={createTag.isPending || duplicate}>
          {createTag.isPending ? "추가 중…" : "추가"}
        </button>
      </div>
      {duplicate && <div className="mini">같은 이름의 태그가 이미 있습니다.</div>}

      {tagsQuery.isPending ? (
        <LoadingState label="태그를 불러오는 중…" />
      ) : tagsQuery.isError ? (
        <ErrorNotice error={tagsQuery.error} onRetry={() => void tagsQuery.refetch()} />
      ) : tags.length === 0 ? (
        <EmptyState>아직 태그가 없습니다. 위에서 첫 태그를 만들어보세요.</EmptyState>
      ) : (
        <div className="tag-manage-list">
          {tags.map((tag, index) => (
            <div key={tag.id} className="tag-manage-row">
              <span className="tag-dot" style={{ background: tag.color }} />
              <input
                type="text"
                defaultValue={tag.name}
                maxLength={MAX_DAY_TAG_NAME_LENGTH}
                aria-label={`${tag.name} 이름`}
                onBlur={(event) => rename(tag, event.target.value)}
              />
              <select
                value={tag.color}
                aria-label={`${tag.name} 색상`}
                onChange={(event) =>
                  updateTag.mutate({
                    tagId: tag.id,
                    body: toUpdateDayTagRequest({ color: event.target.value }, tag.version),
                  })
                }
              >
                {DAY_TAG_COLORS.map((color) => (
                  <option key={color.value} value={color.value}>
                    {color.label}
                  </option>
                ))}
              </select>
              <div className="tag-manage-actions">
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label={`${tag.name} 위로`}
                  disabled={index === 0 || updateTag.isPending}
                  onClick={() => move(tag, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label={`${tag.name} 아래로`}
                  disabled={index === tags.length - 1 || updateTag.isPending}
                  onClick={() => move(tag, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn danger small"
                  onClick={() => remove(tag)}
                  disabled={deleteTag.isPending}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="modal-footer">
        <div className="end">
          <button type="button" className="btn secondary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
