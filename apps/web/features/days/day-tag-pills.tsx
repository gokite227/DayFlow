import type { DayTagResponse } from "@dayflow/api-client";

/**
 * DAY-005 Tags of a Day, as small colored pills. `max` keeps dense surfaces (Calendar blocks,
 * Today rows) readable by showing "+N" instead of every Tag.
 */
export function DayTagPills({
  tags,
  max,
  onRemove,
}: {
  tags: readonly DayTagResponse[];
  max?: number;
  onRemove?: (tag: DayTagResponse) => void;
}) {
  if (tags.length === 0) return null;
  const shown = max === undefined ? tags : tags.slice(0, max);
  const hidden = tags.length - shown.length;

  return (
    <span className="tag-pills">
      {shown.map((tag) => (
        <span key={tag.id} className="tag-pill" style={{ borderColor: tag.color, color: tag.color }}>
          <span className="tag-dot" style={{ background: tag.color }} />
          {tag.name}
          {onRemove && (
            <button
              type="button"
              className="tag-pill-remove"
              aria-label={`${tag.name} 태그 제거`}
              onClick={() => onRemove(tag)}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {hidden > 0 && <span className="tag-pill more">+{hidden}</span>}
    </span>
  );
}
