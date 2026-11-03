/**
 * Server-side switches, set in the server's .env (restart the app after changing):
 *   ENABLE_PUNCH_REMOVAL=true   shows "Punches" on the admin dashboard and allows
 *                               removing individual punches. Off when unset.
 */
export function isPunchRemovalEnabled(): boolean {
  return process.env.ENABLE_PUNCH_REMOVAL === "true";
}
