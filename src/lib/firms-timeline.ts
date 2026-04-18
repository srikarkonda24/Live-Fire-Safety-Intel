/** Tactical scrub: hours relative to “now” (local clock). */
export const TACTICAL_MIN_HOURS = -72;
export const TACTICAL_MAX_HOURS = 6;

/**
 * Earliest calendar day we allow for archive “jump to date”
 * (VIIRS S-NPP standard product is available from roughly 2012 onward).
 */
export const ARCHIVE_YMD_MIN = "2012-01-20";

/** Suggested starting day when opening archive (local calendar). */
export function defaultArchiveJumpYmd(): string {
  return ymdLocalAddDays(-7);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar `YYYY-MM-DD` for the instant `now + hoursFromNow`. */
export function ymdLocalFromHoursOffset(hoursFromNow: number): string {
  const d = new Date();
  d.setTime(d.getTime() + hoursFromNow * 60 * 60 * 1000);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

/** `YYYY-MM-DD` for NASA `date` param, or `null` when using NASA “most recent” (no date segment). */
export function firmsDateFromTacticalHours(hoursFromNow: number): null | string {
  if (hoursFromNow === 0) return null;
  return ymdLocalFromHoursOffset(hoursFromNow);
}

/** Local `YYYY-MM-DD` for “today” (wall clock). */
export function ymdLocalToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

export function ymdLocalAddDays(deltaDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

/** Clamp a picker value to FIRMS archive-friendly [ARCHIVE_YMD_MIN, local today]. */
export function normalizeArchiveYmd(raw: string): string {
  if (!YMD_RE.test(raw)) return defaultArchiveJumpYmd();
  if (raw < ARCHIVE_YMD_MIN) return ARCHIVE_YMD_MIN;
  const hi = ymdLocalToday();
  if (raw > hi) return hi;
  return raw;
}

/** Slider 0..78 maps linearly to hours in [TACTICAL_MIN_HOURS, TACTICAL_MAX_HOURS]; 72 = present. */
export function hoursFromTacticalSliderPosition(position0To78: number): number {
  const p = Math.min(78, Math.max(0, position0To78));
  return TACTICAL_MIN_HOURS + (p / 78) * (TACTICAL_MAX_HOURS - TACTICAL_MIN_HOURS);
}

export function tacticalSliderPositionFromHours(hours: number): number {
  const h = Math.min(TACTICAL_MAX_HOURS, Math.max(TACTICAL_MIN_HOURS, hours));
  return ((h - TACTICAL_MIN_HOURS) / (TACTICAL_MAX_HOURS - TACTICAL_MIN_HOURS)) * 78;
}

/** Format local wall time for the tactical offset (for UI, not NASA). */
export function formatLocalDateTimeFromHoursOffset(hoursFromNow: number): string {
  const d = new Date();
  d.setTime(d.getTime() + hoursFromNow * 60 * 60 * 1000);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
