import { getAppIdentity } from "../../../authz";
import { getFile } from "../../../../lib/storage";

export async function GET(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return new Response("Not authenticated", { status: 401 });
  }

  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.startsWith("attendance/")) {
    return new Response("Not found", { status: 404 });
  }

  // Employees can only view their own photos (photoKey format: attendance/{date}/{employeeId}/{id}.jpg)
  if (identity.role !== "admin") {
    const parts = key.split("/");
    if (parts.length < 3 || parts[2] !== identity.employeeId) {
      return new Response("Not authorized", { status: 403 });
    }
  }

  const object = getFile(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }
  const body = Uint8Array.from(object.body);

  return new Response(body, {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
