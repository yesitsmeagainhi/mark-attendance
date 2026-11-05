import { resolve } from "node:path";

/**
 * Absolute path inside the app's runtime data folder (database, selfies, backups).
 *
 * Kept in its own function so the bundler can't work out the folder at build
 * time: when it could, Next traced every file in data/uploads and printed
 * "file pattern matches N files" warnings on each build.
 */
export function dataPath(...parts: string[]): string {
  const root = process.env.ATTENDLY_DATA_DIR || resolve(/* turbopackIgnore: true */ process.cwd(), "data");
  return resolve(root, ...parts);
}
