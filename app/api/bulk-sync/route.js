import { NextResponse } from "next/server";
import {
  getSigniaPool,
  getPathPool,
  waitEva,
  getEva,
  logAudit,
} from "../shared.js";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function getSigniaUsers(signiaDB) {
  const [rows] = await signiaDB.query("SELECT id,email,evaId,pathId FROM user");
  return rows || [];
}

async function getEvaEmailMap({ waitForReady = false } = {}) {
  const eva = getEva();
  if (waitForReady) await waitEva();

  if (!eva.ready) {
    return { map: new Map(), ready: false, status: eva.status || "init" };
  }

  const evaUsers = eva.getUsers();
  const map = new Map();
  for (const user of evaUsers || []) {
    const email = normalizeEmail(user.correo || user.M);
    if (email && user.CID && !map.has(email)) map.set(email, user.CID);
  }

  return { map, ready: true, status: eva.status || "ready" };
}

async function getPathEmailMap(pathDB, signiaUsers) {
  const emails = Array.from(
    new Set(
      signiaUsers.map((user) => normalizeEmail(user.email)).filter(Boolean),
    ),
  );

  if (!emails.length) return new Map();

  const map = new Map();
  const chunkSize = 500;
  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const [rows] = await pathDB.query(
      `SELECT id,email FROM candidatos WHERE email IN (${chunk.map(() => "?").join(",")})`,
      chunk,
    );

    for (const row of rows || []) {
      const email = normalizeEmail(row.email);
      if (email && row.id && !map.has(email)) map.set(email, row.id);
    }
  }

  return map;
}

function getBulkEmailOpportunity(signiaUsers, evaByEmail, pathByEmail) {
  let evaSet = 0;
  let pathSet = 0;
  let bothSet = 0;
  const recordIds = new Set();

  for (const user of signiaUsers || []) {
    const email = normalizeEmail(user.email);
    if (!email) continue;

    const canSetEva = !user.evaId && evaByEmail.has(email);
    const canSetPath = !user.pathId && pathByEmail.has(email);

    if (canSetEva) evaSet += 1;
    if (canSetPath) pathSet += 1;
    if (canSetEva && canSetPath) bothSet += 1;
    if (canSetEva || canSetPath) recordIds.add(user.id);
  }

  return {
    evaSet,
    pathSet,
    bothSet,
    records: recordIds.size,
    totalSignia: signiaUsers.length,
  };
}

export async function GET(req, context) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const signiaDB = await getSigniaPool();
    const pathDB = await getPathPool();
    const signiaUsers = await getSigniaUsers(signiaDB);
    const evaResult = await getEvaEmailMap({ waitForReady: false });
    const pathByEmail = await getPathEmailMap(pathDB, signiaUsers);
    const opportunity = getBulkEmailOpportunity(
      signiaUsers,
      evaResult.map,
      pathByEmail,
    );

    return NextResponse.json({
      ...opportunity,
      evaReady: evaResult.ready,
      evaStatus: evaResult.status,
      dryRun: true,
    });
  } catch (err) {
    console.error("[bulk-sync][GET] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to calculate email-match opportunity" },
      { status: 500 },
    );
  }
}

export async function POST(req, context) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  let evaResult;
  try {
    evaResult = await getEvaEmailMap({ waitForReady: true });
  } catch (err) {
    console.error("[bulk-sync] EVA not ready:", err);
    return NextResponse.json(
      { error: "EVA service not ready", details: err?.message || String(err) },
      { status: 503 },
    );
  }

  try {
    const signiaDB = await getSigniaPool();
    const pathDB = await getPathPool();
    const signiaUsers = await getSigniaUsers(signiaDB);
    const pathByEmail = await getPathEmailMap(pathDB, signiaUsers);

    let evaSet = 0;
    let pathSet = 0;
    const updatedIds = new Set();

    for (const user of signiaUsers) {
      const email = normalizeEmail(user.email);
      if (!email) continue;

      if (!user.evaId && evaResult.map.has(email)) {
        await signiaDB.query("UPDATE user SET evaId=? WHERE id=?", [
          evaResult.map.get(email),
          user.id,
        ]);
        evaSet += 1;
        updatedIds.add(user.id);
      }

      if (!user.pathId && pathByEmail.has(email)) {
        await signiaDB.query("UPDATE user SET pathId=? WHERE id=?", [
          pathByEmail.get(email),
          user.id,
        ]);
        pathSet += 1;
        updatedIds.add(user.id);
      }
    }

    const targetObj = {
      id: "ALL",
      name: "Múltiples Usuarios",
      email: "Proceso Masivo",
    };
    await logAudit(session.user, "BULK_SYNC", targetObj, "SYSTEM", "SUCCESS", {
      evaSet,
      pathSet,
      records: updatedIds.size,
      totalSignia: signiaUsers.length,
    });

    return NextResponse.json({
      evaSet,
      pathSet,
      records: updatedIds.size,
      usersUpdated: updatedIds.size,
      totalSignia: signiaUsers.length,
      evaReady: evaResult.ready,
      evaStatus: evaResult.status,
    });
  } catch (err) {
    console.error("[bulk-sync][POST] Error:", err);
    await logAudit(
      session?.user,
      "BULK_SYNC",
      { id: "ALL", name: "Múltiples Usuarios", email: "Proceso Masivo" },
      "SYSTEM",
      "ERROR",
      { error: err.message },
    );
    return NextResponse.json(
      { error: err?.message || "Failed to apply email-match sync" },
      { status: 500 },
    );
  }
}
