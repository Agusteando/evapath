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

function getDisplayName(user = {}) {
  return (
    user.fullName ||
    [user.nombres, user.apellidoPaterno, user.apellidoMaterno]
      .filter(Boolean)
      .join(" ") ||
    user.name ||
    "Sin nombre"
  ).trim();
}

function getCurrentStatus(user = {}) {
  const missingEva = !user.evaId;
  const missingPath = !user.pathId;
  if (missingEva && missingPath) return "Sin EVA y PATH";
  if (missingEva) return "Sin EVA";
  if (missingPath) return "Sin PATH";
  return "Completo";
}

async function getSigniaUsers(signiaDB) {
  const [rows] = await signiaDB.query(
    `SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email,evaId,pathId FROM user`,
  );
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
    if (!email || !user.CID || map.has(email)) continue;
    map.set(email, {
      id: user.CID,
      name: user.nombre || user.N || "EVA",
      email,
    });
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
      `SELECT id,nombre,email FROM candidatos WHERE email IN (${chunk.map(() => "?").join(",")})`,
      chunk,
    );

    for (const row of rows || []) {
      const email = normalizeEmail(row.email);
      if (!email || !row.id || map.has(email)) continue;
      map.set(email, {
        id: row.id,
        name: row.nombre || "PATH",
        email,
      });
    }
  }

  return map;
}

function getBulkEmailOpportunity(signiaUsers, evaByEmail, pathByEmail) {
  let evaSet = 0;
  let pathSet = 0;
  let bothSet = 0;
  const matches = [];

  for (const user of signiaUsers || []) {
    const email = normalizeEmail(user.email);
    if (!email) continue;

    const evaCandidate = evaByEmail.get(email) || null;
    const pathCandidate = pathByEmail.get(email) || null;
    const canSetEva = !user.evaId && Boolean(evaCandidate);
    const canSetPath = !user.pathId && Boolean(pathCandidate);

    if (canSetEva) evaSet += 1;
    if (canSetPath) pathSet += 1;
    if (canSetEva && canSetPath) bothSet += 1;

    if (canSetEva || canSetPath) {
      matches.push({
        signiaId: user.id,
        name: getDisplayName(user),
        email,
        currentStatus: getCurrentStatus(user),
        missingEva: !user.evaId,
        missingPath: !user.pathId,
        targets: [canSetEva ? "eva" : null, canSetPath ? "path" : null].filter(
          Boolean,
        ),
        evaCandidate: canSetEva ? evaCandidate : null,
        pathCandidate: canSetPath ? pathCandidate : null,
      });
    }
  }

  return {
    evaSet,
    pathSet,
    bothSet,
    records: matches.length,
    totalSignia: signiaUsers.length,
    matches,
  };
}

async function loadOpportunity({ waitForEva = false } = {}) {
  const signiaDB = await getSigniaPool();
  const pathDB = await getPathPool();
  const signiaUsers = await getSigniaUsers(signiaDB);
  const evaResult = await getEvaEmailMap({ waitForReady: waitForEva });
  const pathByEmail = await getPathEmailMap(pathDB, signiaUsers);
  const opportunity = getBulkEmailOpportunity(
    signiaUsers,
    evaResult.map,
    pathByEmail,
  );

  return { signiaDB, signiaUsers, evaResult, pathByEmail, opportunity };
}

export async function GET(req, context) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const { evaResult, opportunity } = await loadOpportunity({
      waitForEva: false,
    });

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

  let requestedIds = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.signiaIds)) {
      requestedIds = new Set(body.signiaIds.map((id) => String(id)));
    }
  } catch {
    requestedIds = null;
  }

  try {
    const { signiaDB, evaResult, opportunity } = await loadOpportunity({
      waitForEva: false,
    });

    let evaSet = 0;
    let pathSet = 0;
    let bothSet = 0;
    const updatedIds = new Set();
    const applied = [];

    for (const match of opportunity.matches) {
      if (requestedIds && !requestedIds.has(String(match.signiaId))) continue;

      const updates = [];
      const params = [];

      if (match.evaCandidate) {
        updates.push("evaId=?");
        params.push(match.evaCandidate.id);
      }

      if (match.pathCandidate) {
        updates.push("pathId=?");
        params.push(match.pathCandidate.id);
      }

      if (!updates.length) continue;

      params.push(match.signiaId);
      await signiaDB.query(
        `UPDATE user SET ${updates.join(", ")} WHERE id=?`,
        params,
      );

      if (match.evaCandidate) evaSet += 1;
      if (match.pathCandidate) pathSet += 1;
      if (match.evaCandidate && match.pathCandidate) bothSet += 1;
      updatedIds.add(match.signiaId);
      applied.push(match);
    }

    const targetObj = {
      id: requestedIds ? "SELECTED" : "ALL",
      name: requestedIds ? "Usuarios seleccionados" : "Múltiples Usuarios",
      email: "Proceso Masivo",
    };
    await logAudit(session.user, "BULK_SYNC", targetObj, "SYSTEM", "SUCCESS", {
      evaSet,
      pathSet,
      bothSet,
      records: updatedIds.size,
      selected: requestedIds ? requestedIds.size : null,
      totalSignia: opportunity.totalSignia,
    });

    return NextResponse.json({
      evaSet,
      pathSet,
      bothSet,
      records: updatedIds.size,
      usersUpdated: updatedIds.size,
      totalSignia: opportunity.totalSignia,
      evaReady: evaResult.ready,
      evaStatus: evaResult.status,
      applied,
    });
  } catch (err) {
    console.error("[bulk-sync][POST] Error:", err);
    await logAudit(
      session?.user,
      "BULK_SYNC",
      { id: requestedIds ? "SELECTED" : "ALL", name: "Múltiples Usuarios", email: "Proceso Masivo" },
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
