import { getSigniaPool, getPathPool } from "./serverDb.js";
import { getEvaEmail, getPathEmail, getSigniaEmail, normalizeEmail } from "./emailIdentity.js";
import { hasLinkValue, normalizeLinkId } from "./linkIdentity.js";
import { createEmailMatchDebugger } from "./emailMatchDebug.js";

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
  return selectAvailableCandidateWithReason(candidates, ownerByCandidateId, currentUser).candidate;
}

function selectAvailableCandidateWithReason(candidates = [], ownerByCandidateId, currentUser) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return { candidate: null, reason: "no_candidates", ownedByOther: 0, missingId: 0, candidateCount: 0 };
  }

  let ownedByOther = 0;
  let missingId = 0;
  const owners = [];

  for (const candidate of candidates) {
    const candidateId = toId(candidate?.id);
    if (!candidateId) {
      missingId += 1;
      continue;
    }
    const owner = ownerByCandidateId.get(candidateId);
    if (!owner || String(owner.id) === String(currentUser.id)) {
      return {
        candidate,
        reason: owner ? "owned_by_current_user" : "available",
        ownedByOther,
        missingId,
        candidateCount: candidates.length,
        owner: owner || null,
      };
    }
    ownedByOther += 1;
    if (owners.length < 5) owners.push({ signiaId: owner.id, candidateId });
  }

  return {
    candidate: null,
    reason: ownedByOther ? "all_candidates_owned_by_other_active_signia" : "no_usable_candidate_id",
    ownedByOther,
    missingId,
    candidateCount: candidates.length,
    owners,
  };
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

export async function getSigniaUsers(signiaDB, debug = null) {
  const [rows] = await signiaDB.query(
    `SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email,evaId,pathId,isActive FROM user WHERE isActive=1`,
  );
  const users = rows || [];
  if (debug?.enabled) {
    const withEmail = users.filter((user) => getSigniaEmail(user)).length;
    const missingEva = users.filter((user) => !hasLinkValue(user.evaId)).length;
    const missingPath = users.filter((user) => !hasLinkValue(user.pathId)).length;
    const missingBoth = users.filter((user) => !hasLinkValue(user.evaId) && !hasLinkValue(user.pathId)).length;
    debug.set("signia.activeUsersLoaded", users.length);
    debug.set("signia.withUsableEmail", withEmail);
    debug.set("signia.withoutUsableEmail", users.length - withEmail);
    debug.set("signia.missingEva", missingEva);
    debug.set("signia.missingPath", missingPath);
    debug.set("signia.missingBoth", missingBoth);
    debug.emit("signia_loaded", {
      activeUsersLoaded: users.length,
      withUsableEmail: withEmail,
      withoutUsableEmail: users.length - withEmail,
      missingEva,
      missingPath,
      missingBoth,
    });
    for (const user of users) {
      if (debug.isFocusUser(user)) {
        debug.emit("focus_signia_user_loaded", { user: debug.userSnapshot(user, getSigniaEmail(user)) }, { force: true });
      }
    }
  }
  return users;
}

export async function getEvaEmailMap({ waitForReady = false, timeoutMs = 30000, debug = null } = {}) {
  let eva;
  let waitEva;

  if (debug?.enabled) {
    debug.emit("eva_import_start", { waitForReady, timeoutMs });
  }

  try {
    const shared = await import("../api/shared.js");
    eva = shared.getEva();
    waitEva = shared.waitEva;
  } catch (error) {
    if (debug?.enabled) {
      debug.emit("eva_import_error", { error: error?.message || String(error) }, { force: true });
    }
    return {
      map: new Map(),
      ready: false,
      status: "error",
      error: error?.message || "No se pudo inicializar EVA",
      usersRead: 0,
      emailsIndexed: 0,
      rowsWithEmail: 0,
      rowsWithoutEmail: 0,
      rowsWithoutId: 0,
      duplicateEmailGroups: 0,
    };
  }

  let waitError = null;

  if (debug?.enabled) {
    debug.emit("eva_status_before_wait", { ready: Boolean(eva.ready), status: eva.status || "init" });
  }

  if (waitForReady && !eva.ready) {
    try {
      await waitEva(timeoutMs);
    } catch (error) {
      waitError = error;
      if (debug?.enabled) {
        debug.emit("eva_wait_error", { error: error?.message || String(error), status: eva.status || "init" }, { force: true });
      }
    }
  }

  if (debug?.enabled) {
    debug.emit("eva_status_after_wait", { ready: Boolean(eva.ready), status: eva.status || "init", waitError: waitError?.message || null });
  }

  if (!eva.ready) {
    if (debug?.enabled) {
      debug.emit("eva_not_ready", { status: eva.status || "init", error: waitError?.message || null }, { force: true });
    }
    return {
      map: new Map(),
      ready: false,
      status: eva.status || "init",
      error: waitError?.message || null,
      usersRead: 0,
      emailsIndexed: 0,
      rowsWithEmail: 0,
      rowsWithoutEmail: 0,
      rowsWithoutId: 0,
      duplicateEmailGroups: 0,
    };
  }

  let evaUsers = [];
  try {
    evaUsers = eva.getUsers();
  } catch (error) {
    if (debug?.enabled) {
      debug.emit("eva_get_users_error", { error: error?.message || String(error), status: eva.status || "error" }, { force: true });
    }
    return {
      map: new Map(),
      ready: false,
      status: eva.status || "error",
      error: error?.message || "No se pudieron leer usuarios EVA",
      usersRead: 0,
      emailsIndexed: 0,
      rowsWithEmail: 0,
      rowsWithoutEmail: 0,
      rowsWithoutId: 0,
      duplicateEmailGroups: 0,
    };
  }

  const map = new Map();
  let rowsWithEmail = 0;
  let rowsWithoutEmail = 0;
  let rowsWithoutId = 0;
  for (const user of evaUsers || []) {
    const email = getEvaEmail(user);
    if (!email) {
      rowsWithoutEmail += 1;
      if (debug?.enabled) {
        debug.emit("eva_row_without_email", { candidate: debug.candidateSnapshot(user, email) }, { sampleKey: "eva_row_without_email" });
      }
      continue;
    }
    rowsWithEmail += 1;
    if (!user.CID) {
      rowsWithoutId += 1;
      if (debug?.enabled) {
        debug.emit("eva_row_without_cid", { candidate: debug.candidateSnapshot(user, email) }, { sampleKey: "eva_row_without_cid" });
      }
      continue;
    }
    const candidate = {
      id: user.CID,
      name: user.nombre || user.N || "EVA",
      email,
      status: user.estado || user.D || "",
      fechaProceso: user.fechaProceso || user.PD || "",
      exactEmail: true,
    };
    addCandidate(map, email, candidate);
    if (debug?.enabled && debug.isFocusEmail(email)) {
      debug.emit("focus_eva_candidate_indexed", { candidate: debug.candidateSnapshot(candidate, email) }, { force: true });
    }
  }

  let duplicateEmailGroups = 0;
  for (const [email, candidates] of map.entries()) {
    if (candidates.length > 1) {
      duplicateEmailGroups += 1;
      if (debug?.enabled) {
        debug.emit("eva_duplicate_email_group", {
          email: debug.emailSnapshot(email),
          candidateCount: candidates.length,
          candidates: candidates.slice(0, 5).map((candidate) => debug.candidateSnapshot(candidate, email)),
        }, { sampleKey: "eva_duplicate_email_group" });
      }
    }
    map.set(email, candidates.sort(compareEvaCandidates));
  }

  if (debug?.enabled) {
    debug.set("eva.ready", true);
    debug.set("eva.usersRead", Array.isArray(evaUsers) ? evaUsers.length : 0);
    debug.set("eva.rowsWithEmail", rowsWithEmail);
    debug.set("eva.rowsWithoutEmail", rowsWithoutEmail);
    debug.set("eva.rowsWithoutId", rowsWithoutId);
    debug.set("eva.uniqueEmailsIndexed", map.size);
    debug.set("eva.duplicateEmailGroups", duplicateEmailGroups);
    debug.emit("eva_index_complete", {
      ready: true,
      status: eva.status || "ready",
      usersRead: Array.isArray(evaUsers) ? evaUsers.length : 0,
      rowsWithEmail,
      rowsWithoutEmail,
      rowsWithoutId,
      uniqueEmailsIndexed: map.size,
      duplicateEmailGroups,
    });
  }

  return {
    map,
    ready: true,
    status: eva.status || "ready",
    error: null,
    usersRead: Array.isArray(evaUsers) ? evaUsers.length : 0,
    emailsIndexed: map.size,
    rowsWithEmail,
    rowsWithoutEmail,
    rowsWithoutId,
    duplicateEmailGroups,
  };
}

export async function getPathEmailMap(pathDB, signiaUsers, debug = null) {
  const emails = Array.from(
    new Set(signiaUsers.map((user) => getSigniaEmail(user)).filter(Boolean)),
  );

  if (!emails.length) {
    if (debug?.enabled) debug.emit("path_index_skipped_no_signia_emails", {});
    return new Map();
  }

  const map = new Map();
  let rawRowsRead = 0;
  let rowsWithEmail = 0;
  let rowsWithoutEmail = 0;
  let rowsWithoutId = 0;
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

    rawRowsRead += Array.isArray(rows) ? rows.length : 0;
    if (debug?.enabled) {
      debug.emit("path_chunk_read", { chunkIndex: Math.floor(i / chunkSize) + 1, chunkSize: chunk.length, rowsRead: Array.isArray(rows) ? rows.length : 0 }, { sampleKey: "path_chunk_read" });
    }
    for (const row of rows || []) {
      const email = getPathEmail(row);
      if (!email) {
        rowsWithoutEmail += 1;
        continue;
      }
      rowsWithEmail += 1;
      if (!row.id) {
        rowsWithoutId += 1;
        continue;
      }
      const candidate = {
        id: row.id,
        name: row.name || "PATH",
        email,
        exactEmail: true,
      };
      addCandidate(map, email, candidate);
      if (debug?.enabled && debug.isFocusEmail(email)) {
        debug.emit("focus_path_candidate_indexed", { candidate: debug.candidateSnapshot(candidate, email) }, { force: true });
      }
    }
  }

  let duplicateEmailGroups = 0;
  for (const [email, candidates] of map.entries()) {
    if (candidates.length > 1) {
      duplicateEmailGroups += 1;
      if (debug?.enabled) {
        debug.emit("path_duplicate_email_group", {
          email: debug.emailSnapshot(email),
          candidateCount: candidates.length,
          candidates: candidates.slice(0, 5).map((candidate) => debug.candidateSnapshot(candidate, email)),
        }, { sampleKey: "path_duplicate_email_group" });
      }
    }
  }

  if (debug?.enabled) {
    debug.set("path.signiaEmailsQueried", emails.length);
    debug.set("path.rawRowsRead", rawRowsRead);
    debug.set("path.rowsWithEmail", rowsWithEmail);
    debug.set("path.rowsWithoutEmail", rowsWithoutEmail);
    debug.set("path.rowsWithoutId", rowsWithoutId);
    debug.set("path.uniqueEmailsIndexed", map.size);
    debug.set("path.duplicateEmailGroups", duplicateEmailGroups);
    debug.emit("path_index_complete", {
      signiaEmailsQueried: emails.length,
      rawRowsRead,
      rowsWithEmail,
      rowsWithoutEmail,
      rowsWithoutId,
      uniqueEmailsIndexed: map.size,
      duplicateEmailGroups,
    });
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

export function getBulkEmailOpportunity(signiaUsers, evaByEmail, pathByEmail, debug = null) {
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

  const rejectionCounters = {
    signiaWithoutEmail: 0,
    notMissingEva: 0,
    notMissingPath: 0,
    evaNoCandidatesByEmail: 0,
    pathNoCandidatesByEmail: 0,
    evaRejectedOwnedByOther: 0,
    pathRejectedOwnedByOther: 0,
    evaIntersectionBeforeAvailability: 0,
    pathIntersectionBeforeAvailability: 0,
    evaAccepted: 0,
    pathAccepted: 0,
  };

  for (const user of signiaUsers || []) {
    const email = getSigniaEmail(user);
    if (!email) {
      rejectionCounters.signiaWithoutEmail += 1;
      if (debug?.enabled && debug.isFocusUser(user)) {
        debug.emit("focus_signia_without_email", { user: debug.userSnapshot(user, email) }, { force: true });
      }
      continue;
    }

    const evaCandidates = evaByEmail.get(email) || [];
    const pathCandidates = pathByEmail.get(email) || [];
    const missingEva = !hasLinkValue(user.evaId);
    const missingPath = !hasLinkValue(user.pathId);
    const missingBoth = missingEva && missingPath;

    if (!missingEva) rejectionCounters.notMissingEva += 1;
    if (!missingPath) rejectionCounters.notMissingPath += 1;
    if (missingEva && evaCandidates.length) rejectionCounters.evaIntersectionBeforeAvailability += 1;
    if (missingPath && pathCandidates.length) rejectionCounters.pathIntersectionBeforeAvailability += 1;
    if (missingEva && !evaCandidates.length) rejectionCounters.evaNoCandidatesByEmail += 1;
    if (missingPath && !pathCandidates.length) rejectionCounters.pathNoCandidatesByEmail += 1;

    const evaSelection = missingEva
      ? selectAvailableCandidateWithReason(evaCandidates, evaOwnerByCandidateId, user)
      : { candidate: null, reason: "not_missing_eva", candidateCount: evaCandidates.length };
    const pathSelection = missingPath
      ? selectAvailableCandidateWithReason(pathCandidates, pathOwnerByCandidateId, user)
      : { candidate: null, reason: "not_missing_path", candidateCount: pathCandidates.length };

    if (missingEva && !evaSelection.candidate && evaSelection.reason === "all_candidates_owned_by_other_active_signia") {
      rejectionCounters.evaRejectedOwnedByOther += 1;
    }
    if (missingPath && !pathSelection.candidate && pathSelection.reason === "all_candidates_owned_by_other_active_signia") {
      rejectionCounters.pathRejectedOwnedByOther += 1;
    }

    const evaCandidate = evaSelection.candidate;
    const pathCandidate = pathSelection.candidate;
    const canSetEva = missingEva && Boolean(evaCandidate);
    const canSetPath = missingPath && Boolean(pathCandidate);
    if (canSetEva) rejectionCounters.evaAccepted += 1;
    if (canSetPath) rejectionCounters.pathAccepted += 1;

    if (debug?.enabled && (debug.isFocusUser(user) || debug.isFocusEmail(email) || canSetEva || canSetPath)) {
      debug.emit(canSetEva || canSetPath ? "email_match_user_accepted_or_candidate" : "email_match_user_rejected", {
        user: debug.userSnapshot(user, email),
        missingEva,
        missingPath,
        missingBoth,
        evaCandidateCount: evaCandidates.length,
        pathCandidateCount: pathCandidates.length,
        evaSelection: {
          reason: evaSelection.reason,
          ownedByOther: evaSelection.ownedByOther || 0,
          missingId: evaSelection.missingId || 0,
          candidateCount: evaSelection.candidateCount || 0,
          selected: evaCandidate ? debug.candidateSnapshot(evaCandidate, evaCandidate.email) : null,
          owners: evaSelection.owners || [],
        },
        pathSelection: {
          reason: pathSelection.reason,
          ownedByOther: pathSelection.ownedByOther || 0,
          missingId: pathSelection.missingId || 0,
          candidateCount: pathSelection.candidateCount || 0,
          selected: pathCandidate ? debug.candidateSnapshot(pathCandidate, pathCandidate.email) : null,
          owners: pathSelection.owners || [],
        },
      }, { force: debug.isFocusUser(user) || debug.isFocusEmail(email), sampleKey: canSetEva || canSetPath ? "email_match_candidate" : "email_match_rejected" });
    }

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

  if (debug?.enabled) {
    for (const [key, value] of Object.entries(rejectionCounters)) {
      debug.set(`opportunity.${key}`, value);
    }
    debug.set("opportunity.records", matches.length);
    debug.set("opportunity.evaSet", breakdown.eva);
    debug.set("opportunity.pathSet", breakdown.path);
    debug.set("opportunity.bothSet", breakdown.bothTargets);
    debug.emit("opportunity_complete", {
      records: matches.length,
      totalSignia: signiaUsers.length,
      evaSet: breakdown.eva,
      pathSet: breakdown.path,
      bothSet: breakdown.bothTargets,
      breakdown,
      rejectionCounters,
    }, { force: true });
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

export async function loadEmailOpportunity({ waitForEva = false, evaTimeoutMs = 30000, debug: debugOptions = null } = {}) {
  const debug = createEmailMatchDebugger(debugOptions || {});
  if (debug.enabled) {
    debug.emit("email_opportunity_start", { waitForEva, evaTimeoutMs, focusSigniaId: debug.focusSigniaId || null, focusEmail: debug.focusEmail ? debug.emailSnapshot(debug.focusEmail) : null }, { force: true });
  }

  const signiaDB = await getSigniaPool();
  const pathDB = await getPathPool();
  const signiaUsers = await getSigniaUsers(signiaDB, debug);
  const evaResult = await getEvaEmailMap({ waitForReady: waitForEva, timeoutMs: evaTimeoutMs, debug });
  const pathByEmail = await getPathEmailMap(pathDB, signiaUsers, debug);
  const opportunity = getBulkEmailOpportunity(signiaUsers, evaResult.map, pathByEmail, debug);

  if (debug.enabled) {
    debug.emit("email_opportunity_end", {
      evaReady: evaResult.ready,
      evaStatus: evaResult.status,
      records: opportunity.records,
      evaSet: opportunity.evaSet,
      pathSet: opportunity.pathSet,
      bothSet: opportunity.bothSet,
    }, { force: true });
  }

  return { signiaDB, signiaUsers, evaResult, pathByEmail, opportunity, debug };
}

export async function applyEmailOpportunity({ requestedIds = null, waitForEva = true, evaTimeoutMs = 30000, debug: debugOptions = null } = {}) {
  const requestedSet = Array.isArray(requestedIds)
    ? new Set(requestedIds.map((id) => String(id)))
    : requestedIds instanceof Set
      ? new Set(Array.from(requestedIds).map((id) => String(id)))
      : null;

  const { signiaDB, evaResult, opportunity, debug } = await loadEmailOpportunity({ waitForEva, evaTimeoutMs, debug: debugOptions });

  let evaSet = 0;
  let pathSet = 0;
  let bothSet = 0;
  const updatedIds = new Set();
  const applied = [];

  for (const match of opportunity.matches) {
    if (requestedSet && !requestedSet.has(String(match.signiaId))) {
      if (debug?.enabled) debug.emit("apply_skip_not_requested", { signiaId: match.signiaId }, { sampleKey: "apply_skip_not_requested" });
      continue;
    }

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
    if (!Number(result?.affectedRows || 0)) {
      if (debug?.enabled) {
        debug.emit("apply_update_noop", {
          signiaId: match.signiaId,
          targets: match.targets,
          reason: "UPDATE affectedRows=0; user may no longer be active or link field was already set",
        }, { sampleKey: "apply_update_noop" });
      }
      continue;
    }

    if (debug?.enabled) {
      debug.emit("apply_update_success", {
        signiaId: match.signiaId,
        targets: match.targets,
        evaCandidateId: match.evaCandidate?.id || null,
        pathCandidateId: match.pathCandidate?.id || null,
      }, { sampleKey: "apply_update_success" });
    }

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
    debug: debug?.enabled ? debug.snapshot() : undefined,
  };
}
