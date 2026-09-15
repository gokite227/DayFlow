import type { ReactNode } from "react";
import { describeApiError } from "@/lib/api-error";

export function LoadingState({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      {label}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Shows a server ProblemResponse (or a network failure) in a way users can act on. */
export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { message, fieldErrors } = describeApiError(error);

  return (
    <div className="notice error" role="alert">
      <div>{message}</div>
      {fieldErrors.length > 0 && (
        <ul>
          {fieldErrors.map((fieldError) => (
            <li key={`${fieldError.field}:${fieldError.message}`}>
              {fieldError.field}: {fieldError.message}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <button type="button" className="btn ghost small" style={{ marginTop: 8 }} onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
