import { NextResponse } from "next/server";
import { getEva, waitEva, logAudit } from "../../shared.js";

const PUBLIC_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

const PUBLIC_AUDIT_USER = {
  email: "public-api@evapath.local",
  name: "Public API",
  image: "",
};

export const EVA_PUBLIC_WAIT_TIMEOUT_MS = 240000;

function toText(value) {
  return value === undefined || value === null ? "" : String(value);
}

function toPositiveInt(value, fallback, { min = 1, max = 1000 } = {}) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

function normalize(value) {
  return toText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseEvaDate(value) {
  const raw = toText(value).trim();
  if (!raw) return 0;
  const timestamp = Date.parse(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function addMonths(date, amount) {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + amount);
  return next;
}

function candidateName(candidate = {}) {
  return candidate.nombre || candidate.N || candidate.name || "";
}

function candidateEmail(candidate = {}) {
  return candidate.correo || candidate.M || candidate.email || candidate.Email || "";
}

function candidateStatus(candidate = {}) {
  return candidate.estado || candidate.D || candidate.status || "";
}

function candidateDate(candidate = {}) {
  return candidate.fechaProceso || candidate.PD || candidate.processDate || null;
}

function candidateJobName(candidate = {}) {
  return candidate.puesto || candidate.JN || candidate.jobName || "";
}

function candidateJobId(candidate = {}) {
  return candidate.JID || candidate.jobId || candidate.vacantId || null;
}

function candidateId(candidate = {}) {
  return candidate.CID || candidate.id || candidate.candidateId || null;
}

function publicUrl(req, pathname) {
  const url = new URL(req.url);
  return `${url.origin}${pathname}`;
}

export function corsHeaders(extra = {}) {
  return { ...PUBLIC_HEADERS, ...extra };
}

export function optionsResponse() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export function jsonResponse(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: corsHeaders() });
}

export function errorResponse(status, code, message, details = {}) {
  return jsonResponse({ ok: false, code, message, ...details }, status);
}

export function serializeEvaCandidate(candidate, req = null) {
  const id = candidateId(candidate);
  const jobId = candidateJobId(candidate);
  const name = candidateName(candidate);
  const email = candidateEmail(candidate);
  const status = candidateStatus(candidate);
  const fechaProceso = candidateDate(candidate);
  const jobName = candidateJobName(candidate);
  const key = `${name || "Sin nombre"} *${jobName || "Sin puesto"}*`;
  const endpointPath = `/api/public/eva/candidates/${encodeURIComponent(id)}/dictamen`;

  return {
    CID: id,
    JID: jobId,
    N: name,
    M: email,
    D: status,
    PD: fechaProceso,
    JN: jobName,
    puesto: jobName,
    nombre: name,
    correo: email,
    estado: status,
    fechaProceso,
    key,
    dictamenEndpoint: req ? publicUrl(req, endpointPath) : endpointPath,
  };
}

export function collectEvaCandidates(eva) {
  const seen = new Map();
  const sources = [
    ...(Array.isArray(eva?.results) ? eva.results : []),
    ...Object.values(eva?.cache || {}),
  ];

  for (const candidate of sources) {
    const id = candidateId(candidate);
    if (!id) continue;
    const key = `${id}:${candidateJobId(candidate) || ""}`;
    if (!seen.has(key)) seen.set(key, candidate);
  }

  return Array.from(seen.values());
}

export function findEvaCandidateByCid(eva, cid) {
  const target = toText(cid).trim();
  if (!target) return null;
  return collectEvaCandidates(eva).find((candidate) => toText(candidateId(candidate)) === target) || null;
}

export async function getPublicEvaStatus(req, { waitForReady = false } = {}) {
  const eva = getEva();
  let waitError = null;

  if (waitForReady && !eva.ready) {
    try {
      await waitEva(EVA_PUBLIC_WAIT_TIMEOUT_MS);
    } catch (error) {
      waitError = error;
    }
  }

  const freshEva = getEva();
  const status = typeof freshEva.getStatus === "function"
    ? freshEva.getStatus()
    : { ready: !!freshEva.ready, status: freshEva.status || "init", users: freshEva.results?.length || 0 };

  return {
    status: 200,
    payload: {
      ok: true,
      ready: !!status.ready,
      status: status.status || "init",
      users: status.users || 0,
      lastUpdatedAt: status.lastUpdatedAt || null,
      lastUpdatedCount: status.lastUpdatedCount || 0,
      cacheWindowMonths: status.cacheWindowMonths || freshEva.antiguedad || 3,
      waitError: waitError?.message || null,
      endpoints: req ? {
        search: publicUrl(req, "/api/public/eva/search"),
      } : undefined,
    },
  };
}

export async function searchEvaCandidates(req) {
  const { searchParams } = new URL(req.url);
  const wait = searchParams.get("wait") === "1" || searchParams.get("wait") === "true";
  const eva = getEva();

  if (wait && !eva.ready) {
    try {
      await waitEva(EVA_PUBLIC_WAIT_TIMEOUT_MS);
    } catch (error) {
      return errorResponse(503, "EVA_NOT_READY", "El servicio EVA todavía no está listo.", {
        ready: false,
        status: getEva().status || "init",
        details: error?.message || String(error),
      });
    }
  }

  const freshEva = getEva();
  if (!freshEva.ready) {
    return jsonResponse({
      ok: true,
      ready: false,
      status: freshEva.status || "init",
      items: [],
      total: 0,
      code: "EVA_NOT_READY",
      message: "El servicio EVA todavía no está listo.",
    }, 202);
  }

  const q = normalize(searchParams.get("q") || "");
  const queryTokens = q.split(/\s+/).filter(Boolean);
  const mode = normalize(searchParams.get("mode") || "search");
  const statusFilter = normalize(searchParams.get("status") || "");
  const evaluatedOnly = ["1", "true", "yes", "si", "sí"].includes(normalize(searchParams.get("evaluated") || ""));
  const all = ["1", "true", "yes", "si", "sí"].includes(normalize(searchParams.get("all") || ""));
  const months = toPositiveInt(searchParams.get("months"), freshEva.antiguedad || 3, { min: 1, max: 60 });
  const defaultLimit = mode === "recent" ? 15 : 30;
  const limit = toPositiveInt(searchParams.get("limit"), defaultLimit, { min: 1, max: 200 });
  const cutoff = addMonths(new Date(), -months).getTime();

  let candidates = collectEvaCandidates(freshEva);

  if (!all) {
    candidates = candidates.filter((candidate) => {
      const timestamp = parseEvaDate(candidateDate(candidate));
      return timestamp && timestamp >= cutoff;
    });
  }

  if (mode === "recent" || evaluatedOnly) {
    candidates = candidates.filter((candidate) => normalize(candidateStatus(candidate)) === "evaluado");
  } else if (statusFilter) {
    candidates = candidates.filter((candidate) => normalize(candidateStatus(candidate)) === statusFilter);
  }

  if (queryTokens.length) {
    candidates = candidates.filter((candidate) => {
      const searchable = normalize([
        candidateName(candidate),
        candidateEmail(candidate),
        candidateStatus(candidate),
        candidateJobName(candidate),
        candidateId(candidate),
        candidateJobId(candidate),
      ].join(" "));
      return queryTokens.every((token) => searchable.includes(token));
    });
  }

  if (mode === "recent") {
    candidates.sort((a, b) => parseEvaDate(candidateDate(b)) - parseEvaDate(candidateDate(a)));
  } else {
    candidates.sort((a, b) => {
      const byDate = parseEvaDate(candidateDate(b)) - parseEvaDate(candidateDate(a));
      if (byDate) return byDate;
      return normalize(candidateName(a)).localeCompare(normalize(candidateName(b)));
    });
  }

  const total = candidates.length;
  const items = candidates.slice(0, limit).map((candidate) => serializeEvaCandidate(candidate, req));
  const status = typeof freshEva.getStatus === "function" ? freshEva.getStatus() : {};

  return jsonResponse({
    ok: true,
    ready: true,
    status: freshEva.status || "ready",
    query: searchParams.get("q") || "",
    mode,
    months: all ? null : months,
    all,
    total,
    count: items.length,
    items,
    lastUpdatedAt: status.lastUpdatedAt || null,
    lastUpdatedCount: status.lastUpdatedCount || 0,
  });
}

export async function getEvaCandidateAvailability(cid, req, { waitForReady = false } = {}) {
  const eva = getEva();
  let waitError = null;

  if (waitForReady && !eva.ready) {
    try {
      await waitEva(EVA_PUBLIC_WAIT_TIMEOUT_MS);
    } catch (error) {
      waitError = error;
    }
  }

  const freshEva = getEva();
  if (!freshEva.ready) {
    return {
      status: 200,
      payload: {
        ok: true,
        available: false,
        ready: false,
        code: "EVA_NOT_READY",
        message: "El servicio EVA todavía no está listo.",
        eva: { status: freshEva.status || "init", waitError: waitError?.message || null },
      },
    };
  }

  const candidate = findEvaCandidateByCid(freshEva, cid);
  if (!candidate) {
    return {
      status: 404,
      payload: {
        ok: false,
        available: false,
        ready: true,
        code: "EVA_CANDIDATE_NOT_FOUND",
        message: "No se encontró ese candidato en el cache actual de EVA.",
        cid: toText(cid),
      },
    };
  }

  const serialized = serializeEvaCandidate(candidate, req);
  const canDownload = normalize(serialized.estado) === "evaluado";

  return {
    status: 200,
    payload: {
      ok: true,
      available: canDownload,
      ready: true,
      code: canDownload ? "EVA_DICTAMEN_AVAILABLE" : "EVA_DICTAMEN_NOT_READY",
      message: canDownload
        ? "El dictamen EVA puede descargarse."
        : "El candidato existe en EVA, pero todavía no aparece como Evaluado.",
      candidate: serialized,
    },
  };
}

function safeFilename(value) {
  const cleaned = toText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return cleaned || "dictamen_eva";
}

export async function streamPublicEvaCandidateDictamen(cid, req) {
  const availability = await getEvaCandidateAvailability(cid, req, { waitForReady: true });
  if (!availability.payload?.available) {
    return jsonResponse(availability.payload, availability.status === 200 ? 409 : availability.status);
  }

  const candidate = availability.payload.candidate;
  const eva = getEva();

  try {
    const pdf = await eva.downloadPDF(candidate.CID);
    await logAudit(
      PUBLIC_AUDIT_USER,
      "PUBLIC_API_DOWNLOAD_EVA_PDF_BY_CID",
      {
        id: candidate.CID,
        name: candidate.nombre || "EVA",
        email: candidate.correo || "",
        sourceSystem: "EVA",
      },
      "EVA",
      "SUCCESS",
      { cid: candidate.CID, jid: candidate.JID, size: pdf.length },
    );

    return new NextResponse(pdf, {
      status: 200,
      headers: corsHeaders({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="EVA_${safeFilename(candidate.nombre)}_${candidate.CID}.pdf"`,
      }),
    });
  } catch (error) {
    await logAudit(
      PUBLIC_AUDIT_USER,
      "PUBLIC_API_DOWNLOAD_EVA_PDF_BY_CID",
      {
        id: candidate.CID,
        name: candidate.nombre || "EVA",
        email: candidate.correo || "",
        sourceSystem: "EVA",
      },
      "EVA",
      "ERROR",
      { cid: candidate.CID, jid: candidate.JID, error: error?.message || String(error) },
    );

    return errorResponse(502, "EVA_DOWNLOAD_FAILED", "No se pudo obtener el dictamen EVA.", {
      cid: candidate.CID,
      details: error?.message || String(error),
    });
  }
}
const PUBLIC_EVA_ENTERPRISE_NAME = "IECS-IEDIS";
const PUBLIC_EVA_EVALUATION_TYPE_ID = "2";
const PUBLIC_EVA_VACANT_NAME = "Forma parte de nuestra gran familia";
const EMAIL_RE = /^([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)$/;
const EVA_PUBLIC_ENTITY_FALLBACK_IDS = [11031, 7176, 7382, 7380, 7381, 26856];

async function readJsonBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = normalize(value);
  if (["1", "true", "yes", "si", "sí", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function parsePuestoId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function ensureEvaReady({ waitForReady = true } = {}) {
  const eva = getEva();
  if (eva.ready) return getEva();

  if (waitForReady) {
    await waitEva(EVA_PUBLIC_WAIT_TIMEOUT_MS);
    const freshEva = getEva();
    if (freshEva.ready) return freshEva;
  }

  const freshEva = getEva();
  throw new Error(`EVA no está listo (${freshEva.status || "init"}).`);
}

async function discoverEvaEntities(eva) {
  let entityIds = [];

  try {
    const dashboard = await eva.get("EnterpriseDashBoard/Dashboard", true);
    if (dashboard && Array.isArray(dashboard.E)) {
      entityIds = dashboard.E.map((entity) => entity?.EI).filter(Boolean);
    }
  } catch (error) {
    console.warn("[Public EVA API] No se pudo obtener dashboard de EVA:", error?.message || error);
  }

  if (!entityIds.length) entityIds = EVA_PUBLIC_ENTITY_FALLBACK_IDS;
  const uniqueIds = Array.from(new Set(entityIds));
  const entities = [];

  for (const id of uniqueIds) {
    try {
      const entity = await eva.get(`EnterpriseDashBoard/Entity/Detail/${id}/false`, true);
      if (entity && entity.SF && Array.isArray(entity.SF.JPF)) entities.push(entity);
    } catch (error) {
      console.warn(`[Public EVA API] No se pudo obtener entidad EVA ${id}:`, error?.message || error);
    }
  }

  return entities;
}

function serializeEvaPuesto(jpf = {}, entity = {}) {
  const id = jpf.JPI || jpf.id || null;
  const name = jpf.N || jpf.name || "";
  const unit = entity.N || entity.name || "";

  return {
    id,
    JPI: id,
    name,
    N: name,
    unit,
    unidad: unit,
    entityId: entity.EI || entity.id || null,
  };
}

export async function getPublicEvaPuestos(req) {
  const { searchParams } = new URL(req.url);
  const query = normalize(searchParams.get("q") || searchParams.get("query") || "");
  const includeIntendencia = parseBool(searchParams.get("includeIntendencia"), false);
  const limit = toPositiveInt(searchParams.get("limit"), 100, { min: 1, max: 500 });

  try {
    const eva = await ensureEvaReady({ waitForReady: searchParams.get("wait") !== "0" });
    const entities = await discoverEvaEntities(eva);
    let puestos = [];

    for (const entity of entities) {
      for (const jpf of entity?.SF?.JPF || []) {
        const item = serializeEvaPuesto(jpf, entity);
        if (!item.id || !item.name) continue;
        if (!includeIntendencia && normalize(item.name).includes("intendencia")) continue;
        puestos.push(item);
      }
    }

    puestos = puestos.filter((item, index, arr) => arr.findIndex((other) => String(other.id) === String(item.id)) === index);

    if (query) {
      const tokens = query.split(/\s+/).filter(Boolean);
      puestos = puestos.filter((item) => {
        const haystack = normalize([item.id, item.name, item.unit, item.entityId].join(" "));
        return tokens.every((token) => haystack.includes(token));
      });
    }

    puestos.sort((a, b) => {
      const byUnit = normalize(a.unit).localeCompare(normalize(b.unit));
      if (byUnit) return byUnit;
      return normalize(a.name).localeCompare(normalize(b.name));
    });

    return jsonResponse({ ok: true, ready: true, total: puestos.length, count: Math.min(puestos.length, limit), puestos: puestos.slice(0, limit), items: puestos.slice(0, limit) });
  } catch (error) {
    return errorResponse(503, "EVA_NOT_READY", "No se pudieron obtener los puestos EVA.", { details: error?.message || String(error) });
  }
}

export async function getPublicEvaPuesto(req, puestoId) {
  const wanted = parsePuestoId(puestoId);
  if (!wanted) return errorResponse(400, "INVALID_PUESTO_ID", "Proporciona un puesto EVA válido.");

  try {
    const eva = await ensureEvaReady({ waitForReady: true });
    const entities = await discoverEvaEntities(eva);

    for (const entity of entities) {
      const found = (entity?.SF?.JPF || []).find((jpf) => String(jpf?.JPI) === String(wanted));
      if (found) {
        return jsonResponse({ ok: true, ready: true, puesto: serializeEvaPuesto(found, entity) });
      }
    }

    return errorResponse(404, "EVA_PUESTO_NOT_FOUND", "No se encontró ese puesto EVA.", { puestoId: wanted });
  } catch (error) {
    return errorResponse(503, "EVA_NOT_READY", "No se pudo consultar el puesto EVA.", { details: error?.message || String(error) });
  }
}

async function postEvaCandidateToEvaluatest({ eva, name, email, puestoId, sendEmail = true }) {
  const codeRes = await eva.get(`api/v1/JobProfile/${puestoId}/evaluationcode`, true);
  if (!Array.isArray(codeRes) || !codeRes.length || !codeRes[0]?.Code) {
    throw new Error("Ese puesto no existe o no tiene código de evaluación asignado.");
  }

  const evalCode = codeRes[0].Code;

  await eva.post("https://empresas.evaluatest.com/proxy/api/v1/jobprofile/candidates/invite", {
    Name: name,
    Email: email,
    EvaluationCode: evalCode,
  });

  const publishRes = await eva.get(`api/v1/JobProfile/${puestoId}/publish`, true);
  const link = publishRes?.JobExchangeLink || null;

  if (sendEmail) {
    await eva.post("https://empresas.evaluatest.com/proxy/api/v1/email/candidate/action/invite", {
      CandidateEmail: email,
      CandidateName: name,
      EnterpriseName: PUBLIC_EVA_ENTERPRISE_NAME,
      EvaluationTypeId: PUBLIC_EVA_EVALUATION_TYPE_ID,
      VacantCode: evalCode,
      VacantId: puestoId,
      VacantName: PUBLIC_EVA_VACANT_NAME,
    });
  }

  return { evalCode, link, emailSent: !!sendEmail };
}

export async function publicEvaInvite(req, { defaultSendEmail = true, auditAction = "PUBLIC_API_EVA_INVITE" } = {}) {
  const body = await readJsonBody(req);
  const name = cleanPublicText(body.name || body.nombre || body.candidateName || body.nombres);
  const email = cleanPublicText(body.email || body.correo || body.CandidateEmail);
  const puestoId = parsePuestoId(body.puestoId || body.vacantId || body.VacantId || body.JPI || body.jobProfileId);
  const sendEmail = parseBool(body.sendEmail ?? body.notify ?? body.invite, defaultSendEmail);
  const targetObj = { id: puestoId || "UNKNOWN", name, email };

  try {
    if (!name || !email || !puestoId) {
      return errorResponse(400, "MISSING_FIELDS", "Faltan campos requeridos: name, email y puestoId.");
    }

    if (!EMAIL_RE.test(email)) {
      return errorResponse(400, "INVALID_EMAIL", "Correo electrónico no válido.", { email });
    }

    if (puestoId < 1000) {
      return errorResponse(400, "PATH_PUESTO_IN_EVA_ENDPOINT", "Ese puesto parece de PATH. Usa la operación PATH correspondiente.", { puestoId });
    }

    const eva = await ensureEvaReady({ waitForReady: true });
    const result = await postEvaCandidateToEvaluatest({ eva, name, email, puestoId, sendEmail });

    await logAudit(PUBLIC_AUDIT_USER, auditAction, targetObj, "EVA", "SUCCESS", {
      puestoId,
      evalCode: result.evalCode,
      link: result.link,
      emailSent: result.emailSent,
      source: "public-api",
    });

    return jsonResponse({
      ok: true,
      success: true,
      system: "EVA",
      action: sendEmail ? "invite" : "postulacion",
      name,
      email,
      puestoId,
      evalCode: result.evalCode,
      link: result.link,
      emailSent: result.emailSent,
      message: sendEmail ? "Candidato postulado e invitado en EVA." : "Candidato postulado en EVA sin envío de correo.",
    });
  } catch (error) {
    await logAudit(PUBLIC_AUDIT_USER, auditAction, targetObj, "EVA", "ERROR", {
      puestoId,
      error: error?.message || String(error),
      source: "public-api",
    });

    return errorResponse(500, "EVA_INVITE_FAILED", "No se pudo completar la operación EVA.", { details: error?.message || String(error) });
  }
}

function cleanPublicText(value) {
  return toText(value).trim();
}

