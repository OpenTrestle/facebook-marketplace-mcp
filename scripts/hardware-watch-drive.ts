/**
 * Resolve the single authorized "Hardware Watch Alert Inbox" directory.
 * This inspects directory names only under recognized local Google Drive roots.
 * It does not read report contents, upload anything, or search arbitrary files.
 */
import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export const HARDWARE_WATCH_DRIVE_INBOX_NAME = "Hardware Watch Alert Inbox";
const MAX_NESTED_DEPTH = 3;
const MAX_VISITED_DIRECTORIES = 2000;

export type WatchDriveResolution = {
  status: "configured" | "auto_discovered" | "missing" | "invalid_config" | "ambiguous" | "discovery_limit";
  path: string | null;
  matches: number;
};

async function directoryExists(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory(); }
  catch { return false; }
}

/** Explicit configured path wins. An invalid one fails closed without fallback. */
export async function resolveWatchDriveFolder(
  options: { home?: string; configuredPath?: string | null; maxVisited?: number } = {},
): Promise<WatchDriveResolution> {
  const configured = options.configuredPath?.trim();
  if (configured) {
    const path = resolve(configured);
    if (basename(path) !== HARDWARE_WATCH_DRIVE_INBOX_NAME || !(await directoryExists(path))) {
      return { status: "invalid_config", path: null, matches: 0 };
    }
    return { status: "configured", path, matches: 1 };
  }

  const home = options.home ?? homedir();
  const roots: string[] = [join(home, "Google Drive", "My Drive")];
  const cloudStorage = join(home, "Library", "CloudStorage");
  try {
    const entries = await readdir(cloudStorage, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("GoogleDrive-")) {
        roots.push(join(cloudStorage, entry.name, "My Drive"));
      }
    }
  } catch { /* Google Drive for desktop is not necessarily mounted here. */ }

  const seenDirectories = new Set<string>();
  const matches = new Set<string>();
  let visited = 0;
  const maxVisited = options.maxVisited ?? MAX_VISITED_DIRECTORIES;
  for (const root of roots) {
    if (!(await directoryExists(root))) continue;
    const queue = [{ path: root, depth: 0 }];
    while (queue.length) {
      if (visited >= maxVisited) {
        return { status: "discovery_limit", path: null, matches: matches.size };
      }
      const { path, depth } = queue.shift()!;
      const canonical = await realpath(path).catch(() => path);
      if (seenDirectories.has(canonical)) continue;
      seenDirectories.add(canonical);
      visited++;
      if (basename(path) === HARDWARE_WATCH_DRIVE_INBOX_NAME) {
        matches.add(canonical);
        continue;
      }
      if (depth >= MAX_NESTED_DEPTH) continue;
      try {
        const children = await readdir(path, { withFileTypes: true });
        for (const child of children) {
          if (child.isDirectory()) queue.push({ path: join(path, child.name), depth: depth + 1 });
        }
      } catch { /* Unreadable folders do not authorize any upload. */ }
    }
  }
  if (matches.size > 1) return { status: "ambiguous", path: null, matches: matches.size };
  if (matches.size === 1) return { status: "auto_discovered", path: [...matches][0], matches: 1 };
  return { status: "missing", path: null, matches: 0 };
}
