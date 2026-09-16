"use client";

import type { EventCategoryResponse } from "@dayflow/api-client";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import {
  useCreateEventCategory,
  useDeleteEventCategory,
  useEventCategories,
  useUpdateEventCategory,
} from "./event-category-queries";
import {
  EVENT_CATEGORY_COLORS,
  MAX_EVENT_CATEGORY_NAME_LENGTH,
  UNCATEGORIZED_LABEL,
  countByCategory,
  isDuplicateCategoryName,
  sortCategories,
  suggestCategoryColor,
  toCreateEventCategoryRequest,
  toUpdateEventCategoryRequest,
} from "./event-category-values";
import { useEvents } from "./event-queries";

/**
 * EVT-006 Category management: list, add, rename, recolor, reorder and delete. Deleting a Category
 * keeps its Events as uncategorized, so the confirmation says so.
 */
export function EventCategoryManager({ onClose }: { onClose: () => void }) {
  const [newName, setNewName] = useState("");
  const categoriesQuery = useEventCategories();
  const eventsQuery = useEvents();
  const createCategory = useCreateEventCategory();
  const updateCategory = useUpdateEventCategory();
  const deleteCategory = useDeleteEventCategory();

  const categories = sortCategories(categoriesQuery.data ?? []);
  const counts = countByCategory(eventsQuery.data ?? []);
  const error = createCategory.error ?? updateCategory.error ?? deleteCategory.error;
  const duplicate = newName.trim() !== "" && isDuplicateCategoryName(categories, newName);

  const create = () => {
    if (newName.trim() === "" || duplicate) return;
    createCategory.mutate(toCreateEventCategoryRequest(newName, suggestCategoryColor(categories)), {
      onSuccess: () => setNewName(""),
    });
  };

  const move = (category: EventCategoryResponse, direction: -1 | 1) => {
    const index = categories.findIndex((candidate) => candidate.id === category.id);
    const neighbour = categories[index + direction];
    if (!neighbour) return;
    // Swapping the two sort orders is enough and needs no drag and drop.
    updateCategory.mutate({
      categoryId: category.id,
      body: toUpdateEventCategoryRequest({ sortOrder: neighbour.sortOrder }, category.version),
    });
    updateCategory.mutate({
      categoryId: neighbour.id,
      body: toUpdateEventCategoryRequest({ sortOrder: category.sortOrder }, neighbour.version),
    });
  };

  const rename = (category: EventCategoryResponse, name: string) => {
    if (name.trim() === "" || name.trim() === category.name || isDuplicateCategoryName(categories, name, category.id)) {
      return;
    }
    updateCategory.mutate({ categoryId: category.id, body: toUpdateEventCategoryRequest({ name }, category.version) });
  };

  const remove = (category: EventCategoryResponse) => {
    if (
      window.confirm(
        `"${category.name}" 카테고리를 삭제할까요?\n이 카테고리를 삭제해도 일정은 삭제되지 않고 '${UNCATEGORIZED_LABEL}'로 남아요.`,
      )
    ) {
      deleteCategory.mutate(category.id);
    }
  };

  return (
    <Modal
      label="EVENT CATEGORY"
      title="카테고리 관리"
      subtitle="일정의 종류를 직접 정합니다. Day 태그와는 별개예요."
      onClose={onClose}
    >
      {error ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorNotice error={error} />
        </div>
      ) : null}

      <div className="tag-create-line" style={{ marginBottom: 12 }}>
        <input
          type="text"
          maxLength={MAX_EVENT_CATEGORY_NAME_LENGTH}
          placeholder="새 카테고리 이름 (최대 30자)"
          aria-label="새 카테고리 이름"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <button type="button" className="btn small" onClick={create} disabled={createCategory.isPending || duplicate}>
          {createCategory.isPending ? "추가 중…" : "추가"}
        </button>
      </div>
      {duplicate && <div className="mini">같은 이름의 카테고리가 이미 있습니다.</div>}

      {categoriesQuery.isPending ? (
        <LoadingState label="카테고리를 불러오는 중…" />
      ) : categoriesQuery.isError ? (
        <ErrorNotice error={categoriesQuery.error} onRetry={() => void categoriesQuery.refetch()} />
      ) : categories.length === 0 ? (
        <EmptyState>카테고리가 없습니다. 일정은 모두 &apos;{UNCATEGORIZED_LABEL}&apos;로 보여요.</EmptyState>
      ) : (
        <div className="tag-manage-list">
          {categories.map((category, index) => (
            <div key={category.id} className="tag-manage-row">
              <span className="tag-dot" style={{ background: category.color }} />
              <input
                type="text"
                defaultValue={category.name}
                maxLength={MAX_EVENT_CATEGORY_NAME_LENGTH}
                aria-label={`${category.name} 이름`}
                onBlur={(event) => rename(category, event.target.value)}
              />
              <select
                value={category.color}
                aria-label={`${category.name} 색상`}
                onChange={(event) =>
                  updateCategory.mutate({
                    categoryId: category.id,
                    body: toUpdateEventCategoryRequest({ color: event.target.value }, category.version),
                  })
                }
              >
                {EVENT_CATEGORY_COLORS.map((color) => (
                  <option key={color.value} value={color.value}>
                    {color.label}
                  </option>
                ))}
              </select>
              <div className="tag-manage-actions">
                <span className="mini" aria-label={`${category.name} 일정 수`}>
                  {counts.get(category.id) ?? 0}개
                </span>
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label={`${category.name} 위로`}
                  disabled={index === 0 || updateCategory.isPending}
                  onClick={() => move(category, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label={`${category.name} 아래로`}
                  disabled={index === categories.length - 1 || updateCategory.isPending}
                  onClick={() => move(category, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn danger small"
                  onClick={() => remove(category)}
                  disabled={deleteCategory.isPending}
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
