import { getAppIdentity } from "../../../authz";

export async function GET() {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ valid: false }, { status: 401 });
  }
  return Response.json({ valid: true });
}
