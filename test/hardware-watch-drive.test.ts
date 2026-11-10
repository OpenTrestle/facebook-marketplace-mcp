import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveWatchDriveFolder } from "../scripts/hardware-watch-drive.js";

async function withFakeHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "watch-drive-resolve-"));
  try { await run(home); } finally { await rm(home, { recursive: true, force: true }); }
}

test("finds the actual nested-drive structure without hardcoding account or portal names", async () => {
  await withFakeHome(async (home) => {
    const inbox = join(home, "Google Drive", "My Drive", "Example Portal", "Product & Architecture", "Hardware Watch Alert Inbox");
    await mkdir(inbox, { recursive: true });
    const result = await resolveWatchDriveFolder({ home });
    assert.equal(result.status, "auto_discovered");
    assert.equal(result.path, await realpath(inbox));
    assert.equal(result.matches, 1);
  });
});

test("supports GoogleDrive- mounted Drive roots in Library/CloudStorage", async () => {
  await withFakeHome(async (home) => {
    const inbox = join(home, "Library", "CloudStorage", "GoogleDrive-test", "My Drive", "Hardware Watch Alert Inbox");
    await mkdir(inbox, { recursive: true });
    const result = await resolveWatchDriveFolder({ home });
    assert.equal(result.status, "auto_discovered");
    assert.equal(result.path, await realpath(inbox));
  });
});

test("returns ambiguity rather than choosing one of multiple authorized-looking inboxes", async () => {
  await withFakeHome(async (home) => {
    const a = join(home, "Google Drive", "My Drive", "Portal A", "Hardware Watch Alert Inbox");
    const b = join(home, "Google Drive", "My Drive", "Portal B", "Hardware Watch Alert Inbox");
    await Promise.all([mkdir(a, { recursive: true }), mkdir(b, { recursive: true })]);
    const result = await resolveWatchDriveFolder({ home });
    assert.equal(result.status, "ambiguous");
    assert.equal(result.path, null);
    assert.equal(result.matches, 2);
  });
});

test("explicit path takes precedence; an invalid explicit path must not fall back silently", async () => {
  await withFakeHome(async (home) => {
    const inbox = join(home, "Google Drive", "My Drive", "Portal", "Hardware Watch Alert Inbox");
    await mkdir(inbox, { recursive: true });
    assert.equal((await resolveWatchDriveFolder({ home, configuredPath: inbox })).status, "configured");
    const invalid = await resolveWatchDriveFolder({ home, configuredPath: join(home, "Does not exist", "Hardware Watch Alert Inbox") });
    assert.equal(invalid.status, "invalid_config");
    assert.equal(invalid.path, null);
    assert.equal((await resolveWatchDriveFolder({ home, configuredPath: join(home, "Google Drive", "My Drive") })).status, "invalid_config");
  });
});

test("does not scan beyond three nested directories or exceed bounded directory count", async () => {
  await withFakeHome(async (home) => {
    const inbox = join(home, "Google Drive", "My Drive", "L1", "L2", "L3", "L4", "Hardware Watch Alert Inbox");
    await mkdir(inbox, { recursive: true });
    assert.equal((await resolveWatchDriveFolder({ home })).status, "missing");
    assert.equal((await resolveWatchDriveFolder({ home, maxVisited: 1 })).status, "discovery_limit");
  });
});
