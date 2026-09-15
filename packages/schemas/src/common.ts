import type { DomainIssue } from "@dayflow/domain";
import { z } from "zod";

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const entityIdSchema = z.uuid();
export const localDateSchema = z.string().refine(isCalendarDate, {
  message: "Expected a valid calendar date in YYYY-MM-DD format.",
});
export const offsetDateTimeSchema = z.string().datetime({ offset: true });
export const timezoneSchema = z.string().min(1).refine(isIanaTimezone, {
  message: "Expected a valid IANA timezone.",
});
export const prioritySchema = z.int().nonnegative();
export const versionSchema = z.int().nonnegative();
export const titleSchema = z.string().trim().min(1).max(200);

/** Reports domain rule violations as Zod issues, keeping the domain code in params. */
export function addDomainIssues(
  context: z.core.$RefinementCtx,
  issues: readonly DomainIssue[],
): void {
  for (const issue of issues) {
    context.addIssue({
      code: "custom",
      message: issue.message,
      path: [...issue.path],
      params: { domainCode: issue.code },
    });
  }
}
