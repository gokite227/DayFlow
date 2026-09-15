import type { LocalDate } from "./types";

/**
 * Internal wall-clock helpers built on Intl, so the domain package needs no
 * timezone library. Inputs are expected to be schema-validated.
 */
export interface ZonedDateTimeParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** Wall-clock date and time of an instant in an IANA timezone. */
export function getZonedDateTimeParts(
  instantMs: number,
  timezone: string,
): ZonedDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instantMs);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
    millisecond: ((instantMs % 1000) + 1000) % 1000,
  };
}

/** How far the timezone's wall clock is ahead of UTC at the instant, in ms. */
function getOffsetMs(instantMs: number, timezone: string): number {
  const wall = getZonedDateTimeParts(instantMs, timezone);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );
  return wallAsUtc - instantMs;
}

/**
 * The instant at which the timezone's wall clock shows the given parts. The
 * offset is re-read once so DST changes between the two dates are respected;
 * a wall time that does not exist (DST gap) shifts by the size of the gap.
 */
export function zonedDateTimeToInstant(
  parts: ZonedDateTimeParts,
  timezone: string,
): number {
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  const firstGuess = wallAsUtc - getOffsetMs(wallAsUtc, timezone);
  return wallAsUtc - getOffsetMs(firstGuess, timezone);
}

type DateParts = Pick<ZonedDateTimeParts, "year" | "month" | "day">;

export function formatLocalDate(parts: DateParts): LocalDate {
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function parseLocalDate(date: LocalDate): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return {
    year: Number(match?.[1]),
    month: Number(match?.[2]),
    day: Number(match?.[3]),
  };
}

/** ISO-8601 with the timezone's offset at that instant, e.g. 2026-09-15T19:00:00+09:00. */
export function formatOffsetDateTime(instantMs: number, timezone: string): string {
  const wall = getZonedDateTimeParts(instantMs, timezone);
  const offsetMinutes = Math.round(getOffsetMs(instantMs, timezone) / 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const fraction = wall.millisecond === 0 ? "" : `.${pad(wall.millisecond, 3)}`;

  return (
    `${formatLocalDate(wall)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}` +
    `${fraction}${sign}${pad(Math.floor(absoluteMinutes / 60))}:${pad(absoluteMinutes % 60)}`
  );
}
