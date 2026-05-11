import { getPathPool, logAudit } from "./serverDb.js";

export const AUTO_EMAIL_SYNC_JOB_NAME = "auto_email_match";
export const AUTO_EMAIL_SYNC_INTERVAL_MS = Number(
  process.env.AUTO_EMAIL_SYNC_INTERVAL_MS || 2 * 60 * 60 * 1000,
);

const CHECK_INTERVAL_MS = Number(process.env.AUTO_EMAIL_SYNC_CHECK_MS || 60 * 1000);
const EVA_WAIT_TIMEOUT_MS = Number(process.env.AUTO_EMAIL_SYNC_EVA_WAIT_MS || 45 * 1000);

const AUTO_AUDIT_USER = {
  email: "auto-email-sync@evapath.local",
  name: "Auto email sync",
  image: "",
};

const globalState = globalThis.__evapathAutoEmailSyncJob || {
  started: false,
  running: false,
  timer: null,
};
globalThis.__evapathAutoEmailSyncJob = globalState;

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function normalizeStatus(row = {}) {
  const nextRunAt = toIso(row.next_run_at);
  const lastStartedAt = toIso(row.last_started_at);
  const lastFinishedAt = toIso(row.last_finished_at);
  const running = globalState.running || row.status === "running";

  return {
    jobName: row.job_name || AUTO_EMAIL_SYNC_JOB_NAME,
    enabled: process.env.AUTO_EMAIL_SYNC_DISABLED !== "1",
    intervalMs: AUTO_EMAIL_SYNC_INTERVAL_MS,
    running,
    status: row.status || "idle",
    lastStartedAt,
    lastFinishedAt,
    lastExecutedAt: lastFinishedAt,
    nextRunAt,
    lastSuccess:
      row.last_success === null || row.last_success === undefined
        ? null
        : Boolean(row.last_success),
    lastError: row.last_error || null,
    lastRecords: Number(row.last_records || 0),
    lastEvaSet: Number(row.last_eva_set || 0),
    lastPathSet: Number(row.last_path_set || 0),
    updatedAt: toIso(row.updated_at),
    serverNow: new Date().toISOString(),
  };
}

async function ensureStatusTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS auto_email_sync_status (
      job_name VARCHAR(100) PRIMARY KEY,
      status VARCHAR(32) NOT NULL DEFAULT 'idle',
      last_started_at DATETIME NULL,
      last_finished_at DATETIME NULL,
      next_run_at DATETIME NULL,
      last_success TINYINT(1) NULL,
      last_error TEXT NULL,
      last_records INT NOT NULL DEFAULT 0,
      last_eva_set INT NOT NULL DEFAULT 0,
      last_path_set INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(
    `INSERT IGNORE INTO auto_email_sync_status (job_name, status, next_run_at)
     VALUES (?, 'idle', ?)`,
    [AUTO_EMAIL_SYNC_JOB_NAME, new Date()],
  );
}

async function patchStatus(db, patch) {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (!entries.length) return;

  const assignments = entries.map(([key]) => `${key}=?`).join(", ");
  const values = entries.map(([, value]) => value);
  values.push(AUTO_EMAIL_SYNC_JOB_NAME);

  await db.query(
    `UPDATE auto_email_sync_status SET ${assignments} WHERE job_name=?`,
    values,
  );
}

export async function getAutoEmailSyncStatus() {
  const db = await getPathPool();
  await ensureStatusTable(db);
  const [rows] = await db.query(
    `SELECT * FROM auto_email_sync_status WHERE job_name=? LIMIT 1`,
    [AUTO_EMAIL_SYNC_JOB_NAME],
  );
  return normalizeStatus(rows?.[0] || {});
}

function isDue(status) {
  if (globalState.running) return false;
  if (!status.nextRunAt) return true;
  return new Date(status.nextRunAt).getTime() <= Date.now();
}

export async function runAutoEmailSync({ force = false } = {}) {
  if (process.env.AUTO_EMAIL_SYNC_DISABLED === "1") {
    return getAutoEmailSyncStatus();
  }

  const db = await getPathPool();
  await ensureStatusTable(db);

  const current = await getAutoEmailSyncStatus();
  if (!force && !isDue(current)) return current;
  if (globalState.running) return { ...current, running: true, status: "running" };

  globalState.running = true;
  const startedAt = new Date();

  await patchStatus(db, {
    status: "running",
    last_started_at: startedAt,
    last_success: null,
    last_error: null,
  });

  try {
    const { applyEmailOpportunity } = await import("./bulkEmailSync.js");
    const result = await applyEmailOpportunity({
      waitForEva: true,
      evaTimeoutMs: EVA_WAIT_TIMEOUT_MS,
    });

    const finishedAt = new Date();
    const nextRunAt = new Date(finishedAt.getTime() + AUTO_EMAIL_SYNC_INTERVAL_MS);

    await patchStatus(db, {
      status: "success",
      last_finished_at: finishedAt,
      next_run_at: nextRunAt,
      last_success: 1,
      last_error: null,
      last_records: result.records || 0,
      last_eva_set: result.evaSet || 0,
      last_path_set: result.pathSet || 0,
    });

    await logAudit(
      AUTO_AUDIT_USER,
      "AUTO_EMAIL_SYNC",
      { id: "AUTO", name: "Auto email match", email: "Proceso automático" },
      "SYSTEM",
      "SUCCESS",
      {
        evaSet: result.evaSet,
        pathSet: result.pathSet,
        bothSet: result.bothSet,
        records: result.records,
        totalSignia: result.totalSignia,
        evaReady: result.evaReady,
        evaStatus: result.evaStatus,
      },
    );
  } catch (error) {
    const finishedAt = new Date();
    const nextRunAt = new Date(finishedAt.getTime() + AUTO_EMAIL_SYNC_INTERVAL_MS);

    console.error("[auto-email-sync] Job failed:", error);
    await patchStatus(db, {
      status: "error",
      last_finished_at: finishedAt,
      next_run_at: nextRunAt,
      last_success: 0,
      last_error: error?.message || "Auto email sync failed",
    });

    await logAudit(
      AUTO_AUDIT_USER,
      "AUTO_EMAIL_SYNC",
      { id: "AUTO", name: "Auto email match", email: "Proceso automático" },
      "SYSTEM",
      "ERROR",
      { error: error?.message || "Auto email sync failed" },
    );
  } finally {
    globalState.running = false;
  }

  return getAutoEmailSyncStatus();
}

async function schedulerTick() {
  try {
    const status = await getAutoEmailSyncStatus();
    if (isDue(status)) {
      await runAutoEmailSync({ force: true });
    }
  } catch (error) {
    console.error("[auto-email-sync] Scheduler tick failed:", error);
  }
}

export function startAutoEmailSyncJob() {
  if (process.env.AUTO_EMAIL_SYNC_DISABLED === "1") return false;
  if (globalState.started) return true;

  globalState.started = true;

  schedulerTick().catch((error) => {
    console.error("[auto-email-sync] Initial scheduler tick failed:", error);
  });

  globalState.timer = setInterval(schedulerTick, CHECK_INTERVAL_MS);
  if (typeof globalState.timer.unref === "function") {
    globalState.timer.unref();
  }

  return true;
}
