/**
 * Read-only Hardware Watch diagnostic.
 * Outputs structured health evidence without reading Facebook session secrets.
 * No Facebook requests, scheduler changes, state mutations or Drive uploads.
 */
import { execFile as execFileCallback } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { loadActiveWatchConfig, configPaths } from "./hardware-watch-config.js";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(path: string): Promise<any | null> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function latestReport(root: string): Promise<Record<string, any> | null> {
  let files: string[] = [];
  try { files = (await readdir(root)).filter((name) => /^report-.*\.json$/.test(name)).sort().reverse(); }
  catch { return null; }
  for (const file of files.slice(0, 20)) {
    const report = await readJson(join(root, file));
    if (report && asIso(report.runAt)) return { ...report, diagnosticFilename: file };
  }
  return null;
}

async function readLaunchdLabels(): Promise<{ status: string; matches: string[] }> {
  if (platform() !== "darwin") return { status: "not_macos", matches: [] };
  try {
    const { stdout } = await execFile("launchctl", ["list"], { timeout: 5000, maxBuffer: 512 * 1024 });
    const matches = stdout.split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).at(-1) ?? "")
      .filter((label) => /hardware|deal.?scout|marketplace|facebook/i.test(label));
    return { status: "read", matches };
  } catch {
    return { status: "unavailable", matches: [] };
  }
}

async function driveFolderPresence(): Promise<{ configuredPathExists: boolean | null; autoDiscovered: boolean }> {
  const configured = process.env.HARDWARE_WATCH_DRIVE_FOLDER_PATH;
  if (configured) {
    try { return { configuredPathExists: (await stat(configured)).isDirectory(), autoDiscovered: false }; }
    catch { return { configuredPathExists: false, autoDiscovered: false }; }
  }
  try {
    const cloud = join(homedir(), "Library", "CloudStorage");
    const entries = await readdir(cloud, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("GoogleDrive-")) continue;
      try {
        if ((await stat(join(cloud, entry.name, "My Drive", "Hardware Watch Alert Inbox"))).isDirectory()) {
          return { configuredPathExists: null, autoDiscovered: true };
        }
      } catch { /* No authorized matching folder in this mount. */ }
    }
  } catch { /* Cloud Storage may be absent. */ }
  return { configuredPathExists: null, autoDiscovered: false };
}

export async function diagnoseWatch(root: string, now = new Date()): Promise<Record<string, unknown>> {
  const config = await loadActiveWatchConfig(root);
  const savedState = await readJson(join(root, "state.json"));
  const report = await latestReport(root);
  const paths = configPaths(root);
  const activeFilePresent = await stat(paths.active).then(() => true).catch(() => false);
  const pendingFilePresent = await stat(paths.pending).then(() => true).catch(() => false);
  const reportAt = asIso(report?.runAt);
  const ageHours = reportAt ? Math.round((now.getTime() - Date.parse(reportAt)) / 3600000 * 10) / 10 : null;
  const macQueries = config.queries.filter((item) => item.kind === "mac");
  const warnings: string[] = [];
  if (!report) warnings.push("No readable saved Hardware Watch report exists.");
  else if (ageHours !== null && ageHours > 36) warnings.push("Latest local report is older than 36 hours; check scheduling and search/report delivery.");
  if (!macQueries.some((item) => /mac\s+mini/i.test(item.query))) warnings.push("Active configuration does not search for Mac minis.");
  if (report?.driveUpload?.status && report.driveUpload.status !== "uploaded") warnings.push("Last report was not confirmed uploaded to Drive.");
  if (Array.isArray(report?.errors) && report.errors.length) warnings.push("Latest report contains search errors.");
  if (report && Array.isArray(report.results)) {
    const caps = report.results.filter((result: any) => macQueries.some((item) =>
      item.query === result.query && result.kind === "mac" && Number(result.count) >= item.limit));
    if (caps.length) warnings.push("One or more Mac searches reached their per-query result limit.");
  }
  return {
    readOnly: true,
    liveMarketplaceSearchPerformed: false,
    facebookAuthenticationVerified: false,
    outputRoot: root,
    activeConfigFilePresent: activeFilePresent,
    pendingConfigFilePresent: pendingFilePresent,
    state: {
      lastRunAt: asIso(savedState?.lastRunAt),
      seenIdsCount: Array.isArray(savedState?.seenIds) ? savedState.seenIds.length : null,
      lastSnapshotIdsCount: Array.isArray(savedState?.lastSnapshotIds) ? savedState.lastSnapshotIds.length : null,
    },
    activeQueries: {
      total: config.queries.length,
      mac: macQueries.map(({ query, limit, maxPages }) => ({ query, limit, maxPages })),
      proxmoxCount: config.queries.filter((item) => item.kind === "proxmox").length,
    },
    lastReport: report ? {
      filename: report.diagnosticFilename,
      runAt: reportAt,
      ageHours,
      previousRunAt: asIso(report.previousRunAt),
      rawCount: Array.isArray(report.rawListings) ? report.rawListings.length : null,
      newCandidatesCount: Array.isArray(report.newListings) ? report.newListings.length : null,
      errorsCount: Array.isArray(report.errors) ? report.errors.length : null,
      driveUploadStatus: report.driveUpload?.status ?? null,
      querySummary: Array.isArray(report.results)
        ? report.results.map((r: any) => ({ kind: r.kind, query: r.query, count: r.count, error: Boolean(r.error) }))
        : [],
    } : null,
    warnings,
  };
}

// Never automatically scan the user's files upon import; execute only on CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(process.env.HARDWARE_WATCH_OUTPUT_DIR ?? join(repoRoot, ".local", "hardware-watch"));
  const result = await diagnoseWatch(root);
  const launchd = await readLaunchdLabels();
  const drive = await driveFolderPresence();
  console.log(JSON.stringify({ ...result, launchd, drive, validationNeeded: [
    "Verify that actual local scheduled job exists and references this checkout.",
    "Verify Facebook authentication with a separate approved bounded read-only search.",
    "Validate exact active configuration and that Google Drive receives a fresh report.",
    "Do not claim the watcher is healthy based only on an empty alert list.",
  ] }, null, 2));
}
