import { getSigniaPool, getPathPool } from "./serverDb.js";
import { getEvaEmail, getPathEmail, getSigniaEmail, normalizeEmail } from "./emailIdentity.js";
import { hasLinkValue, normalizeLinkId } from "./linkIdentity.js";

export { normalizeEmail, hasLinkValue, normalizeLinkId };

function toId(value) {
  return normalizeLinkId(value);
}

function addCandidate(map, email, candidate) {
  if (!email || !candidate?.id) return;
  const key = normalizeEmail(email);
  if (!key) return;
  const existing = map.get(key) || [];
  const candidateId = String(candidate.id);
  if (!existing.some((item) => String(item.id) === candidateId)) {
    existing.push(candidate);
  }
  map.set(key, existing);
}

function compareEvaCandidates(a, b) {
  const statusRank = (candidate) => {
    const status = String(candidate?.status || candidate?.estado || "").toLowerCase();
    if (status.includes("evaluado") || status.includes("complet")) return 4;
    if (status.includes("evaluando")) return 3;
    if (status.includes("postulado")) return 2;
    if (status.includes("invitado")) return 1;
    return 0;
  };

  const dateValue = (candidate) => {
    const raw = candidate?.fechaProceso || candidate?.processDate || candidate?.PD || "";
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  };

  return statusRank(b) - statusRank(a) || dateValue(b) - dateValue(a) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
}

function selectAvailableCandidate(candidates = [], ownerByCandidateId, currentUser) {
  if (!Array.isArray(candidates) || !candidates.length) return null;

  for (const candidate of candidates) {
    const candidateId = toId(candidate?.id);
    if (!candidateId) continue;
    const owner = ownerByCandidateId.get(candidateId);
    if (!owner || String(owner.id) === String(currentUser.id)) return candidate;
  }

  return null;
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
  const missingEva = !hasLinkValue(user.evaId);
  const missingPath = !hasLinkValue(user.pathId);
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
      usersRead: 0,
      emailsIndexed: 0,
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
      usersRead: 0,
      emailsIndexed: 0,
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
      usersRead: 0,
      emailsIndexed: 0,
    };
  }

  const map = new Map();
  for (const user of evaUsers || []) {
    const email = getEvaEmail(user);
    if (!email || !user.CID) continue;
    addCandidate(map, email, {
      id: user.CID,
      name: user.nombre || user.N || "EVA",
      email,
      status: user.estado || user.D || "",
      fechaProceso: user.fechaProceso || user.PD || "",
      exactEmail: true,
    });
  }

  for (const [email, candidates] of map.entries()) {
    map.set(email, candidates.sort(compareEvaCandidates));
  }

  return {
    map,
    ready: true,
    status: eva.status || "ready",
    error: null,
    usersRead: Array.isArray(evaUsers) ? evaUsers.length : 0,
    emailsIndexed: map.size,
  };
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
       WHERE email IS NOT NULL AND LOWER(TRIM(email)) IN (${placeholders})
       ORDER BY id DESC`,
      chunk,
    );

    for (const row of rows || []) {
      const email = getPathEmail(row);
      if (!email || !row.id) continue;
      addCandidate(map, email, {
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
    const evaId = toId(owner.evaId);
    const pathId = toId(owner.pathId);
    if (evaId && !evaOwnerByCandidateId.has(evaId)) evaOwnerByCandidateId.set(evaId, owner);
    if (pathId && !pathOwnerByCandidateId.has(pathId)) pathOwnerByCandidateId.set(pathId, owner);
  }

  for (const user of signiaUsers || []) {
    const email = getSigniaEmail(user);
    if (!email) continue;

    const evaCandidates = evaByEmail.get(email) || [];
    const pathCandidates = pathByEmail.get(email) || [];
    const missingEva = !hasLinkValue(user.evaId);
    const missingPath = !hasLinkValue(user.pathId);
    const missingBoth = missingEva && missingPath;
    const evaCandidate = missingEva ? selectAvailableCandidate(evaCandidates, evaOwnerByCandidateId, user) : null;
    const pathCandidate = missingPath ? selectAvailableCandidate(pathCandidates, pathOwnerByCandidateId, user) : null;
    const canSetEva = missingEva && Boolean(evaCandidate);
    const canSetPath = missingPath && Boolean(pathCandidate);

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
        duplicateCandidates: {
          eva: Array.isArray(evaCandidates) ? evaCandidates.length : 0,
          path: Array.isArray(pathCandidates) ? pathCandidates.length : 0,
        },
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
