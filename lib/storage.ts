import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";

const UPLOADS_ROOT = resolve(process.cwd(), "data", "uploads");

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

function safePath(key: string): string {
  const filePath = resolve(UPLOADS_ROOT, key);
  if (!filePath.startsWith(UPLOADS_ROOT)) {
    throw new Error("Invalid storage key");
  }
  return filePath;
}

export function putFile(
  key: string,
  data: ArrayBuffer | Buffer,
  options?: { contentType?: string },
): void {
  const filePath = safePath(key);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const fileData =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : data;

  writeFileSync(filePath, fileData);
  if (options?.contentType) {
    writeFileSync(
      filePath + ".meta",
      JSON.stringify({ contentType: options.contentType }),
    );
  }
}

export function getFile(key: string): StoredObject | null {
  const filePath = safePath(key);
  if (!existsSync(filePath)) return null;

  const body = readFileSync(filePath);
  let contentType = "application/octet-stream";

  const metaPath = filePath + ".meta";
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      contentType = meta.contentType || contentType;
    } catch {
      // fall through to default
    }
  }

  return { body, contentType };
}

export function deleteFile(key: string): void {
  const filePath = safePath(key);
  try {
    unlinkSync(filePath);
  } catch {
    // Ignore if file doesn't exist
  }
  try {
    unlinkSync(filePath + ".meta");
  } catch {
    // Ignore
  }
}
