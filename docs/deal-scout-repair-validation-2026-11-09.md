# Deal Scout — safe local validation gate (2026-11-09)

**Status: proposed, not deployed.** Applies to PR #12 at https://github.com/OpenTrestle/facebook-marketplace-mcp/pull/12. This is an execution guide for Codex on the user's Mac, not proof that the host has already been inspected.

## Purpose

Verify that the running watcher searches Facebook Marketplace successfully, detects meaningful fresh inventory, identifies asking-price decreases, and delivers reports and notifications. Do not conflate an empty strict alert set with no new Facebook listings.

## Safety boundaries

- No seller contact, purchases, account edits, credential exposure, or CAPTCHA/rate-limit bypass.
- Do not touch the unrelated Activepieces Medium Runner, overnight schedule, or LaunchAgent.
- Do not enable Deal Scout schedules or the paused ChatGPT Hardware Deal Alerts automation without separate approval.
- Preserve production state files, seen IDs, report histories, active/pending configuration, and Google Drive files.
- Keep unknown-distance deals in a clearly marked review queue; never present them as verified local.
- Facebook posting timestamps are provider-reported and must not be confused with first-seen timestamps.

## Phase 1 — local health diagnosis (no Marketplace requests)

1. Find the real repository checkout by Git remote; do not trust a remembered filesystem path. Capture sanitized branch, SHA, worktree status, and Node/npm versions.
2. Inspect current .local/hardware-watch/state.json and latest report timestamps/counts, without exposing secrets. Run the new read-only diagnostic command: npx tsx scripts/hardware-watch-diagnose.ts (after approved dependency setup, if needed).
3. Verify actual scheduler mechanism and enabled state through launchctl, cron, or the known orchestration system; identify whether it points to an outdated compiled build or checkout. Inspect bounded error logs.
4. Determine why Google Drive reports stopped arriving after October 28 in the saved cloud view. Distinguish "watcher did not execute", "search error", "report written locally but upload failed", and "synced folder stale".
5. Confirm active configuration, rather than assuming changed defaults took effect. Check for missing Mac mini queries, limit=10/page=1 saturation, and any unapproved pending configuration.
6. Assess Facebook query/auth health without dumping cookies, passwords, tokens, account names, or entire network responses.

## Phase 2 — isolated bounded read-only live test

1. Use a NEW temporary output directory, not production state. Copy only an approved minimal one-query configuration into that directory. Never copy Facebook secrets into reports.
2. Set HARDWARE_WATCH_OUTPUT_DIR to the temp directory and HARDWARE_WATCH_DISABLE_DRIVE_UPLOAD=1. The latter is an explicit safeguard added by PR #12; it disables Drive writes during diagnostics.
3. Run a conservative approved read-only Marketplace search, e.g. 10 results, one page, preserving pacing/rate-limit limits. Compare new-first vs suggested ordering where supported. No seller contact.
4. Capture sanitized per-query counts, first-seen IDs, provider-posting timestamps, price evidence, completeness and errors. A successful request is not proof of adequate coverage.
5. Create an independent second snapshot, replay documented price decrease / previously-seen / unverified-location cases, and confirm whether the reports and dashboard expose meaningful differences rather than "nothing new".
6. Check actual user targets: M2 Pro mini 32GB, M4 Pro mini 24/48GB, M1 Max Studio 32/64GB, M2 Max Studio high-memory. Exclude obvious accessories and treat $0/$1 prices as potentially misleading.
7. Compare generated output with the October 28 baseline: 86 unique raw items, zero new strict qualifying alerts, and recently posted offers in the raw data.

## Phase 3 — evidence, approval, and rollout plan

- Run npm run build and npm test locally, plus check PR CI on Node 22 and 24.
- Return repo SHA, active config (without secrets), scheduler status, last local run, Drive status, test output, and sanitized sample listing IDs/URLs with their provenance.
- Provide exact proposed merge/deploy/configuration/schedule/alert changes and rollback commands for separate owner approval.
- Do not merge, activate a production schedule, modify ChatGPT automations, or contact sellers during this diagnostic pass.
- Once separately approved, apply via the existing configuration approval/backup/revert mechanisms; verify a fresh report appears in Drive and a controlled test alert reaches the user.

## Codex assignment

Find the canonical local checkout for OpenTrestle/facebook-marketplace-mcp, review PR #12, then implement Phases 1–2 above. Perform all routine technical work yourself; don't ask the user to run terminal commands. Return a concise evidence-backed report and the safest deployment recommendation. Preserve credentials, existing data, paused schedules and unrelated runners.
