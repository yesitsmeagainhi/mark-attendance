/**
 * Runs once when the Next.js server starts. Starts the hourly payslip
 * schedule (publish last month on the 1st, withdraw it on the 15th).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runPayslipScheduleSafely } = await import("./lib/payslip-schedule");
  runPayslipScheduleSafely();
  setInterval(runPayslipScheduleSafely, 60 * 60 * 1000).unref?.();
}
