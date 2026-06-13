#!/usr/bin/env node
// Long-running scheduler — the GUI counterpart to the original skill's cron
// sub-agent. Two jobs:
//   • drain the acquisition queue (run-next) frequently, so a user clicking
//     "获取" actually executes shortly after;
//   • run the追更 sweep (run-type3) on an interval, which re-syncs each tracked
//     season against TMDB and acquires newly-aired / still-missing episodes.
//
//   node scripts/scheduler.mjs            # run forever
//   MEDIA_TRACK_SCHEDULER_ONCE=1 node scripts/scheduler.mjs   # one pass, exit
//
// Env:
//   MEDIA_TRACK_BASE_URL              default http://localhost:3000
//   MEDIA_TRACK_WORKER_SECRET         sent as x-media-track-worker-secret if set
//   MEDIA_TRACK_RUN_NEXT_INTERVAL_MS  default 15000  (drain acquisition queue)
//   MEDIA_TRACK_TYPE3_INTERVAL_MS     default 21600000 (6h追更 sweep)
//   MEDIA_TRACK_SCHEDULER_ONCE        "1" → run both once and exit (cron-friendly)

const BASE = (process.env.MEDIA_TRACK_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.MEDIA_TRACK_WORKER_SECRET;
const NEXT_INTERVAL = Number(process.env.MEDIA_TRACK_RUN_NEXT_INTERVAL_MS ?? 15_000);
const TYPE3_INTERVAL = Number(process.env.MEDIA_TRACK_TYPE3_INTERVAL_MS ?? 6 * 3_600_000);
const ONCE = process.env.MEDIA_TRACK_SCHEDULER_ONCE === "1";

const headers = SECRET ? { "x-media-track-worker-secret": SECRET } : {};

function ts() {
  return new Date().toISOString().slice(11, 19);
}

async function post(path) {
  try {
    const res = await fetch(BASE + path, { method: "POST", headers });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}

let draining = false;
// Claim-one-at-a-time worker: keep calling until the queue reports idle.
async function drainQueue() {
  if (draining) return;
  draining = true;
  try {
    for (let i = 0; i < 50; i += 1) {
      const result = await post("/api/workflows/run-next");
      if (!result.ok) {
        console.log(`[${ts()}] run-next error: ${result.error ?? result.status}`);
        return;
      }
      if (result.body?.status === "idle") return;
      console.log(`[${ts()}] run-next: ${result.body?.status ?? "?"} ${result.body?.workflowRunId ?? ""}`.trim());
    }
  } finally {
    draining = false;
  }
}

let sweeping = false;
async function sweepType3() {
  if (sweeping) return;
  sweeping = true;
  try {
    const result = await post("/api/workflows/run-type3");
    if (!result.ok) {
      console.log(`[${ts()}] run-type3 error: ${result.error ?? result.status}`);
      return;
    }
    const count = Array.isArray(result.body?.outcomes) ? result.body.outcomes.length : 0;
    console.log(`[${ts()}] run-type3 sweep: ${count} season(s) processed`);
  } finally {
    sweeping = false;
  }
}

async function main() {
  console.log(
    `[${ts()}] scheduler → ${BASE} (run-next every ${NEXT_INTERVAL}ms, type3 every ${TYPE3_INTERVAL}ms)`,
  );
  await drainQueue();
  await sweepType3();
  if (ONCE) return;
  setInterval(drainQueue, NEXT_INTERVAL);
  setInterval(sweepType3, TYPE3_INTERVAL);
}

main();
