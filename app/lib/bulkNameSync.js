import { getSigniaPool, getPathPool } from "./serverDb.js";
import { computeNameMatchScore, getBestPersonName, tokenizeName } from "./nameMatch.js";
import { getDisplayName, getCurrentStatus } from "./bulkEmailSync.js";
import { getEvaEmail, getPathEmail, getSigniaEmail } from "./emailIdentity.js";
import { hasLinkValue, normalizeLinkId } from "./linkIdentity.js";

const DEFAULT_MIN_SCORE = 95;

function normalizeId(value) {
  return normalizeLinkId(value);
}

function signiaFullName(user = {}) {
  return getBestPersonName(user);
}

function buildCandidateTokenIndex(candidates = []) {
  const index = new Map();
  for (const candidate of candidates) {
    for (const token of tokenizeName(candidate.name)) {
      if (!index.has(token)) index.set(token, []);
      index.get(token).push(candidate);
    }
  }
  return index;
}

function getIndexedCandidateSubset(user, fallbackCandidates, candidateIndex) {
  const tokens = tokenizeName(signiaFullName(user) || getDisplayName(user));
  const seen = new Set();
  const subset = [];

  for (const token of tokens) {
    const bucket = candidateIndex.get(token) || [];
    for (const candidate of bucket) {
      const id = normalizeId(candidate.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      subset.push(candidate);
    }
  }

  // For very small pools, keep recall high even when no exact token bucket exists.
  if (!subset.length && fallbackCandidates.length <= 500) return fallbackCandidates;
  return subset;
}

export async function getActiveSigniaUsers(signiaDB) {
  const [rows] = await signiaDB.query(
    `SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email,evaId,pathId
     FROM user
     WHERE isActive=1`,
  );
  return rows || [];
}

export async function getEvaNamePool({ waitForReady = false, timeoutMs = 30000 } = {}) {
  let eva;
  let waitEva;

  try {
    const shared = await import("../api/shared.js");
    eva = shared.getEva();
    waitEva = shared.waitEva;
  } catch (error) {
    return {
      users: [],
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
      users: [],
      ready: false,
      status: eva.status || "init",
      error: waitError?.message || null,
    };
  }

  try {
    const users = (eva.getUsers() || [])
      .map((user) => ({
        id: user.CID,
        name: user.nombre || user.N || "",
        email: getEvaEmail(user),
      }))
      .filter((user) => user.id && user.name);
    return { users, ready: true, status: eva.status || "ready", error: null };
  } catch (error) {
    return {
      users: [],
      ready: false,
      status: eva.status || "error",
      error: error?.message || "No se pudieron leer usuarios EVA",
    };
  }
}

export async function getPathNamePool(pathDB) {
  const [rows] = await pathDB.query(
    `SELECT id,
            CONCAT_WS(' ', nombres, apellidopaterno, apellidomaterno) AS name,
            email
     FROM candidatos
     WHERE id IS NOT NULL`,
  );

  return (rows || [])
    .map((row) => ({
      id: row.id,
      name: String(row.name || "").trim(),
      email: getPathEmail(row),
    }))
    .filter((row) => row.id && row.name);
}

function findSafeTopMatch({ user, candidates, linkedIds, minScore }) {
  const signiaName = signiaFullName(user) || getDisplayName(user);
  if (!signiaName) return null;

  const ranked = [];
  for (const candidate of candidates || []) {
    if (linkedIds.has(normalizeId(candidate.id))) continue;

    const metrics = computeNameMatchScore(
      signiaName,
      candidate.name,
      getSigniaEmail(user),
      candidate.email,
    );

    if (!metrics.viable || metrics.score < minScore) continue;
    ranked.push({ candidate, metrics });
  }

  ranked.sort((a, b) => {
    if (b.metrics.score !== a.metrics.score) return b.metrics.score - a.metrics.score;
    if (b.metrics.globalSim !== a.metrics.globalSim) return b.metrics.globalSim - a.metrics.globalSim;
    return b.metrics.matchedCount - a.metrics.matchedCount;
  });

  const top = ranked[0];
  if (!top) return null;

  // Mass-apply only unambiguous top matches. If two different candidates are
  // both 95%+, the row belongs in manual/Auto-Similitud review instead.
  const second = ranked[1];
  if (second && second.metrics.score >= minScore) return null;

  return {
    id: top.candidate.id,
    name: top.candidate.name,
    email: top.candidate.email,
    score: top.metrics.score,
    globalSim: top.metrics.globalSim,
    matchedCount: top.metrics.matchedCount,
  };
}

function getClaimKey(target, candidate) {
  if (!candidate?.id) return null;
  return `${target}:${candidate.id}`;
}

function createEmptyBreakdown() {
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

export function getBulkNameOpportunity(signiaUsers, evaUsers, pathUsers, { minScore = DEFAULT_MIN_SCORE } = {}) {
  const evaLinkedIds = new Set(
    (signiaUsers || []).map((user) => normalizeId(user.evaId)).filter(Boolean),
  );
  const pathLinkedIds = new Set(
    (signiaUsers || []).map((user) => normalizeId(user.pathId)).filter(Boolean),
  );
  const evaIndex = buildCandidateTokenIndex(evaUsers || []);
  const pathIndex = buildCandidateTokenIndex(pathUsers || []);

  const preliminary = [];
  const claimCounts = new Map();

  for (const user of signiaUsers || []) {
    const missingEva = !hasLinkValue(user.evaId);
    const missingPath = !hasLinkValue(user.pathId);
    if (!missingEva && !missingPath) continue;

    const evaCandidates = missingEva
      ? getIndexedCandidateSubset(user, evaUsers || [], evaIndex)
      : [];
    const pathCandidates = missingPath
      ? getIndexedCandidateSubset(user, pathUsers || [], pathIndex)
      : [];
    const evaCandidate = missingEva
      ? findSafeTopMatch({ user, candidates: evaCandidates, linkedIds: evaLinkedIds, minScore })
      : null;
    const pathCandidate = missingPath
      ? findSafeTopMatch({ user, candidates: pathCandidates, linkedIds: pathLinkedIds, minScore })
      : null;

    if (!evaCandidate && !pathCandidate) continue;

    preliminary.push({ user, evaCandidate, pathCandidate });
    const evaKey = getClaimKey("eva", evaCandidate);
    const pathKey = getClaimKey("path", pathCandidate);
    if (evaKey) claimCounts.set(evaKey, (claimCounts.get(evaKey) || 0) + 1);
    if (pathKey) claimCounts.set(pathKey, (claimCounts.get(pathKey) || 0) + 1);
  }

  const matches = [];
  const breakdown = createEmptyBreakdown();

  for (const row of preliminary) {
    const evaKey = getClaimKey("eva", row.evaCandidate);
    const pathKey = getClaimKey("path", row.pathCandidate);
    const evaCandidate = evaKey && claimCounts.get(evaKey) === 1 ? row.evaCandidate : null;
    const pathCandidate = pathKey && claimCounts.get(pathKey) === 1 ? row.pathCandidate : null;
    if (!evaCandidate && !pathCandidate) continue;

    const user = row.user;
    const missingEva = !hasLinkValue(user.evaId);
    const missingPath = !hasLinkValue(user.pathId);
    const missingBoth = missingEva && missingPath;
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

    matches.push({
      signiaId: user.id,
      name: getDisplayName(user),
      email: getSigniaEmail(user),
      currentStatus: getCurrentStatus(user),
      missingEva,
      missingPath,
      missingBoth,
      targets: [canSetEva ? "eva" : null, canSetPath ? "path" : null].filter(Boolean),
      evaCandidate: canSetEva ? evaCandidate : null,
      pathCandidate: canSetPath ? pathCandidate : null,
    });
  }

  return {
    evaSet: breakdown.eva,
    pathSet: breakdown.path,
    bothSet: breakdown.bothTargets,
    records: matches.length,
    totalSignia: signiaUsers.length,
    minScore,
    breakdown,
    matches,
  };
}

export async function loadNameOpportunity({ waitForEva = false, evaTimeoutMs = 30000, minScore = DEFAULT_MIN_SCORE } = {}) {
  const signiaDB = await getSigniaPool();
  const pathDB = await getPathPool();
  const signiaUsers = await getActiveSigniaUsers(signiaDB);
  const [evaResult, pathUsers] = await Promise.all([
    getEvaNamePool({ waitForReady: waitForEva, timeoutMs: evaTimeoutMs }),
    getPathNamePool(pathDB),
  ]);
  const opportunity = getBulkNameOpportunity(signiaUsers, evaResult.users, pathUsers, { minScore });

  return { signiaDB, signiaUsers, evaResult, pathUsers, opportunity };
}

export async function applyNameOpportunity({ requestedIds = null, waitForEva = true, evaTimeoutMs = 30000, minScore = DEFAULT_MIN_SCORE } = {}) {
  const requestedSet = Array.isArray(requestedIds)
    ? new Set(requestedIds.map((id) => String(id)))
    : requestedIds instanceof Set
      ? new Set(Array.from(requestedIds).map((id) => String(id)))
      : null;

  const { signiaDB, evaResult, opportunity } = await loadNameOpportunity({ waitForEva, evaTimeoutMs, minScore });

  let evaSet = 0;
  let pathSet = 0;
  let bothSet = 0;
  const updatedIds = new Set();
  const applied = [];

  for (const match of opportunity.matches) {
    if (requestedSet && !requestedSet.has(String(match.signiaId))) continue;

    let appliedEva = false;
    let appliedPath = false;

    if (match.evaCandidate) {
      const [result] = await signiaDB.query(
        `UPDATE user
         SET evaId=?
         WHERE id=? AND isActive=1 AND (evaId IS NULL OR evaId=0 OR evaId='')`,
        [match.evaCandidate.id, match.signiaId],
      );
      appliedEva = Number(result?.affectedRows || 0) > 0;
    }

    if (match.pathCandidate) {
      const [result] = await signiaDB.query(
        `UPDATE user
         SET pathId=?
         WHERE id=? AND isActive=1 AND (pathId IS NULL OR pathId=0 OR pathId='')`,
        [match.pathCandidate.id, match.signiaId],
      );
      appliedPath = Number(result?.affectedRows || 0) > 0;
    }

    if (!appliedEva && !appliedPath) continue;

    if (appliedEva) evaSet += 1;
    if (appliedPath) pathSet += 1;
    if (appliedEva && appliedPath) bothSet += 1;
    updatedIds.add(match.signiaId);
    applied.push({
      ...match,
      evaCandidate: appliedEva ? match.evaCandidate : null,
      pathCandidate: appliedPath ? match.pathCandidate : null,
      targets: [appliedEva ? "eva" : null, appliedPath ? "path" : null].filter(Boolean),
    });
  }

  return {
    evaSet,
    pathSet,
    bothSet,
    records: updatedIds.size,
    usersUpdated: updatedIds.size,
    totalSignia: opportunity.totalSignia,
    minScore,
    evaReady: evaResult.ready,
    evaStatus: evaResult.status,
    evaError: evaResult.error,
    selected: requestedSet ? requestedSet.size : null,
    applied,
  };
}
