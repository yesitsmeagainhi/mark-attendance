/**
 * Weekly off (rotating).
 *
 * Every employee gets one day off per Mon–Sun week, on whichever day they
 * actually take it — there is no fixed off day. Within each week, looking only
 * at non-holiday days:
 *
 *  1. If they skipped a day, that day is their week-off (not an absence).
 *     Preference: a past Sunday, else the earliest past day; if nothing in the
 *     past was skipped yet, a not-yet-reached day (Sunday first).
 *  2. Else, if they were on leave / UH, one of those days becomes the week-off.
 *  3. Else they worked every day: one worked day (Sunday if worked, else the
 *     last worked day) is their week-off worked → 1 day's extra pay.
 *
 * Any further skipped days in the week are ordinary absences.
 *
 * Callers must classify every day of the full weeks returned by `weekBounds`
 * (including days outside the month) so weeks spanning two months resolve the
 * same way in both months' payroll.
 */

export type DayKind =
  | "holiday" // company holiday — never a week-off
  | "worked" // has IN + OUT (or IN today, still working)
  | "excused" // approved leave / admin UH
  | "off"; // didn't work (no punches, incomplete punch, or not reached yet)

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, n: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: string): number {
  return parse(date).getUTCDay();
}

/** All dates from `from` to `to` inclusive. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Expand a range to whole Mon–Sun weeks. */
export function weekBounds(from: string, to: string): { start: string; end: string } {
  const start = addDays(from, -((dayOfWeek(from) + 6) % 7));
  const end = addDays(to, (7 - dayOfWeek(to)) % 7);
  return { start, end };
}

export function resolveWeekOffs(
  from: string,
  to: string,
  kindOf: (date: string) => DayKind,
  today: string,
): { weekOff: Set<string>; extraPay: Set<string> } {
  const weekOff = new Set<string>();
  const extraPay = new Set<string>();
  const { start, end } = weekBounds(from, to);

  for (let monday = start; monday <= end; monday = addDays(monday, 7)) {
    const sunday = addDays(monday, 6);
    const days = eachDate(monday, sunday)
      .map((date) => ({ date, kind: kindOf(date) }))
      .filter((d) => d.kind !== "holiday");
    if (days.length === 0) continue;

    const pick = (dates: string[]) => (dates.includes(sunday) ? sunday : dates[0]);

    const off = days.filter((d) => d.kind === "off").map((d) => d.date);
    if (off.length > 0) {
      const past = off.filter((d) => d < today);
      weekOff.add(pick(past.length > 0 ? past : off));
      continue;
    }

    const excused = days.filter((d) => d.kind === "excused").map((d) => d.date);
    if (excused.length > 0) {
      weekOff.add(pick(excused));
      continue;
    }

    const worked = days.map((d) => d.date);
    extraPay.add(worked.includes(sunday) ? sunday : worked[worked.length - 1]);
  }

  return { weekOff, extraPay };
}
