import { getSigniaPool, getPathPool } from "./serverDb.js";
import { getEvaEmail, getPathEmail, getSigniaEmail, normalizeEmail } from "./emailIdentity.js";
import { hasLinkValue, normalizeLinkId } from "./linkIdentity.js";

export { normalizeEmail, hasLinkValue, normalizeLinkId };

const SOURCE_CONFIG = {
  eva: {
    label: "EVA",
    field: "evaId",
    candidateKey: "evaCandidate",
    actionKey: "eva",
    conflictKey: "eva",
  },
  path: {
    label: "PATH",
    field: "pathId",
    candidateKey: "pathCandidate",
    actionKey: "path",
    conflictKey: "path",
  },
};

function toId(value) {
  return normalizeLinkId(value);
}

function sourceConfig(source) {
  return SOURCE_CONFIG[source];
}

function addCandidate(map, email, candidate) {
  if (!email) return;
  const key = normalizeEmail(email);
  if (!key) return;
  const existing = map.get(key) || [];
  const candidateId = toId(candidate?.id);
  const identity = candidateId ? `id:${candidateId}` : `missing:${existing.length}`;
  if (!candidateId || !existing.some((item) => `id:${toId(item?.id)}` === identity)) {
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

  return statusRank(b) - statusRank(a) || dateValue(b) - dateValue(a) || String(b.id || "").localeCompare(String(a.id || ""), undefined, { numeric: true });
}

function compactCandidate(candidate = {}) {
  return {
    id: toId(candidate.id),
    name: candidate.name || "Sin nombre",
    email: normalizeEmail(candidate.email),
    status: candidate.status || "",
    fechaProceso: candidate.fechaProceso || "",
  };
}

function compactOwner(owner = {}, source) {
  const cfg = sourceConfig(source);
  return {
    signiaId: owner.id,
    name: getDisplayName(owner),
    email: getSigniaEmail(owner),
    previousId: toId(owner[cfg.field]),
  };
}

function summarizeCandidates(candidates = [], limit = 5) {
  return candidates.slice(0, limit).map(compactCandidate);
}

function summarizeOwners(owners = [], source, limit = 5) {
  return owners.slice(0, limit).map((owner) => compactOwner(owner, source));
}

function pushLimited(list, item, limit = 100) {
  if (!Array.isArray(list) || list.length >= limit) return;
  list.push(item);
}

function incrementSummary(summary, section, source, amount = 1) {
  if (!summary[section]) summary[section] = { eva: 0, path: 0, total: 0 };
  summary[section][source] = Number(summary[section][source] || 0) + amount;
  summary[section].total = Number(summary[section].total || 0) + amount;
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
    `SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email,evaId,pathId,isActive FROM user WHERE isActive=1`,
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
      rowsWithEmail: 0,
      rowsWithoutEmail: 0,
      rowsWithoutId: 0,
      duplicateEmailGroups: 0,
      emailRows: [],
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
      rowsWithEmail: 0,
      rowsWithoutEmail: 0,
      rowsWithoutId: 0,
      duplicateEmailGroups: 0,
      emailRows: [],
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
      rowsWithEmail: 0,
      rowsWithoutEmail: 0,
      rowsWithoutId: 0,
      duplicateEmailGroups: 0,
      emailRows: [],
    };
  }

  const map = new Map();
  const emailRows = [];
  let rowsWithEmail = 0;
  let rowsWithoutEmail = 0;
  let rowsWithoutId = 0;

  for (const user of evaUsers || []) {
    const email = getEvaEmail(user);
    const id = toId(user.CID);
    const name = user.nombre || user.N || "EVA";
    if (!email) {
      rowsWithoutEmail += 1;
      continue;
    }
    rowsWithEmail += 1;
    emailRows.push({
      source: "eva",
      id,
      name,
      email,
      usable: Boolean(id),
      reason: id ? "usable" : "missing_id",
    });
    addCandidate(map, email, {
      id,
      name,
      email,
      status: user.estado || user.D || "",
      fechaProceso: user.fechaProceso || user.PD || "",
      exactEmail: true,
    });
    if (!id) rowsWithoutId += 1;
  }

  let duplicateEmailGroups = 0;
  for (const [email, candidates] of map.entries()) {
    if (candidates.filter((candidate) => toId(candidate.id)).length > 1) duplicateEmailGroups += 1;
    map.set(email, candidates.sort(compareEvaCandidates));
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
    emailRows,
  };
}

export async function getPathEmailMap(pathDB, signiaUsers = []) {
  const map = new Map();
  const emailRows = [];
  let rawRowsRead = 0;
  let rowsWithEmail = 0;
  let rowsWithoutEmail = 0;
  let rowsWithoutId = 0;

  const [rows] = await pathDB.query(
    `SELECT id, CONCAT_WS(' ', nombres, apellidopaterno, apellidomaterno) AS name, email
     FROM candidatos
     WHERE email IS NOT NULL AND TRIM(email) <> ''
     ORDER BY id DESC`,
  );

  rawRowsRead = Array.isArray(rows) ? rows.length : 0;
  for (const row of rows || []) {
    const email = getPathEmail(row);
    const id = toId(row.id);
    const name = row.name || "PATH";
    if (!email) {
      rowsWithoutEmail += 1;
      continue;
    }
    rowsWithEmail += 1;
    emailRows.push({
      source: "path",
      id,
      name,
      email,
      usable: Boolean(id),
      reason: id ? "usable" : "missing_id",
    });
    addCandidate(map, email, {
      id,
      name,
      email,
      exactEmail: true,
    });
    if (!id) rowsWithoutId += 1;
  }

  let duplicateEmailGroups = 0;
  for (const candidates of map.values()) {
    if (candidates.filter((candidate) => toId(candidate.id)).length > 1) duplicateEmailGroups += 1;
  }

  map.stats = {
    signiaEmailsQueried: Array.from(new Set((signiaUsers || []).map((user) => getSigniaEmail(user)).filter(Boolean))).length,
    rawRowsRead,
    rowsWithEmail,
    rowsWithoutEmail,
    rowsWithoutId,
    emailsIndexed: map.size,
    duplicateEmailGroups,
  };
  map.emailRows = emailRows;

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

function countSigniaByEmailState(signiaUsers = []) {
  let withEmail = 0;
  let withoutEmail = 0;
  let missingEvaWithEmail = 0;
  let missingPathWithEmail = 0;
  let missingBothWithEmail = 0;

  for (const user of signiaUsers || []) {
    const email = getSigniaEmail(user);
    const missingEva = !hasLinkValue(user.evaId);
    const missingPath = !hasLinkValue(user.pathId);
    if (email) withEmail += 1;
    else withoutEmail += 1;
    if (email && missingEva) missingEvaWithEmail += 1;
    if (email && missingPath) missingPathWithEmail += 1;
    if (email && missingEva && missingPath) missingBothWithEmail += 1;
  }

  return { withEmail, withoutEmail, missingEvaWithEmail, missingPathWithEmail, missingBothWithEmail };
}

function pushExample(bucket, row) {
  if (!Array.isArray(bucket.examples)) bucket.examples = [];
  if (bucket.examples.length >= 3) return;
  bucket.examples.push({
    id: row.id || null,
    name: row.name || "Sin nombre",
    usable: row.usable !== false,
    reason: row.reason || "usable",
  });
}

function aggregateSourceEmailRows(rows = [], pendingEmailSet = new Map()) {
  const byEmail = new Map();
  for (const row of rows || []) {
    const email = normalizeEmail(row?.email);
    if (!email) continue;
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        count: 0,
        usableCount: 0,
        missingIdCount: 0,
        matchedPendingCount: 0,
        matched: false,
        conflict: false,
        examples: [],
      });
    }
    const bucket = byEmail.get(email);
    bucket.count += 1;
    if (row.usable === false) bucket.missingIdCount += 1;
    else bucket.usableCount += 1;
    if (bucket.usableCount > 1) bucket.conflict = true;
    pushExample(bucket, row);
  }

  for (const bucket of byEmail.values()) {
    const pendingCount = Number(pendingEmailSet.get(bucket.email) || 0);
    bucket.matchedPendingCount = pendingCount;
    bucket.matched = pendingCount > 0;
  }

  return Array.from(byEmail.values()).sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    if (b.matchedPendingCount !== a.matchedPendingCount) return b.matchedPendingCount - a.matchedPendingCount;
    return a.email.localeCompare(b.email);
  });
}

function incrementEmailCount(map, email) {
  if (!email) return;
  map.set(email, (map.get(email) || 0) + 1);
}

function normalizeAuditQuery(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
}

function auditRowMatchesQuery(row = {}, query = "") {
  const normalizedQuery = normalizeAuditQuery(query);
  if (!normalizedQuery) return true;
  const haystack = [
    row.email,
    row.name,
    row.id,
    row.matchSources?.join(" "),
    ...(row.examples || []).flatMap((example) => [example.id, example.name, example.reason]),
  ]
    .filter((value) => value !== null && value !== undefined)
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

function auditRowHasMatch(row = {}) {
  return Boolean(row.matched || row.matchedPendingCount > 0 || row.evaEmailExists || row.pathEmailExists);
}

function selectAuditRows(rows = [], { search = "", limit = 25 } = {}) {
  const normalizedSearch = normalizeAuditQuery(search);
  const safeLimit = Math.max(0, Math.min(Number(limit) || 25, 100));
  const baseRows = Array.isArray(rows) ? rows : [];
  const filteredRows = normalizedSearch
    ? baseRows.filter((row) => auditRowMatchesQuery(row, normalizedSearch))
    : baseRows.filter(auditRowHasMatch);

  return {
    rows: filteredRows.slice(0, safeLimit),
    filtered: filteredRows.length,
    total: baseRows.length,
    shown: Math.min(filteredRows.length, safeLimit),
    truncated: filteredRows.length > safeLimit,
  };
}

function buildEmailAudit({ signiaUsers, evaResult, pathByEmail, auditSearch = "", auditLimit = 25 }) {
  const evaComparableEmails = new Map();
  const pathComparableEmails = new Map();

  for (const user of signiaUsers || []) {
    const email = getSigniaEmail(user);
    if (!email) continue;
    incrementEmailCount(evaComparableEmails, email);
    incrementEmailCount(pathComparableEmails, email);
  }

  const eva = aggregateSourceEmailRows(evaResult?.emailRows || [], evaComparableEmails);
  const path = aggregateSourceEmailRows(pathByEmail?.emailRows || [], pathComparableEmails);
  const evaEmailSet = new Set(eva.map((row) => row.email));
  const pathEmailSet = new Set(path.map((row) => row.email));

  const signia = [];
  for (const user of signiaUsers || []) {
    const email = getSigniaEmail(user);
    if (!email) continue;
    const missingEva = !hasLinkValue(user.evaId);
    const missingPath = !hasLinkValue(user.pathId);
    const evaEmailExists = evaEmailSet.has(email);
    const pathEmailExists = pathEmailSet.has(email);
    signia.push({
      id: user.id,
      name: getDisplayName(user),
      email,
      missingEva,
      missingPath,
      currentEvaId: toId(user.evaId),
      currentPathId: toId(user.pathId),
      evaEmailExists,
      pathEmailExists,
      matched: Boolean(evaEmailExists || pathEmailExists),
      matchSources: [evaEmailExists ? "EVA" : null, pathEmailExists ? "PATH" : null].filter(Boolean),
    });
  }

  signia.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    return a.email.localeCompare(b.email);
  });

  const signiaMatchedEva = signia.filter((row) => row.evaEmailExists).length;
  const signiaMatchedPath = signia.filter((row) => row.pathEmailExists).length;
  const signiaSelection = selectAuditRows(signia, { search: auditSearch, limit: auditLimit });
  const evaSelection = selectAuditRows(eva, { search: auditSearch, limit: auditLimit });
  const pathSelection = selectAuditRows(path, { search: auditSearch, limit: auditLimit });

  return {
    search: normalizeAuditQuery(auditSearch),
    limit: Math.max(0, Math.min(Number(auditLimit) || 25, 100)),
    counts: {
      signia: signia.length,
      eva: eva.length,
      path: path.length,
      signiaMatchedEva,
      signiaMatchedPath,
    },
    selection: {
      signia: { total: signiaSelection.total, filtered: signiaSelection.filtered, shown: signiaSelection.shown, truncated: signiaSelection.truncated },
      eva: { total: evaSelection.total, filtered: evaSelection.filtered, shown: evaSelection.shown, truncated: evaSelection.truncated },
      path: { total: pathSelection.total, filtered: pathSelection.filtered, shown: pathSelection.shown, truncated: pathSelection.truncated },
    },
    signia: signiaSelection.rows,
    eva: evaSelection.rows,
    path: pathSelection.rows,
  };
}

function buildOwnerMaps(signiaUsers = []) {
  const maps = { eva: new Map(), path: new Map() };
  for (const owner of signiaUsers || []) {
    const evaId = toId(owner.evaId);
    const pathId = toId(owner.pathId);
    if (evaId) {
      const owners = maps.eva.get(evaId) || [];
      owners.push(owner);
      maps.eva.set(evaId, owners);
    }
    if (pathId) {
      const owners = maps.path.get(pathId) || [];
      owners.push(owner);
      maps.path.set(pathId, owners);
    }
  }
  return maps;
}

function buildSigniaEmailGroups(signiaUsers = []) {
  const groups = new Map();
  for (const user of signiaUsers || []) {
    const email = getSigniaEmail(user);
    if (!email) continue;
    const list = groups.get(email) || [];
    list.push(user);
    groups.set(email, list);
  }
  return groups;
}

function resolveUniqueCandidate(candidates = []) {
  const rows = Array.isArray(candidates) ? candidates : [];
  if (!rows.length) return { status: "none", candidate: null, candidates: [], usableCandidates: [] };

  const byId = new Map();
  for (const candidate of rows) {
    const id = toId(candidate?.id);
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, { ...candidate, id });
  }

  const usableCandidates = Array.from(byId.values());
  if (!usableCandidates.length) {
    return { status: "missing_id", candidate: null, candidates: rows, usableCandidates };
  }
  if (usableCandidates.length > 1) {
    return { status: "candidate_conflict", candidate: null, candidates: rows, usableCandidates };
  }
  return { status: "unique", candidate: usableCandidates[0], candidates: rows, usableCandidates };
}

function createAction({ source, user, candidate, currentId, staleOwners }) {
  let type = "noop";
  if (!currentId) type = "create";
  else if (currentId !== String(candidate.id)) type = "overwrite";
  else if (staleOwners.length) type = "repair";

  return {
    source,
    label: sourceConfig(source).label,
    type,
    candidate: compactCandidate(candidate),
    currentId: currentId || null,
    nextId: String(candidate.id),
    repairs: staleOwners.map((owner) => ({
      ...compactOwner(owner, source),
      reason: "email_authoritative_clear_stale_owner",
    })),
  };
}

function getActionLabel(action) {
  if (!action) return "—";
  if (action.type === "create") return `Crear ${action.label}`;
  if (action.type === "overwrite") return `Sobrescribir ${action.label}`;
  if (action.type === "repair") return `Reparar dueño ${action.label}`;
  return `${action.label} correcto`;
}

function ensureMatch(matchMap, user) {
  const key = String(user.id);
  if (!matchMap.has(key)) {
    matchMap.set(key, {
      signiaId: user.id,
      name: getDisplayName(user),
      email: getSigniaEmail(user),
      currentStatus: getCurrentStatus(user),
      missingEva: !hasLinkValue(user.evaId),
      missingPath: !hasLinkValue(user.pathId),
      missingBoth: !hasLinkValue(user.evaId) && !hasLinkValue(user.pathId),
      targets: [],
      evaCandidate: null,
      pathCandidate: null,
      emailActions: {},
      actionSummary: [],
    });
  }
  return matchMap.get(key);
}

function addActionToMatch(matchMap, user, action) {
  const cfg = sourceConfig(action.source);
  const match = ensureMatch(matchMap, user);
  match.targets.push(action.source);
  match[cfg.candidateKey] = action.candidate;
  match.emailActions[cfg.actionKey] = action;
  match.actionSummary.push(getActionLabel(action));
}

function analyzeSourceForUser({ source, user, candidates, ownersById, signiaEmailGroups, matchMap, summary, issues, breakdown }) {
  const cfg = sourceConfig(source);
  const email = getSigniaEmail(user);
  const currentId = toId(user[cfg.field]);
  const missing = !currentId;
  const resolution = resolveUniqueCandidate(candidates);

  if (resolution.status === "none") return;

  incrementSummary(summary, "intersections", source);

  const signiaSameEmail = signiaEmailGroups.get(email) || [];
  if (signiaSameEmail.length > 1) {
    incrementSummary(summary, "conflicts", source);
    pushLimited(issues.conflicts, {
      source,
      type: "duplicate_active_signia_email",
      signiaId: user.id,
      name: getDisplayName(user),
      email,
      message: "El mismo email existe en más de un usuario Signia activo.",
      signiaUsers: signiaSameEmail.slice(0, 5).map((sameUser) => ({
        signiaId: sameUser.id,
        name: getDisplayName(sameUser),
        email: getSigniaEmail(sameUser),
      })),
    });
    return;
  }

  if (resolution.status === "missing_id") {
    incrementSummary(summary, "skipped", source);
    pushLimited(issues.skipped, {
      source,
      type: "email_present_without_usable_id",
      signiaId: user.id,
      name: getDisplayName(user),
      email,
      message: `${cfg.label} tiene el email, pero ningún registro con ID usable para vincular.`,
      candidates: summarizeCandidates(resolution.candidates),
    });
    return;
  }

  if (resolution.status === "candidate_conflict") {
    incrementSummary(summary, "conflicts", source);
    pushLimited(issues.conflicts, {
      source,
      type: "multiple_candidates_same_email",
      signiaId: user.id,
      name: getDisplayName(user),
      email,
      message: `${cfg.label} tiene más de un candidato usable con el mismo email.`,
      candidates: summarizeCandidates(resolution.usableCandidates),
    });
    return;
  }

  const candidate = resolution.candidate;
  const candidateId = String(candidate.id);
  const owners = ownersById.get(candidateId) || [];
  const otherOwners = owners.filter((owner) => String(owner.id) !== String(user.id));
  const conflictingOwners = otherOwners.filter((owner) => getSigniaEmail(owner) === email);

  if (conflictingOwners.length) {
    incrementSummary(summary, "conflicts", source);
    pushLimited(issues.conflicts, {
      source,
      type: "candidate_owned_by_same_email_user",
      signiaId: user.id,
      name: getDisplayName(user),
      email,
      message: `${cfg.label} ya está vinculado a otro Signia activo con el mismo email.`,
      owners: summarizeOwners(conflictingOwners, source),
      candidate: compactCandidate(candidate),
    });
    return;
  }

  const staleOwners = otherOwners.filter((owner) => getSigniaEmail(owner) !== email);
  const needsCurrentChange = currentId !== candidateId;
  const needsRepair = staleOwners.length > 0;

  if (!needsCurrentChange && !needsRepair) {
    incrementSummary(summary, "alreadyCorrect", source);
    return;
  }

  const action = createAction({ source, user, candidate, currentId, staleOwners });
  addActionToMatch(matchMap, user, action);

  if (action.type === "create") incrementSummary(summary, "created", source);
  if (action.type === "overwrite") incrementSummary(summary, "overwritten", source);
  if (needsRepair) incrementSummary(summary, "ownerRepairs", source, staleOwners.length);
  incrementSummary(summary, "accepted", source);

  if (source === "eva") breakdown.eva += 1;
  if (source === "path") breakdown.path += 1;
  if (source === "eva" && missing) breakdown.missingEva += 1;
  if (source === "path" && missing) breakdown.missingPath += 1;
}

function finalizeBreakdown(matches = [], breakdown) {
  for (const match of matches) {
    const hasEvaAction = Boolean(match.emailActions?.eva);
    const hasPathAction = Boolean(match.emailActions?.path);
    if (hasEvaAction && hasPathAction) breakdown.bothTargets += 1;
    if (match.missingBoth && (hasEvaAction || hasPathAction)) breakdown.missingBoth += 1;
    if (match.missingBoth && hasEvaAction) breakdown.missingBothWithEva += 1;
    if (match.missingBoth && hasPathAction) breakdown.missingBothWithPath += 1;
    if (match.missingBoth && hasEvaAction && hasPathAction) breakdown.missingBothWithBothTargets += 1;
  }
}

function buildEmailSummary() {
  return {
    intersections: { eva: 0, path: 0, total: 0 },
    accepted: { eva: 0, path: 0, total: 0 },
    created: { eva: 0, path: 0, total: 0 },
    overwritten: { eva: 0, path: 0, total: 0 },
    ownerRepairs: { eva: 0, path: 0, total: 0 },
    alreadyCorrect: { eva: 0, path: 0, total: 0 },
    conflicts: { eva: 0, path: 0, total: 0 },
    skipped: { eva: 0, path: 0, total: 0 },
  };
}

function buildEmailDiagnostic({ signiaUsers, evaResult, pathByEmail, opportunity, auditSearch = "", auditLimit = 25 }) {
  const emailState = countSigniaByEmailState(signiaUsers);
  const audit = buildEmailAudit({ signiaUsers, evaResult, pathByEmail, auditSearch, auditLimit });
  const summary = opportunity?.emailSummary || buildEmailSummary();
  const evaEmailsIndexed = evaResult?.ready === false ? null : Number(evaResult?.emailsIndexed || 0);
  const pathStats = pathByEmail?.stats || {};
  const pathEmailsIndexed = Number(pathStats.emailsIndexed || pathByEmail?.size || 0);

  let status = "ready";
  let message = "Email match autoritativo calculado.";

  if (evaResult?.ready === false) {
    status = "eva-not-ready";
    message = `EVA está en estado ${evaResult.status || "desconocido"}; las coincidencias EVA pueden estar incompletas.`;
  } else if (summary.intersections.total === 0) {
    status = "no-email-intersections";
    message = "No signia user email mached an email from eva or path";
  } else if (summary.accepted.total === 0) {
    status = "intersections-not-actionable";
    message = "Hay emails iguales entre Signia y EVA/PATH, pero ninguno puede aplicarse automáticamente sin conflicto o ID usable.";
  } else {
    status = "authoritative-actions-ready";
    message = "Hay coincidencias por email listas para crear, sobrescribir o reparar vínculos.";
  }

  return {
    status,
    message,
    sources: {
      activeSigniaUsers: Array.isArray(signiaUsers) ? signiaUsers.length : 0,
      signiaWithEmail: emailState.withEmail,
      signiaWithoutEmail: emailState.withoutEmail,
      evaEmailsIndexed,
      pathEmailsIndexed,
    },
    compared: {
      signiaWithEmail: emailState.withEmail,
      missingEvaWithEmail: emailState.missingEvaWithEmail,
      missingPathWithEmail: emailState.missingPathWithEmail,
      missingBothWithEmail: emailState.missingBothWithEmail,
    },
    intersections: {
      eva: summary.intersections.eva,
      path: summary.intersections.path,
      total: summary.intersections.total,
      applicableEva: summary.accepted.eva,
      applicablePath: summary.accepted.path,
      applicableTotal: summary.accepted.total,
    },
    accepted: {
      eva: summary.accepted.eva,
      path: summary.accepted.path,
      records: opportunity?.records || 0,
    },
    actions: {
      created: summary.created,
      overwritten: summary.overwritten,
      ownerRepairs: summary.ownerRepairs,
      alreadyCorrect: summary.alreadyCorrect,
      skipped: summary.skipped,
      conflicts: summary.conflicts,
    },
    blocked: {
      evaOwnedByOther: 0,
      pathOwnedByOther: 0,
      total: 0,
    },
    issues: opportunity?.issues || { conflicts: [], skipped: [] },
    audit,
  };
}

export function getBulkEmailOpportunity(signiaUsers, evaByEmail, pathByEmail) {
  const breakdown = createEmptyBreakdown();
  const matchMap = new Map();
  const ownerMaps = buildOwnerMaps(signiaUsers);
  const signiaEmailGroups = buildSigniaEmailGroups(signiaUsers);
  const summary = buildEmailSummary();
  const issues = { conflicts: [], skipped: [] };

  for (const user of signiaUsers || []) {
    const email = getSigniaEmail(user);
    if (!email) continue;

    analyzeSourceForUser({
      source: "eva",
      user,
      candidates: evaByEmail.get(email) || [],
      ownersById: ownerMaps.eva,
      signiaEmailGroups,
      matchMap,
      summary,
      issues,
      breakdown,
    });

    analyzeSourceForUser({
      source: "path",
      user,
      candidates: pathByEmail.get(email) || [],
      ownersById: ownerMaps.path,
      signiaEmailGroups,
      matchMap,
      summary,
      issues,
      breakdown,
    });
  }

  const matches = Array.from(matchMap.values()).map((match) => ({
    ...match,
    targets: Array.from(new Set(match.targets)),
  }));

  finalizeBreakdown(matches, breakdown);

  return {
    evaSet: summary.accepted.eva,
    pathSet: summary.accepted.path,
    bothSet: matches.filter((match) => match.emailActions?.eva && match.emailActions?.path).length,
    records: matches.length,
    totalSignia: signiaUsers.length,
    breakdown,
    matches,
    emailSummary: summary,
    issues,
  };
}

export async function loadEmailOpportunity({
  waitForEva = false,
  evaTimeoutMs = 30000,
  auditSearch = "",
  auditLimit = 25,
} = {}) {
  const signiaDB = await getSigniaPool();
  const pathDB = await getPathPool();
  const signiaUsers = await getSigniaUsers(signiaDB);
  const evaResult = await getEvaEmailMap({ waitForReady: waitForEva, timeoutMs: evaTimeoutMs });
  const pathByEmail = await getPathEmailMap(pathDB, signiaUsers);
  const opportunity = getBulkEmailOpportunity(signiaUsers, evaResult.map, pathByEmail);
  opportunity.diagnostic = buildEmailDiagnostic({
    signiaUsers,
    evaResult,
    pathByEmail,
    opportunity,
    auditSearch,
    auditLimit,
  });

  return { signiaDB, signiaUsers, evaResult, pathByEmail, opportunity };
}

function actionSourceKeys(match = {}) {
  const actions = match.emailActions || {};
  return [actions.eva ? "eva" : null, actions.path ? "path" : null].filter(Boolean);
}

async function applySourceAction(signiaDB, match, action) {
  const cfg = sourceConfig(action.source);
  const sourceField = cfg.field;
  const nextId = toId(action.nextId || action.candidate?.id);
  if (!nextId) return { applied: false, reason: "missing_next_id" };

  let ownersCleared = 0;
  for (const repair of action.repairs || []) {
    if (!repair?.signiaId || String(repair.signiaId) === String(match.signiaId)) continue;
    const [clearResult] = await signiaDB.query(
      `UPDATE user SET ${sourceField}=NULL WHERE id=? AND isActive=1 AND ${sourceField}=?`,
      [repair.signiaId, nextId],
    );
    ownersCleared += Number(clearResult?.affectedRows || 0);
  }

  const [updateResult] = await signiaDB.query(
    `UPDATE user SET ${sourceField}=? WHERE id=? AND isActive=1`,
    [nextId, match.signiaId],
  );

  return {
    applied: true,
    affectedRows: Number(updateResult?.affectedRows || 0),
    ownersCleared,
  };
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
  let ownerRepairs = 0;
  let overwritten = 0;
  let created = 0;
  const updatedIds = new Set();
  const applied = [];

  for (const match of opportunity.matches) {
    if (requestedSet && !requestedSet.has(String(match.signiaId))) continue;

    const sourceKeys = actionSourceKeys(match);
    if (!sourceKeys.length) continue;

    const appliedActions = [];
    for (const source of sourceKeys) {
      const action = match.emailActions[source];
      const result = await applySourceAction(signiaDB, match, action);
      if (!result.applied) continue;

      if (source === "eva") evaSet += 1;
      if (source === "path") pathSet += 1;
      if (action.type === "create") created += 1;
      if (action.type === "overwrite") overwritten += 1;
      ownerRepairs += result.ownersCleared || 0;
      appliedActions.push({ ...action, applyResult: result });
    }

    if (appliedActions.length) {
      if (appliedActions.some((action) => action.source === "eva") && appliedActions.some((action) => action.source === "path")) bothSet += 1;
      updatedIds.add(match.signiaId);
      applied.push({ ...match, appliedActions });
    }
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
    created,
    overwritten,
    ownerRepairs,
    skipped: opportunity.emailSummary?.skipped?.total || 0,
    conflicts: opportunity.emailSummary?.conflicts?.total || 0,
    diagnostic: opportunity.diagnostic,
  };
}
