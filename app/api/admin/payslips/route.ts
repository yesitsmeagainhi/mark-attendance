import { requireApiRole } from "../../../authz";
import { logActivity } from "../../../../lib/activity-logger";
import { currentMonthIST, isValidMonth, monthLabel, payslipMonthStatus, publishPayslips, unpublishPayslips } from "../../../../lib/payslips";
import { autoMonthState, autoWindow, isAutoPayslipsEnabled, isValidWithdrawDay, MAX_WITHDRAW_DAY, MIN_WITHDRAW_DAY, ordinal, runPayslipScheduleSafely, setAutoPayslipsEnabled, setWithdrawDay } from "../../../../lib/payslip-schedule";

/** Publish status for a month: ?month=YYYY-MM */
export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;
  const month = new URL(request.url).searchParams.get("month") || "";
  if (!isValidMonth(month)) return Response.json({ error: "month must be YYYY-MM." }, { status: 400 });
  runPayslipScheduleSafely();
  return Response.json({
    month,
    canPublish: month < currentMonthIST(),
    ...payslipMonthStatus(month),
    auto: { enabled: isAutoPayslipsEnabled(), ...autoWindow(month), ...autoMonthState(month) },
  });
}

/**
 * Change the automatic schedule: { autoEnabled?, withdrawDay? }
 * withdrawDay: day of the month payslips are withdrawn (2–28), or 0 = never.
 */
export async function PATCH(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;
  let body: { autoEnabled?: boolean; withdrawDay?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (body.autoEnabled === undefined && body.withdrawDay === undefined) {
    return Response.json({ error: "Nothing to change." }, { status: 400 });
  }
  if (body.autoEnabled !== undefined && typeof body.autoEnabled !== "boolean") {
    return Response.json({ error: "autoEnabled must be true or false." }, { status: 400 });
  }
  if (body.withdrawDay !== undefined && !isValidWithdrawDay(body.withdrawDay)) {
    return Response.json({ error: `Withdrawal day must be between ${MIN_WITHDRAW_DAY} and ${MAX_WITHDRAW_DAY}, or 0 for never.` }, { status: 400 });
  }

  if (body.autoEnabled !== undefined) {
    setAutoPayslipsEnabled(body.autoEnabled);
    logActivity({
      actionType: "rule_updated",
      performedBy: auth.identity.employeeId,
      performedByName: auth.identity.displayName,
      description: `${auth.identity.displayName} turned automatic payslips ${body.autoEnabled ? "on" : "off"}`,
      metadata: { autoEnabled: body.autoEnabled },
    });
  }
  if (body.withdrawDay !== undefined) {
    setWithdrawDay(body.withdrawDay);
    logActivity({
      actionType: "rule_updated",
      performedBy: auth.identity.employeeId,
      performedByName: auth.identity.displayName,
      description: body.withdrawDay
        ? `${auth.identity.displayName} set payslips to be withdrawn automatically on the ${ordinal(body.withdrawDay)} of the month`
        : `${auth.identity.displayName} set payslips to stay visible (no automatic withdrawal)`,
      metadata: { withdrawDay: body.withdrawDay },
    });
  }
  // A new withdrawal day may make a step due right away
  runPayslipScheduleSafely();
  return Response.json({ ok: true, autoEnabled: isAutoPayslipsEnabled(), withdrawDay: body.withdrawDay });
}

async function readMonth(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as { month?: string };
    return body.month && isValidMonth(body.month) ? body.month : null;
  } catch {
    return null;
  }
}

/** Publish or re-publish payslips for a finished month: { month } */
export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;
  const month = await readMonth(request);
  if (!month) return Response.json({ error: "month must be YYYY-MM." }, { status: 400 });
  if (month >= currentMonthIST()) {
    return Response.json({ error: "Payslips can be published once the month has ended." }, { status: 400 });
  }

  const republish = payslipMonthStatus(month).published;
  const count = publishPayslips(month, auth.identity.employeeId);
  logActivity({
    actionType: "payslips_published",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: month,
    targetName: monthLabel(month),
    description: `${auth.identity.displayName} ${republish ? "re-published" : "published"} ${monthLabel(month)} payslips for ${count} employees`,
    metadata: { month, count },
  });
  return Response.json({ ok: true, ...payslipMonthStatus(month), count });
}

/** Withdraw a month's payslips from employees: { month } */
export async function DELETE(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;
  const month = await readMonth(request);
  if (!month) return Response.json({ error: "month must be YYYY-MM." }, { status: 400 });
  const removed = unpublishPayslips(month);
  logActivity({
    actionType: "payslips_unpublished",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: month,
    targetName: monthLabel(month),
    description: `${auth.identity.displayName} withdrew ${monthLabel(month)} payslips (${removed} employees)`,
  });
  return Response.json({ ok: true, removed });
}
