import mysql from "mysql2/promise";
import EvaService from "../../EvaService.js";

let pools = {};

async function initAuditTable(db) {
  try {
    console.log("[initAuditTable] Ensuring audit_logs table exists in PATH database...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        user_name VARCHAR(255),
        user_photo VARCHAR(1024),
        action_type VARCHAR(100) NOT NULL,
        target_entity VARCHAR(255),
        source_system VARCHAR(100),
        status VARCHAR(50),
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Safely add human-readable target columns if they don't exist yet
    try {
      await db.query("ALTER TABLE audit_logs ADD COLUMN target_name VARCHAR(255) DEFAULT NULL");
      await db.query("ALTER TABLE audit_logs ADD COLUMN target_email VARCHAR(255) DEFAULT NULL");
    } catch (e) {
      // Columns likely already exist (Error 1060: Duplicate column name)
    }

    console.log("[initAuditTable] audit_logs table verified/created successfully in PATH DB.");
  } catch (err) {
    console.error("[initAuditTable] Failed to initialize audit_logs table:", err);
  }
}

export function getSigniaPool() {
  if (!pools.signia) {
    console.log("[Database] Initializing SIGNIA pool...");
    pools.signia = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME_SIGNIA || "expedientes_digitales",
      waitForConnections: true,
      connectionLimit: 3,
      connectTimeout: 15000,
      queueLimit: 10
    });
  }
  return pools.signia;
}

export function getPathPool() {
  if (!pools.path) {
    console.log("[Database] Initializing PATH pool...");
    pools.path = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME_PATH || "reclutamiento",
      waitForConnections: true,
      connectionLimit: 3,
      connectTimeout: 15000,
      queueLimit: 10
    });
    // Initialize audit table in PATH database
    initAuditTable(pools.path).catch((err) => {
      console.error("[Database] Background audit table init failed:", err);
    });
  }
  return pools.path;
}

export async function logAudit(user, action_type, target, source_system, status, metadata = {}) {
  try {
    const targetId = typeof target === 'object' ? String(target.id) : String(target);
    const targetName = typeof target === 'object' ? target.name : null;
    const targetEmail = typeof target === 'object' ? target.email : null;

    console.log(`[AuditLog] Writing ${action_type} for user: ${user?.email || 'system'} | target: ${targetName || targetId} | status: ${status}`);
    const db = getPathPool();
    await db.query(
      `INSERT INTO audit_logs (user_email, user_name, user_photo, action_type, target_entity, target_name, target_email, source_system, status, metadata) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user?.email || 'system',
        user?.name || 'System',
        user?.image || '',
        action_type,
        targetId,
        targetName,
        targetEmail,
        source_system,
        status,
        JSON.stringify(metadata)
      ]
    );
  } catch (e) {
    console.error("[logAudit] Failed to write audit log to PATH DB:", e);
  }
}

let _evaInstance = global._evaSingleton;
export function getEva() {
  if (!_evaInstance) {
    console.log("[getEva] Creating new EvaService singleton instance...");
    _evaInstance = new EvaService();
    global._evaSingleton = _evaInstance;
  }
  return _evaInstance;
}

export async function waitEva(timeoutMs = 90000) {
  const eva = getEva();
  if (eva.ready) return Promise.resolve();
  
  console.log(`[waitEva] EVA not ready yet. Waiting up to ${timeoutMs}ms...`);
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (eva.ready) {
        clearInterval(checkInterval);
        console.log(`[waitEva] EVA became ready after ${Date.now() - startTime}ms`);
        resolve();
      } else if (eva.status === "error") {
        clearInterval(checkInterval);
        console.warn(`[waitEva] EVA service hit error state after ${Date.now() - startTime}ms`);
        reject(new Error("EVA service error"));
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        console.warn(`[waitEva] EVA service timeout after ${timeoutMs}ms`);
        reject(new Error("EVA service timeout"));
      }
    }, 500);
  });
}

export async function resetEva() {
  const eva = getEva();
  if (eva && typeof eva._start === "function") {
    console.log("[resetEva] Manually resetting EvaService...");
    eva.ready = false;
    eva.status = "init";
    try {
      await eva._start();
      console.log("[resetEva] Reset sequence completed successfully.");
    } catch (e) {
      eva.status = "error";
      console.error("[resetEva] EVA Reset Error:", e);
    }
  }
}

export function label(c) {
  return c == 2 ? "MMPI-2 RF" : "ECO";
}

export function pdfURL(cid, pid, code, c) {
  const type = c == 2 ? "MMPI-2 RF" : "ECO";
  return `/api/path-pdf?cid=${cid}&pid=${pid}&code=${code}&type=${encodeURIComponent(type)}`;
}

export async function evaStatusSingleton() {
  const eva = getEva();
  return { ready: !!eva.ready, status: eva.status ?? "init" };
}

export async function evaLogTailSingleton() {
  const eva = getEva();
  return { logs: eva.getLogTail ? eva.getLogTail() : [], ready: !!eva.ready };
}