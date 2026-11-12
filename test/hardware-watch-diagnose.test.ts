import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnoseWatch } from "../scripts/hardware-watch-diagnose.js";

test("diagnostic marks stale reports without performing a Marketplace search", async () => {
  const root = await mkdtemp(join(tmpdir(), "hardware-watch-diagnose-"));
  try {
    await writeFile(join(root, "state.json"), JSON.stringify({ seenIds: ["seen"], lastRunAt: "2026-10-28T13:07:50.832Z" }));
    await writeFile(join(root, "report-2026-10-28T13-07-50-832Z.json"), JSON.stringify({
      runAt: "2026-10-28T13:07:50.832Z",
      newListings: [],
      rawListings: [{ id: "seen" }],
      results: [{ kind: "mac", query: "Mac Studio Max", count: 10 }],
      errors: [],
      driveUpload: { status: "uploaded" },
    }));
    const result = await diagnoseWatch(root, new Date("2026-11-09T17:00:00Z"));
    assert.equal(result.readOnly, true);
    assert.equal(result.liveMarketplaceSearchPerformed, false);
    assert.equal((result.lastReport as any).newCandidatesCount, 0);
    assert.ok((result.warnings as string[]).some((warning) => warning.includes("older than 36 hours")));
    assert.ok((result.warnings as string[]).some((warning) => warning.includes("per-query result limit")));
  } finally { await rm(root, { recursive: true, force: true }); }
});
