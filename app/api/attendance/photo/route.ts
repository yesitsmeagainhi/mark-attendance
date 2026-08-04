import { requireApiRole } from "../../../authz";
import { getFile } from "../../../../lib/storage";

export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.startsWith("attendance/")) {
    return new Response("Not found", { status: 404 });
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
