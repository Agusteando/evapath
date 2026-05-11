import { getSigniaPool, getPathPool } from "./serverDb.js";
import { getEvaEmail, getPathEmail, getSigniaEmail, normalizeEmail } from "./emailIdentity.js";

export { normalizeEmail };

function normalizeId(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function getDisplayName(user = {}) {
  return (
    user.fullName ||
    [user.nombres, user.apellidoPaterno, user.apellidoMaterno]
      .filter(Boolean)
      .join(" ") ||
    user.name ||
    "Sin nombre"
  ).trim();
}

export function getCurrentStatus(user = {}) {
  const missingEva = !user.evaId;
  const missingPath = !user.pathId;
  if (missingEva && missingPath) return "Sin EVA y PATH";
  if (missingEva) return "Sin EVA";
  if (missingPath) return "Sin PATH";
  return "Completo";
}

export async function getSigniaUsers(signiaDB) {
  const [rows] = await signiaDB.query(
    `SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email,evaId,pathId FROM user WHERE isActive=1`,
  );
  return rows || [];
}

export async function getEvaEmailMap({ waitForReady = false, timeoutMs = 30000 } = {}) {
  let eva;
  let waitEva;

  try {
    const shared = await import("../api/shared.js");
    eva = shared.getEva();
    waitEva = shared.waitEva;
  } catch (error) {
    return {
      map: new Map(),
      ready: false,
      status: "error",
      error: error?.message || "No se pudo inicializar EVA",
    };
  }

  let waitError = null;

  if (waitForReady && !eva.ready) {
    try {
      await waitEva(timeoutMs);
    } catch (error) {
      waitError = error;
    }
  }

  if (!eva.ready) {
    return {
      map: new Map(),
      ready: false,
      status: eva.status || "init",
      error: waitError?.message || null,
    };
  }

  let evaUsers = [];
  try {
    evaUsers = eva.getUsers();
  } catch (error) {
    return {
      map: new Map(),
      ready: false,
      status: eva.status || "error",
      error: error?.message || "No se pudieron leer usuarios EVA",
    };
  }

  const map = new Map();
  for (const user of evaUsers || []) {
    const email = getEvaEmail(user);
    if (!email || !user.CID || map.has(email)) continue;
    map.set(email, {
      id: user.CID,
      name: user.nombre || user.N || "EVA",
      email,
      exactEmail: true,
    });
  }

  return { map, ready: true, status: eva.status || "ready", error: null };
}

export async function getPathEmailMap(pathDB, signiaUsers) {
  const emails = Array.from(
    new Set(signiaUsers.map((user) => getSigniaEmail(user)).filter(Boolean)),
  );

  if (!emails.length) return new Map();

  const map = new Map();
  const chunkSize = 500;
  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    const [rows] = await pathDB.query(
      `SELECT id, CONCAT_WS(' ', nombres, apellidopaterno, apellidomaterno) AS name, email
       FROM candidatos
       WHERE email IS NOT NULL AND LOWER(TRIM(email)) IN (${placeholders})`,
      chunk,
    );

    for (const row of rows || []) {
      const email = getPathEmail(row);
      if (!email || !row.id || map.has(email)) continue;
      map.set(email, {
        id: row.id,
        name: row.name || "PATH",
        email,
        exactEmail: true,
      });
    }
  }

  return map;
}

export function createEmptyBreakdown() {
  return {
    eva: 0,
    path: 0,
    bothTargets: 0,
    missingEva: 0,
    missingPath: 0,
    missingBoth: 0,
    missingBothWithEva: 0,
    missingBothWithPath: 0,
    missingBothWithBothTargets: 0,
  };
}

export function getBulkEmailOpportunity(signiaUsers, evaByEmail, pathByEmail) {
  const breakdown = createEmptyBreakdown();
  const matches = [];
  const evaOwnerByCandidateId = new Map();
  const pathOwnerByCandidateId = new Map();

  for (const owner of signiaUsers || []) {
    const evaId = normalizeId(owner.evaId);
    const pathId = normalizeId(owner.pathId);
    if (evaId && !evaOwnerByCandidateId.has(evaId)) evaOwnerByCandidateId.set(evaId, owner);
    if (pathId && !pathOwnerByCandidateId.has(pathId)) pathOwnerByCandidateId.set(pathId, owner);
  }

  for (const user of signiaUsers || []) {
    const email = getSigniaEmail(user);
    if (!email) continue;

    const evaCandidate = evaByEmail.get(email) || null;
    const pathCandidate = pathByEmail.get(email) || null;
    const missingEva = !user.evaId;
    const missingPath = !user.pathId;
    const missingBoth = missingEva && missingPath;
    const evaOwner = evaCandidate ? evaOwnerByCandidateId.get(normalizeId(evaCandidate.id)) : null;
    const pathOwner = pathCandidate ? pathOwnerByCandidateId.get(normalizeId(pathCandidate.id)) : null;
    const evaOwnedByOther = evaOwner && String(evaOwner.id) !== String(user.id);
    const pathOwnedByOther = pathOwner && String(pathOwner.id) !== String(user.id);
    const canSetEva = missingEva && Boolean(evaCandidate) && !evaOwnedByOther;
    const canSetPath = missingPath && Boolean(pathCandidate) && !pathOwnedByOther;

    if (canSetEva) breakdown.eva += 1;
    if (canSetPath) breakdown.path += 1;
    if (canSetEva && canSetPath) breakdown.bothTargets += 1;
    if (missingEva && (canSetEva || canSetPath)) breakdown.missingEva += 1;
    if (missingPath && (canSetEva || canSetPath)) breakdown.missingPath += 1;
    if (missingBoth && (canSetEva || canSetPath)) breakdown.missingBoth += 1;
    if (missingBoth && canSetEva) breakdown.missingBothWithEva += 1;
    if (missingBoth && canSetPath) breakdown.missingBothWithPath += 1;
    if (missingBoth && canSetEva && canSetPath) breakdown.missingBothWithBothTargets += 1;

    if (canSetEva || canSetPath) {
      matches.push({
        signiaId: user.id,
        name: getDisplayName(user),
        email,
        currentStatus: getCurrentStatus(user),
        missingEva,
        missingPath,
        missingBoth,
        targets: [canSetEva ? "eva" : null, canSetPath ? "path" : null].filter(Boolean),
        evaCandidate: canSetEva ? evaCandidate : null,
        pathCandidate: canSetPath ? pathCandidate : null,
      });
    }
  }

  return {
    evaSet: breakdown.eva,
    pathSet: breakdown.path,
    bothSet: breakdown.bothTargets,
    records: matches.length,
    totalSignia: signiaUsers.length,
    breakdown,
    matches,
  };
}

export async function loadEmailOpportunity({ waitForEva = false, evaTimeoutMs = 30000 } = {}) {
  const signiaDB = await getSigniaPool();
  const pathDB = await getPathPool();
  const signiaUsers = await getSigniaUsers(signiaDB);
  const evaResult = await getEvaEmailMap({ waitForReady: waitForEva, timeoutMs: evaTimeoutMs });
  const pathByEmail = await getPathEmailMap(pathDB, signiaUsers);
  const opportunity = getBulkEmailOpportunity(signiaUsers, evaResult.map, pathByEmail);

  return { signiaDB, signiaUsers, evaResult, pathByEmail, opportunity };
}

export async function applyEmailOpportunity({ requestedIds = null, waitForEva = true, evaTimeoutMs = 30000 } = {}) {
  const requestedSet = Array.isArray(requestedIds)
    ? new Set(requestedIds.map((id) => String(id)))
    : requestedIds instanceof Set
      ? new Set(Array.from(requestedIds).map((id) => String(id)))
      : null;

  const { signiaDB, evaResult, opportunity } = await loadEmailOpportunity({ waitForEva, evaTimeoutMs });

  let evaSet = 0;
  let pathSet = 0;
  let bothSet = 0;
  const updatedIds = new Set();
  const applied = [];

  for (const match of opportunity.matches) {
    if (requestedSet && !requestedSet.has(String(match.signiaId))) continue;

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
    const missingGuards = [];
    if (match.evaCandidate) missingGuards.push("(evaId IS NULL OR evaId=0 OR evaId='')");
    if (match.pathCandidate) missingGuards.push("(pathId IS NULL OR pathId=0 OR pathId='')");

    const [result] = await signiaDB.query(
      `UPDATE user SET ${updates.join(", ")} WHERE id=? AND isActive=1 AND ${missingGuards.join(" AND ")}`,
      params,
    );
    if (!Number(result?.affectedRows || 0)) continue;

    if (match.evaCandidate) evaSet += 1;
    if (match.pathCandidate) pathSet += 1;
    if (match.evaCandidate && match.pathCandidate) bothSet += 1;
    updatedIds.add(match.signiaId);
    applied.push(match);
  }

  return {
    evaSet,
    pathSet,
    bothSet,
    records: updatedIds.size,
    usersUpdated: updatedIds.size,
    totalSignia: opportunity.totalSignia,
    evaReady: evaResult.ready,
    evaStatus: evaResult.status,
    evaError: evaResult.error,
    selected: requestedSet ? requestedSet.size : null,
    applied,
  };
}
