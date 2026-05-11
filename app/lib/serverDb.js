import mysql from "mysql2/promise";

const globalPools = globalThis.__evapathMysqlPools || {};
globalThis.__evapathMysqlPools = globalPools;

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

    try {
      await db.query("ALTER TABLE audit_logs ADD COLUMN target_name VARCHAR(255) DEFAULT NULL");
      await db.query("ALTER TABLE audit_logs ADD COLUMN target_email VARCHAR(255) DEFAULT NULL");
    } catch {
      // Columns likely already exist.
    }

    console.log("[initAuditTable] audit_logs table verified/created successfully in PATH DB.");
  } catch (err) {
    console.error("[initAuditTable] Failed to initialize audit_logs table:", err);
  }
}

export function getSigniaPool() {
  if (!globalPools.signia) {
    console.log("[Database] Initializing SIGNIA pool...");
    globalPools.signia = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME_SIGNIA || "expedientes_digitales",
      waitForConnections: true,
      connectionLimit: 3,
      connectTimeout: 15000,
      queueLimit: 10,
    });
  }
  return globalPools.signia;
}

export function getPathPool() {
  if (!globalPools.path) {
    console.log("[Database] Initializing PATH pool...");
    globalPools.path = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME_PATH || "reclutamiento",
      waitForConnections: true,
      connectionLimit: 3,
      connectTimeout: 15000,
      queueLimit: 10,
    });

    initAuditTable(globalPools.path).catch((err) => {
      console.error("[Database] Background audit table init failed:", err);
    });
  }
  return globalPools.path;
}

export async function logAudit(user, action_type, target, source_system, status, metadata = {}) {
  try {
    const targetId = typeof target === "object" ? String(target.id) : String(target);
    const targetName = typeof target === "object" ? target.name : null;
    const targetEmail = typeof target === "object" ? target.email : null;

    console.log(
      `[AuditLog] Writing ${action_type} for user: ${user?.email || "system"} | target: ${targetName || targetId} | status: ${status}`,
    );

    const db = getPathPool();
    await db.query(
      `INSERT INTO audit_logs (user_email, user_name, user_photo, action_type, target_entity, target_name, target_email, source_system, status, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user?.email || "system",
        user?.name || "System",
        user?.image || "",
        action_type,
        targetId,
        targetName,
        targetEmail,
        source_system,
        status,
        JSON.stringify(metadata),
      ],
    );
  } catch (e) {
    console.error("[logAudit] Failed to write audit log to PATH DB:", e);
  }
}
