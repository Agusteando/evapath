import Hashids from "hashids";
import { getPathPool, getSigniaPool, logAudit } from "./serverDb";

export const PATH_CATALOGOS = [1, 2];
export const PATH_DEFAULT_PUESTO_ID = 26;

const EMAIL_RE = /^([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)$/;

export function cleanText(value) {
  return String(value || "").trim();
}

export function normalizeEmail(value) {
  return cleanText(value)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function isValidEmail(value) {
  return EMAIL_RE.test(cleanText(value));
}

export function hasLinkValue(value) {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim();
  return Boolean(
    normalized &&
      normalized !== "0" &&
      normalized.toLowerCase() !== "null" &&
      normalized.toLowerCase() !== "undefined",
  );
}

export function parsePositiveInt(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function pathLabel(catalogoId) {
  return Number(catalogoId) === 2 ? "MMPI-2 RF" : "ECO";
}

export function pathPdfUrl(cid, pid, code, catalogoId) {
  const typeUri = Number(catalogoId) === 2 ? "MMPI" : "ECO";
  return `/api/path-pdf?cid=${cid}&pid=${pid}&code=${code}&type=${encodeURIComponent(typeUri)}`;
}

export function buildCandidateName(candidate) {
  return [candidate?.nombres, candidate?.apellidopaterno, candidate?.apellidomaterno]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function toMillis(value) {
  if (!value) return 0;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

export function sortPruebas(rows = []) {
  return [...rows].sort((a, b) => {
    const pubdateDelta = toMillis(b.pubdate) - toMillis(a.pubdate);
    if (pubdateDelta) return pubdateDelta;
    return Number(b.pid || b.id || 0) - Number(a.pid || a.id || 0);
  });
}

export function pickPrimaryPrueba(rows = []) {
  const sorted = sortPruebas(rows);
  return (
    sorted.find((row) => Number(row.completada) === 1 && hasLinkValue(row.code)) ||
    sorted.find((row) => hasLinkValue(row.code)) ||
    sorted[0] ||
    null
  );
}

export function buildInviteLink(candidatoId, code) {
  const numericCandidateId = Number(candidatoId);
  const numericCode = Number(code);
  if (!Number.isFinite(numericCandidateId) || !Number.isFinite(numericCode)) {
    throw new Error("No se puede generar el enlace PATH porque el candidato o el código no es numérico.");
  }

  const hashids = new Hashids();
  const hashid = hashids.encode(numericCandidateId, 26, numericCode);
  return {
    hashid,
    link: `https://reclutamiento.casitaapps.com/vacante/${hashid}`,
  };
}

async function postJson(url, payload, errorLabel) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${errorLabel}: HTTP ${response.status}${body ? ` - ${body.slice(0, 300)}` : ""}`);
  }

  return response;
}

export async function sendPathInviteEmail({ email, name, hashid, link }) {
  const emailBotPayload = {
    to: email,
    from: "desarrollohumano@casitaiedis.edu.mx",
    alias: "PATH",
    id: hashid,
    message: "",
    subject: "Invitación a Aplicación Prueba",
    template: "postulación.html",
    tipo: "1",
    nombres: name,
    link,
  };

  await postJson(
    "https://bot.casitaapps.com/sendEmailAs",
    { data: emailBotPayload },
    "No se pudo enviar el correo PATH",
  );
}

function pushUnique(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function getPathIdOwnerStatus(candidateId, ownersByPathId, usersByEmail) {
  const linkedOwners = ownersByPathId.get(String(candidateId)) || [];
  const emailOwners = usersByEmail || [];

  if (linkedOwners.length) {
    return {
      state: linkedOwners.length > 1 ? "duplicate-link" : "linked",
      label: linkedOwners.length > 1 ? "PATH duplicado en Signia" : "Vinculado",
      user: linkedOwners[0] || null,
      users: linkedOwners,
      canLinkByEmail: false,
    };
  }

  if (!emailOwners.length) {
    return {
      state: "unregistered",
      label: "Sin usuario Signia",
      user: null,
      users: [],
      canLinkByEmail: false,
    };
  }

  if (emailOwners.length > 1) {
    return {
      state: "multiple-users",
      label: "Varios usuarios con el mismo correo",
      user: emailOwners[0] || null,
      users: emailOwners,
      canLinkByEmail: false,
    };
  }

  const onlyUser = emailOwners[0];
  if (!hasLinkValue(onlyUser.pathId)) {
    return {
      state: "unlinked-by-email",
      label: "Usuario encontrado por correo",
      user: onlyUser,
      users: emailOwners,
      canLinkByEmail: true,
    };
  }

  return {
    state: String(onlyUser.pathId) === String(candidateId) ? "linked" : "conflict",
    label: String(onlyUser.pathId) === String(candidateId) ? "Vinculado" : `Conflicto: Signia apunta a PATH #${onlyUser.pathId}`,
    user: onlyUser,
    users: emailOwners,
    canLinkByEmail: false,
  };
}

function summarizeCatalog(candidate, rows, catalogoId) {
  const entries = sortPruebas(rows.filter((row) => Number(row.catalogo_id) === Number(catalogoId)));
  const primary = pickPrimaryPrueba(entries);
  const linked = Boolean(primary && Number(primary.completada) === 1 && hasLinkValue(primary.code));

  return {
    catalogoId,
    label: pathLabel(catalogoId),
    assigned: entries.length > 0,
    completed: entries.some((row) => Number(row.completada) === 1),
    linked,
    duplicateCount: Math.max(0, entries.length - 1),
    missingCode: entries.length > 0 && !entries.some((row) => hasLinkValue(row.code)),
    missingPuesto: entries.length > 0 && !entries.some((row) => hasLinkValue(row.puesto_id)),
    primary: primary
      ? {
          pruebaId: primary.pid || primary.id,
          code: primary.code || null,
          puestoId: primary.puesto_id || null,
          completada: Number(primary.completada || 0),
          pubdate: primary.pubdate || null,
          url: linked
            ? pathPdfUrl(candidate.id, primary.pid || primary.id, primary.code, catalogoId)
            : null,
        }
      : null,
  };
}

export function buildPathHealthRow(candidate, pruebas, context) {
  const email = cleanText(candidate.email);
  const emailKey = normalizeEmail(email);
  const nombre = buildCandidateName(candidate) || cleanText(candidate.nombre) || "Sin nombre";
  const pruebaRows = pruebas.get(Number(candidate.id)) || [];
  const sortedPruebas = sortPruebas(pruebaRows);
  const eco = summarizeCatalog(candidate, sortedPruebas, 1);
  const mmpi = summarizeCatalog(candidate, sortedPruebas, 2);
  const catalogos = [eco, mmpi];
  const linkedCatalogos = catalogos.filter((item) => item.linked);
  const canonicalPrueba = pickPrimaryPrueba(sortedPruebas);
  const canonicalCode = canonicalPrueba?.code || sortedPruebas.find((row) => hasLinkValue(row.code))?.code || null;
  const canonicalPuestoId =
    canonicalPrueba?.puesto_id || sortedPruebas.find((row) => hasLinkValue(row.puesto_id))?.puesto_id || null;
  const duplicateEmailGroup = emailKey ? context.candidatesByEmail.get(emailKey) || [] : [];
  const usersByEmail = emailKey ? context.signiaUsersByEmail.get(emailKey) || [] : [];
  const linkState = getPathIdOwnerStatus(candidate.id, context.signiaOwnersByPathId, usersByEmail);

  const problemCodes = [];
  if (!email) problemCodes.push("MISSING_EMAIL");
  if (email && !isValidEmail(email)) problemCodes.push("INVALID_EMAIL");
  if (!nombre || nombre === "Sin nombre") problemCodes.push("MISSING_NAME");
  if (duplicateEmailGroup.length > 1) problemCodes.push("DUPLICATE_CANDIDATE_EMAIL");
  if (linkState.state === "unregistered") problemCodes.push("NO_SIGNIA_USER");
  if (linkState.state === "unlinked-by-email") problemCodes.push("UNLINKED_SIGNIA_BY_EMAIL");
  if (["conflict", "duplicate-link", "multiple-users"].includes(linkState.state)) problemCodes.push("SIGNIA_LINK_CONFLICT");
  if (!eco.assigned) problemCodes.push("MISSING_ECO");
  if (!mmpi.assigned) problemCodes.push("MISSING_MMPI");
  if (eco.assigned && !eco.linked) problemCodes.push("ECO_PENDING_OR_BROKEN");
  if (mmpi.assigned && !mmpi.linked) problemCodes.push("MMPI_PENDING_OR_BROKEN");
  if (catalogos.some((item) => item.duplicateCount > 0)) problemCodes.push("DUPLICATE_PRUEBAS");
  if (catalogos.some((item) => item.missingCode)) problemCodes.push("MISSING_PRUEBA_CODE");
  if (catalogos.some((item) => item.missingPuesto)) problemCodes.push("MISSING_PUESTO_ID");

  const assignedCodes = catalogos
    .map((item) => item.primary?.code)
    .filter((value) => hasLinkValue(value))
    .map(String);
  if (new Set(assignedCodes).size > 1) problemCodes.push("PRUEBA_CODE_MISMATCH");

  const canRepairTests = Boolean(
    !eco.assigned ||
      !mmpi.assigned ||
      catalogos.some((item) => item.missingCode || item.missingPuesto || item.duplicateCount > 0)
  );
  const canRepairSignia = Boolean(linkState.canLinkByEmail || linkState.state === "conflict");
  const canRepairDuplicates = Boolean(duplicateEmailGroup.length > 1);
  const canSafeRepair = Boolean(canRepairTests || canRepairSignia || canRepairDuplicates);
  const needsPuestoForRepair = false;
  const canResend = Boolean(email && isValidEmail(email) && canonicalCode && Number.isFinite(Number(canonicalCode)) && nombre && nombre !== "Sin nombre");

  const pathLinks = linkedCatalogos.map((item) => ({
    label: item.label,
    url: item.primary.url,
  }));
  let inviteLink = null;
  if (canonicalCode && Number.isFinite(Number(canonicalCode))) {
    try {
      inviteLink = buildInviteLink(candidate.id, canonicalCode).link;
    } catch {
      inviteLink = null;
    }
  }

  return {
    id: candidate.id,
    email,
    emailKey,
    nombre,
    nombres: candidate.nombres || "",
    apellidopaterno: candidate.apellidopaterno || "",
    apellidomaterno: candidate.apellidomaterno || "",
    registered: linkState.state !== "unregistered",
    linkState,
    pruebaStatus: {
      eco,
      mmpi,
      total: sortedPruebas.length,
      completedReports: linkedCatalogos.length,
      canonicalCode: canonicalCode || null,
      canonicalPuestoId: canonicalPuestoId || null,
    },
    pathLinks,
    inviteLink,
    duplicateCandidateIds: duplicateEmailGroup.map((row) => row.id).filter((id) => Number(id) !== Number(candidate.id)),
    problemCodes: [...new Set(problemCodes)],
    canSafeRepair,
    needsPuestoForRepair,
    canResend,
    hasReports: linkedCatalogos.length > 0,
    hasCompletePruebas: eco.linked && mmpi.linked,
  };
}

export async function getPathHealthRows() {
  const pathDB = getPathPool();
  const signiaDB = getSigniaPool();

  const [candidates] = await pathDB.query(
    `SELECT id, email, nombres, apellidopaterno, apellidomaterno,
            CONCAT_WS(' ', nombres, apellidopaterno, apellidomaterno) AS nombre
       FROM candidatos
      ORDER BY id DESC`,
  );

  const candidateIds = candidates.map((candidate) => Number(candidate.id)).filter(Boolean);
  const pruebas = new Map();
  if (candidateIds.length) {
    const [pruebaRows] = await pathDB.query(
      `SELECT candidato_id, id AS pid, puesto_id, code, catalogo_id, completada, pubdate
         FROM pruebas
        WHERE candidato_id IN (${candidateIds.map(() => "?").join(",")})
        ORDER BY pubdate DESC, id DESC`,
      candidateIds,
    );

    for (const row of pruebaRows || []) {
      const id = Number(row.candidato_id);
      if (!pruebas.has(id)) pruebas.set(id, []);
      pruebas.get(id).push(row);
    }
  }

  const [signiaUsers] = await signiaDB.query(
    `SELECT id, email, name, pathId, isActive
       FROM user
      WHERE isActive = 1`,
  );

  const candidatesByEmail = new Map();
  for (const candidate of candidates || []) {
    pushUnique(candidatesByEmail, normalizeEmail(candidate.email), candidate);
  }

  const signiaUsersByEmail = new Map();
  const signiaOwnersByPathId = new Map();
  for (const user of signiaUsers || []) {
    pushUnique(signiaUsersByEmail, normalizeEmail(user.email), user);
    if (hasLinkValue(user.pathId)) pushUnique(signiaOwnersByPathId, String(user.pathId), user);
  }

  const context = { candidatesByEmail, signiaUsersByEmail, signiaOwnersByPathId };
  return candidates.map((candidate) => buildPathHealthRow(candidate, pruebas, context));
}

function filterHealthRows(rows, { q = "", status = "all" } = {}) {
  const term = cleanText(q).toLowerCase();
  let list = rows;

  if (term) {
    list = list.filter((row) => `${row.nombre} ${row.email} ${row.id}`.toLowerCase().includes(term));
  }

  if (status === "healthy") list = list.filter((row) => row.problemCodes.length === 0);
  if (status === "registered") list = list.filter((row) => row.registered);
  if (status === "unregistered") list = list.filter((row) => !row.registered);
  if (status === "linked") list = list.filter((row) => row.linkState.state === "linked");
  if (status === "ready") list = list.filter((row) => row.hasCompletePruebas);
  if (status === "incomplete") list = list.filter((row) => !row.hasCompletePruebas);
  if (status === "repairable") list = list.filter((row) => row.canSafeRepair || row.needsPuestoForRepair);
  if (status === "broken") list = list.filter((row) => row.problemCodes.length > 0);
  if (status === "duplicates") {
    list = list.filter(
      (row) => row.problemCodes.includes("DUPLICATE_CANDIDATE_EMAIL") || row.problemCodes.includes("DUPLICATE_PRUEBAS"),
    );
  }

  return list;
}

export function summarizePathHealth(rows) {
  return {
    total: rows.length,
    registered: rows.filter((row) => row.registered).length,
    unregistered: rows.filter((row) => !row.registered).length,
    linked: rows.filter((row) => row.linkState.state === "linked").length,
    complete: rows.filter((row) => row.hasCompletePruebas).length,
    incomplete: rows.filter((row) => !row.hasCompletePruebas).length,
    repairable: rows.filter((row) => row.canSafeRepair).length,
    needsPuesto: rows.filter((row) => row.needsPuestoForRepair).length,
    duplicates: rows.filter(
      (row) => row.problemCodes.includes("DUPLICATE_CANDIDATE_EMAIL") || row.problemCodes.includes("DUPLICATE_PRUEBAS"),
    ).length,
    broken: rows.filter((row) => row.problemCodes.length > 0).length,
  };
}

export async function getPathHealthPage({ q = "", status = "healthy", page = 1, pageSize = 20 } = {}) {
  const allRows = await getPathHealthRows();
  const filtered = filterHealthRows(allRows, { q, status });
  const numericPageSize = Math.max(5, Math.min(parsePositiveInt(pageSize) || 20, 100));
  const lastPage = Math.max(1, Math.ceil(filtered.length / numericPageSize));
  const currentPage = Math.max(1, Math.min(parsePositiveInt(page) || 1, lastPage));
  const start = (currentPage - 1) * numericPageSize;

  return {
    users: filtered.slice(start, start + numericPageSize),
    page: currentPage,
    pageSize: numericPageSize,
    total: filtered.length,
    lastPage,
    stats: summarizePathHealth(allRows),
    filters: { q, status },
  };
}

async function fetchCandidateForRepair(connection, candidatoId) {
  const [candidateRows] = await connection.query(
    `SELECT id, email, nombres, apellidopaterno, apellidomaterno,
            CONCAT_WS(' ', nombres, apellidopaterno, apellidomaterno) AS nombre
       FROM candidatos
      WHERE id = ?
      LIMIT 1`,
    [candidatoId],
  );

  return candidateRows?.[0] || null;
}

async function fetchCandidatesByEmail(connection, emailKey) {
  if (!emailKey) return [];
  const [rows] = await connection.query(
    `SELECT id, email, nombres, apellidopaterno, apellidomaterno,
            CONCAT_WS(' ', nombres, apellidopaterno, apellidomaterno) AS nombre
       FROM candidatos
      WHERE LOWER(TRIM(email)) = ?
      ORDER BY id DESC`,
    [emailKey],
  );
  return rows || [];
}

async function fetchPruebasForCandidate(connection, candidatoId) {
  const [rows] = await connection.query(
    `SELECT candidato_id, id AS pid, puesto_id, code, catalogo_id, completada, pubdate
       FROM pruebas
      WHERE candidato_id = ?
      ORDER BY pubdate DESC, id DESC`,
    [candidatoId],
  );
  return rows || [];
}

async function fetchPruebasForCandidates(connection, candidatoIds) {
  const ids = [...new Set((candidatoIds || []).map((value) => parsePositiveInt(value)).filter(Boolean))];
  const map = new Map();
  ids.forEach((id) => map.set(id, []));
  if (!ids.length) return map;

  const [rows] = await connection.query(
    `SELECT candidato_id, id AS pid, puesto_id, code, catalogo_id, completada, pubdate
       FROM pruebas
      WHERE candidato_id IN (${ids.map(() => "?").join(",")})
      ORDER BY pubdate DESC, id DESC`,
    ids,
  );

  for (const row of rows || []) {
    const id = Number(row.candidato_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

async function fetchActiveSigniaUsersByEmail(signiaDB, emailKey) {
  if (!emailKey) return [];
  const [users] = await signiaDB.query(
    `SELECT id, email, name, pathId
       FROM user
      WHERE isActive = 1 AND LOWER(TRIM(email)) = ?
      ORDER BY id DESC`,
    [emailKey],
  );
  return users || [];
}

function hasCompletedReport(row) {
  return Boolean(row && Number(row.completada) === 1 && hasLinkValue(row.code));
}

function hasAnyPruebaEvidence(row) {
  return Boolean(row && (hasLinkValue(row.code) || hasLinkValue(row.puesto_id) || hasCompletedReport(row)));
}

function catalogCompleteness(pruebas = []) {
  const catalogos = new Map();
  for (const catalogoId of PATH_CATALOGOS) {
    const rows = pruebas.filter((row) => Number(row.catalogo_id) === Number(catalogoId));
    catalogos.set(catalogoId, {
      rows,
      primary: pickPrimaryPrueba(rows),
      completed: rows.filter(hasCompletedReport).length,
      coded: rows.filter((row) => hasLinkValue(row.code)).length,
      withPuesto: rows.filter((row) => hasLinkValue(row.puesto_id)).length,
    });
  }
  return catalogos;
}

function candidateRepairScore(candidate, pruebas = [], signiaUsers = []) {
  const catalogos = catalogCompleteness(pruebas);
  const completedCatalogs = PATH_CATALOGOS.filter((catalogoId) => catalogos.get(catalogoId).completed > 0).length;
  const assignedCatalogs = PATH_CATALOGOS.filter((catalogoId) => catalogos.get(catalogoId).rows.length > 0).length;
  const codedCatalogs = PATH_CATALOGOS.filter((catalogoId) => catalogos.get(catalogoId).coded > 0).length;
  const puestoCatalogs = PATH_CATALOGOS.filter((catalogoId) => catalogos.get(catalogoId).withPuesto > 0).length;
  const linkedBySignia = signiaUsers.some((user) => String(user.pathId || "") === String(candidate.id));

  return {
    completedCatalogs,
    assignedCatalogs,
    codedCatalogs,
    puestoCatalogs,
    linkedBySignia,
    totalPruebas: pruebas.length,
    value:
      completedCatalogs * 1000 +
      assignedCatalogs * 160 +
      codedCatalogs * 80 +
      puestoCatalogs * 60 +
      (linkedBySignia ? 40 : 0) +
      Math.min(pruebas.length, 20),
  };
}

function pickCanonicalCandidate(candidates, pruebasByCandidate, signiaUsers) {
  const group = [...(candidates || [])].filter(Boolean);
  if (!group.length) return null;

  const scored = group.map((candidate) => ({
    candidate,
    pruebas: pruebasByCandidate.get(Number(candidate.id)) || [],
    score: candidateRepairScore(candidate, pruebasByCandidate.get(Number(candidate.id)) || [], signiaUsers),
  }));

  scored.sort((a, b) => {
    const completedDelta = b.score.completedCatalogs - a.score.completedCatalogs;
    if (completedDelta) return completedDelta;
    const assignedDelta = b.score.assignedCatalogs - a.score.assignedCatalogs;
    if (assignedDelta) return assignedDelta;
    const codedDelta = b.score.codedCatalogs - a.score.codedCatalogs;
    if (codedDelta) return codedDelta;
    const valueDelta = b.score.value - a.score.value;
    if (valueDelta) return valueDelta;
    return Number(b.candidate.id) - Number(a.candidate.id);
  });

  const strongest = scored[0];
  const signiaLinked = scored.filter((item) => item.score.linkedBySignia);
  if (!signiaLinked.length) return strongest.candidate;

  signiaLinked.sort((a, b) => b.score.value - a.score.value || Number(b.candidate.id) - Number(a.candidate.id));
  const currentLinked = signiaLinked[0];

  if (strongest.score.completedCatalogs > currentLinked.score.completedCatalogs) return strongest.candidate;
  if (currentLinked.score.completedCatalogs > 0 && strongest.score.completedCatalogs === currentLinked.score.completedCatalogs) {
    return currentLinked.candidate;
  }
  if (strongest.score.assignedCatalogs > currentLinked.score.assignedCatalogs) return strongest.candidate;
  return currentLinked.candidate;
}

function inferCanonicalCode(pruebas = []) {
  const completed = sortPruebas(pruebas).find(hasCompletedReport);
  if (completed?.code && Number.isFinite(Number(completed.code))) return completed.code;

  const coded = sortPruebas(pruebas).find((row) => hasLinkValue(row.code) && Number.isFinite(Number(row.code)));
  if (coded?.code) return coded.code;

  return Date.now();
}

function inferCanonicalPuestoId({ explicitPuestoId, canonicalPruebas = [], groupPruebas = [] }) {
  if (explicitPuestoId) return explicitPuestoId;

  const fromCanonical = sortPruebas(canonicalPruebas).find((row) => hasLinkValue(row.puesto_id) && parsePositiveInt(row.puesto_id));
  if (fromCanonical) return parsePositiveInt(fromCanonical.puesto_id);

  const fromGroup = sortPruebas(groupPruebas).find((row) => hasLinkValue(row.puesto_id) && parsePositiveInt(row.puesto_id));
  if (fromGroup) return parsePositiveInt(fromGroup.puesto_id);

  return PATH_DEFAULT_PUESTO_ID;
}

async function deleteEmptyDuplicateCandidate(connection, duplicateId, actions) {
  const [result] = await connection.query(
    `DELETE FROM candidatos
      WHERE id = ?
        AND NOT EXISTS (SELECT 1 FROM pruebas WHERE candidato_id = ?)`,
    [duplicateId, duplicateId],
  );
  if (result.affectedRows > 0) actions.push(`Candidato duplicado PATH #${duplicateId} eliminado porque no tenía pruebas.`);
}

async function consolidateDuplicateCandidates({ connection, canonicalId, candidates, pruebasByCandidate, actions, unresolved }) {
  for (const duplicate of candidates) {
    const duplicateId = Number(duplicate.id);
    if (duplicateId === Number(canonicalId)) continue;

    const duplicatePruebas = pruebasByCandidate.get(duplicateId) || [];
    if (!duplicatePruebas.length) {
      await deleteEmptyDuplicateCandidate(connection, duplicateId, actions);
      continue;
    }

    const completedRows = duplicatePruebas.filter(hasCompletedReport);
    const movableRows = duplicatePruebas.filter((row) => !hasCompletedReport(row));

    if (movableRows.length) {
      await connection.query(
        `UPDATE pruebas
            SET candidato_id = ?
          WHERE candidato_id = ?
            AND (completada IS NULL OR completada <> 1 OR code IS NULL OR code = '')`,
        [canonicalId, duplicateId],
      );
      actions.push(`${movableRows.length} prueba(s) incompletas movidas de PATH #${duplicateId} a PATH #${canonicalId}.`);
    }

    if (completedRows.length) {
      unresolved.push(
        `PATH #${duplicateId} conserva ${completedRows.length} dictamen(es) ya generados; no se movieron para no romper PDFs históricos.`,
      );
      continue;
    }

    await deleteEmptyDuplicateCandidate(connection, duplicateId, actions);
  }
}

async function repairPruebasForCanonical({ connection, canonicalId, canonicalPuestoId, canonicalCode, actions, unresolved }) {
  const pruebas = await fetchPruebasForCandidate(connection, canonicalId);
  const canonicalCodeValue = Number.isFinite(Number(canonicalCode)) ? canonicalCode : Date.now();

  for (const catalogoId of PATH_CATALOGOS) {
    const catalogRows = sortPruebas(pruebas.filter((row) => Number(row.catalogo_id) === Number(catalogoId)));
    const primary = pickPrimaryPrueba(catalogRows);

    if (!primary) {
      await connection.query(
        `INSERT INTO pruebas (candidato_id, puesto_id, code, catalogo_id)
         VALUES (?, ?, ?, ?)`,
        [canonicalId, canonicalPuestoId, canonicalCodeValue, catalogoId],
      );
      actions.push(`Prueba ${pathLabel(catalogoId)} creada para PATH #${canonicalId} con puesto ${canonicalPuestoId}.`);
      continue;
    }

    const updateFields = [];
    const updateValues = [];
    if (!hasLinkValue(primary.code)) {
      updateFields.push("code = ?");
      updateValues.push(canonicalCodeValue);
    }
    if (!hasLinkValue(primary.puesto_id)) {
      updateFields.push("puesto_id = ?");
      updateValues.push(canonicalPuestoId);
    }

    if (updateFields.length) {
      updateValues.push(primary.pid || primary.id);
      await connection.query(`UPDATE pruebas SET ${updateFields.join(", ")} WHERE id = ?`, updateValues);
      actions.push(`Prueba ${pathLabel(catalogoId)} reparada sin cambiar completada.`);
    }

    const duplicateRows = catalogRows.filter((row) => Number(row.pid || row.id) !== Number(primary.pid || primary.id));
    const safeDeleteIds = duplicateRows
      .filter((row) => !hasCompletedReport(row))
      .map((row) => Number(row.pid || row.id))
      .filter(Boolean);

    if (safeDeleteIds.length) {
      await connection.query(
        `DELETE FROM pruebas WHERE id IN (${safeDeleteIds.map(() => "?").join(",")})`,
        safeDeleteIds,
      );
      actions.push(`${safeDeleteIds.length} prueba(s) duplicadas ${pathLabel(catalogoId)} incompletas eliminadas.`);
    }

    const protectedCompleted = duplicateRows.filter(hasCompletedReport);
    if (protectedCompleted.length) {
      unresolved.push(
        `${protectedCompleted.length} prueba(s) ${pathLabel(catalogoId)} completadas duplicadas se conservaron para no romper PDFs históricos.`,
      );
    }
  }
}

async function repairSigniaLink({ signiaDB, emailKey, canonicalId, groupCandidateIds, actions, unresolved }) {
  const users = await fetchActiveSigniaUsersByEmail(signiaDB, emailKey);
  if (!users.length) {
    unresolved.push("No existe usuario activo en Signia con el mismo correo; no se creó un usuario nuevo automáticamente.");
    return users;
  }

  if (users.length > 1) {
    const linkedInsideGroup = users.filter((user) => groupCandidateIds.includes(Number(user.pathId)));
    if (linkedInsideGroup.length === 1 && users.every((user) => !hasLinkValue(user.pathId) || Number(user.pathId) === Number(linkedInsideGroup[0].pathId))) {
      // This is still deterministic: all duplicates point to the same PATH id or are blank.
    } else {
      unresolved.push("Hay varios usuarios activos en Signia con el mismo correo; no se reescribió el vínculo automáticamente.");
      return users;
    }
  }

  for (const signiaUser of users) {
    if (!hasLinkValue(signiaUser.pathId)) {
      await signiaDB.query(
        `UPDATE user
            SET pathId = ?
          WHERE id = ? AND isActive = 1 AND (pathId IS NULL OR pathId = 0 OR pathId = '')`,
        [canonicalId, signiaUser.id],
      );
      actions.push(`Usuario Signia #${signiaUser.id} vinculado a PATH #${canonicalId}.`);
      continue;
    }

    if (Number(signiaUser.pathId) === Number(canonicalId)) {
      actions.push(`Usuario Signia #${signiaUser.id} ya apuntaba al PATH canónico #${canonicalId}.`);
      continue;
    }

    if (groupCandidateIds.includes(Number(signiaUser.pathId))) {
      await signiaDB.query(
        `UPDATE user
            SET pathId = ?
          WHERE id = ? AND isActive = 1 AND pathId = ?`,
        [canonicalId, signiaUser.id, signiaUser.pathId],
      );
      actions.push(`Usuario Signia #${signiaUser.id} redirigido de PATH #${signiaUser.pathId} a PATH canónico #${canonicalId}.`);
      continue;
    }

    unresolved.push(`El usuario Signia #${signiaUser.id} apunta a PATH #${signiaUser.pathId}, fuera del grupo duplicado; no se sobrescribió.`);
  }

  return users;
}

export async function repairPathCandidate({ candidatoId, puestoId, user } = {}) {
  const id = parsePositiveInt(candidatoId);
  if (!id) throw new Error("Candidato PATH inválido.");

  const explicitPuestoId = parsePositiveInt(puestoId);
  const pathDB = getPathPool();
  const signiaDB = getSigniaPool();
  const actions = [];
  const unresolved = [];
  let candidate = null;
  let canonical = null;
  let groupCandidates = [];
  let groupCandidateIds = [];
  let canonicalPuestoId = null;
  let canonicalCode = null;

  const connection = await pathDB.getConnection();
  try {
    await connection.beginTransaction();
    candidate = await fetchCandidateForRepair(connection, id);
    if (!candidate) throw new Error(`No se encontró el candidato PATH #${id}.`);

    const emailKey = normalizeEmail(candidate.email);
    groupCandidates = emailKey && isValidEmail(candidate.email)
      ? await fetchCandidatesByEmail(connection, emailKey)
      : [candidate];
    if (!groupCandidates.some((row) => Number(row.id) === id)) groupCandidates.push(candidate);
    groupCandidateIds = [...new Set(groupCandidates.map((row) => Number(row.id)).filter(Boolean))];

    const pruebasByCandidate = await fetchPruebasForCandidates(connection, groupCandidateIds);
    const signiaUsers = emailKey && isValidEmail(candidate.email) ? await fetchActiveSigniaUsersByEmail(signiaDB, emailKey) : [];
    canonical = pickCanonicalCandidate(groupCandidates, pruebasByCandidate, signiaUsers) || candidate;
    const canonicalId = Number(canonical.id);

    const canonicalPruebas = pruebasByCandidate.get(canonicalId) || [];
    const allGroupPruebas = groupCandidateIds.flatMap((candidateId) => pruebasByCandidate.get(candidateId) || []);
    canonicalCode = inferCanonicalCode(canonicalPruebas.length ? canonicalPruebas : allGroupPruebas);
    canonicalPuestoId = inferCanonicalPuestoId({
      explicitPuestoId,
      canonicalPruebas,
      groupPruebas: allGroupPruebas,
    });

    if (canonicalPuestoId === PATH_DEFAULT_PUESTO_ID && !explicitPuestoId && !allGroupPruebas.some((row) => hasLinkValue(row.puesto_id))) {
      actions.push(`Sin puesto histórico; se aplicó el puesto PATH default #${PATH_DEFAULT_PUESTO_ID}.`);
    }

    if (groupCandidateIds.length > 1) {
      actions.push(`Grupo duplicado por correo revisado: ${groupCandidateIds.map((candidateId) => `PATH #${candidateId}`).join(", ")}.`);
      actions.push(`PATH #${canonicalId} seleccionado como registro canónico.`);
      await consolidateDuplicateCandidates({ connection, canonicalId, candidates: groupCandidates, pruebasByCandidate, actions, unresolved });
    }

    await repairPruebasForCanonical({ connection, canonicalId, canonicalPuestoId, canonicalCode, actions, unresolved });

    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }

  const emailKey = normalizeEmail(candidate?.email);
  if (emailKey && isValidEmail(candidate.email)) {
    await repairSigniaLink({
      signiaDB,
      emailKey,
      canonicalId: Number(canonical?.id || id),
      groupCandidateIds,
      actions,
      unresolved,
    });
  } else {
    unresolved.push("El candidato no tiene un correo válido para reparar vínculo Signia.");
  }

  await logAudit(user, "PATH_REPAIR_CANDIDATE", { id, name: buildCandidateName(candidate), email: candidate?.email }, "PATH", "SUCCESS", {
    actions,
    unresolved,
    canonicalId: canonical?.id || id,
    puestoId: explicitPuestoId || canonicalPuestoId || null,
    code: canonicalCode || null,
  });

  return { candidatoId: id, canonicalId: canonical?.id || id, actions, unresolved };
}

export async function repairPathBulk({ limit = 250, user } = {}) {
  const rows = await getPathHealthRows();
  const targets = rows
    .filter((row) => row.problemCodes.length > 0 || row.canSafeRepair)
    .slice(0, Math.max(1, Math.min(parsePositiveInt(limit) || 250, 500)));

  const seen = new Set();
  const repaired = [];
  const failed = [];

  for (const row of targets) {
    const key = row.emailKey || `id:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const result = await repairPathCandidate({ candidatoId: row.id, user });
      repaired.push(result);
    } catch (error) {
      failed.push({ candidatoId: row.id, error: error.message });
    }
  }

  await logAudit(user, "PATH_SMART_REPAIR", { id: "bulk", name: "PATH", email: null }, "PATH", failed.length ? "PARTIAL" : "SUCCESS", {
    attempted: seen.size,
    repaired: repaired.length,
    failed: failed.length,
  });

  return { attempted: seen.size, repaired, failed };
}

export async function resendPathInvite({ candidatoId, user } = {}) {
  const id = parsePositiveInt(candidatoId);
  if (!id) throw new Error("Candidato PATH inválido.");

  const pathDB = getPathPool();
  const [rows] = await pathDB.query(
    `SELECT c.id, c.email, c.nombres, c.apellidopaterno, c.apellidomaterno,
            CONCAT_WS(' ', c.nombres, c.apellidopaterno, c.apellidomaterno) AS nombre,
            p.id AS pruebaId, p.puesto_id, p.code, p.catalogo_id, p.pubdate
       FROM candidatos c
       LEFT JOIN pruebas p ON p.candidato_id = c.id AND p.code IS NOT NULL AND p.code <> ''
      WHERE c.id = ?
      ORDER BY p.pubdate DESC, p.id DESC
      LIMIT 1`,
    [id],
  );

  const row = rows?.[0];
  if (!row) throw new Error(`No se encontró el candidato PATH #${id}.`);

  const email = cleanText(row.email);
  const name = buildCandidateName(row) || cleanText(row.nombre);
  if (!isValidEmail(email)) throw new Error("El candidato no tiene un correo válido para reenviar la invitación.");
  if (!name) throw new Error("El candidato no tiene nombre para reenviar la invitación.");
  if (!hasLinkValue(row.code)) throw new Error("No hay un código de prueba disponible. Repara/asigna pruebas antes de reenviar el enlace.");

  const { hashid, link } = buildInviteLink(id, row.code);
  await sendPathInviteEmail({ email, name, hashid, link });

  await logAudit(user, "PATH_RESEND_LINK", { id, name, email }, "PATH", "SUCCESS", {
    hashid,
    link,
    puestoId: row.puesto_id || null,
    pruebaId: row.pruebaId || null,
  });

  return { candidatoId: id, email, name, hashid, link };
}
