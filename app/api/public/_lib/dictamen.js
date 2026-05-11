import { NextResponse } from "next/server";
import { getSigniaPool, getPathPool, getEva, waitEva, logAudit } from "../../shared.js";

const PUBLIC_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

const PUBLIC_AUDIT_USER = {
  email: "public-api@evapath.local",
  name: "Public API",
  image: "",
};

export const EVA_WAIT_TIMEOUT_MS = 240000;

function toText(value) {
  return value === undefined || value === null ? "" : String(value);
}

export function normalizeEmail(value) {
  return toText(value).trim().toLowerCase();
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
  return jsonResponse({ ok: false, available: false, code, message, ...details }, status);
}

export function publicUrl(req, pathname) {
  const url = new URL(req.url);
  return `${url.origin}${pathname}`;
}

export function parseSigniaId(value) {
  const id = toText(value).trim();
  if (!id) return null;
  return id;
}

export function normalizePathType(type) {
  const normalized = toText(type).trim().toLowerCase();
  if (["eco", "mmpi"].includes(normalized)) return normalized;
  if (["mmpi-2", "mmpi2", "mmpi-2-rf", "mmpi2rf", "mmpi_rf"].includes(normalized)) return "mmpi";
  return null;
}

export function pathLabel(type) {
  return type === "mmpi" ? "MMPI-2 RF" : "ECO";
}

export async function getSigniaUser(signiaId) {
  const id = parseSigniaId(signiaId);
  if (!id) return null;

  const db = await getSigniaPool();
  const [rows] = await db.query(
    "SELECT id,email,name,evaId,pathId FROM user WHERE id=? LIMIT 1",
    [id],
  );
  return rows?.[0] || null;
}

export function publicTarget(signiaUser, sourceSystem) {
  return {
    id: signiaUser?.id || "UNKNOWN",
    name: signiaUser?.name || "Expediente Signia",
    email: signiaUser?.email || "",
    sourceSystem,
  };
}

function evaCandidateName(candidate = {}) {
  return candidate.nombre || candidate.N || candidate.name || "EVA";
}

function evaCandidateEmail(candidate = {}) {
  return candidate.correo || candidate.M || candidate.email || candidate.Email || "";
}

export function findEvaCandidate(eva, evaId) {
  const target = toText(evaId);
  if (!target || !eva) return null;

  const sources = [
    ...(Array.isArray(eva.results) ? eva.results : []),
    ...Object.values(eva.cache || {}),
  ];

  const found = sources.find((candidate) => toText(candidate?.CID) === target);
  if (!found) return null;

  return {
    id: found.CID,
    name: evaCandidateName(found),
    email: evaCandidateEmail(found),
    status: found.estado || found.D || "",
    jobId: found.JID || null,
    jobName: found.puesto || found.JN || "",
    fechaProceso: found.fechaProceso || found.PD || null,
  };
}

export async function getEvaAvailability(signiaId, req, { waitForReady = false } = {}) {
  const signiaUser = await getSigniaUser(signiaId);
  if (!signiaUser) {
    return {
      status: 404,
      payload: {
        ok: false,
        available: false,
        linked: false,
        code: "SIGNIA_NOT_FOUND",
        message: "No existe un usuario Signia con ese id.",
        signiaId: parseSigniaId(signiaId),
      },
    };
  }

  const evaId = signiaUser.evaId;
  if (!evaId) {
    return {
      status: 200,
      payload: {
        ok: true,
        available: false,
        linked: false,
        code: "NO_EVA_LINK",
        message: "El usuario Signia no tiene vinculación EVA.",
        signia: signiaUser,
        dictamen: { system: "EVA", type: "eva", sourceId: null },
      },
    };
  }

  const eva = getEva();
  let waitError = null;
  if (waitForReady && !eva.ready) {
    try {
      await waitEva(EVA_WAIT_TIMEOUT_MS);
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
        linked: true,
        code: "EVA_NOT_READY",
        message: "Existe vinculación EVA, pero el servicio EVA todavía no está listo.",
        signia: signiaUser,
        dictamen: { system: "EVA", type: "eva", sourceId: evaId },
        eva: {
          ready: false,
          status: freshEva.status || "init",
          waitError: waitError?.message || null,
        },
      },
    };
  }

  const candidate = findEvaCandidate(freshEva, evaId);
  if (!candidate) {
    return {
      status: 200,
      payload: {
        ok: true,
        available: false,
        linked: true,
        code: "EVA_CANDIDATE_NOT_FOUND",
        message: "Existe vinculación EVA, pero el candidato no está disponible en el cache actual de EVA.",
        signia: signiaUser,
        dictamen: { system: "EVA", type: "eva", sourceId: evaId },
        eva: { ready: true, status: freshEva.status || "ready" },
      },
    };
  }

  return {
    status: 200,
    payload: {
      ok: true,
      available: true,
      linked: true,
      code: "EVA_DICTAMEN_AVAILABLE",
      message: "El dictamen EVA puede obtenerse usando la vinculación existente.",
      signia: signiaUser,
      dictamen: {
        system: "EVA",
        type: "eva",
        sourceId: evaId,
        candidate,
        endpoint: publicUrl(req, `/api/public/signia/${encodeURIComponent(signiaUser.id)}/eva/dictamen`),
      },
      eva: { ready: true, status: freshEva.status || "ready" },
    },
  };
}

export async function getPathTest(pathId, type) {
  const normalizedType = normalizePathType(type);
  if (!normalizedType || !pathId) return null;

  const db = await getPathPool();
  const typeClause = normalizedType === "mmpi"
    ? "p.catalogo_id = 2"
    : "(p.catalogo_id IS NULL OR p.catalogo_id <> 2)";

  const [rows] = await db.query(
    `SELECT
       c.id AS candidatoId,
       c.email,
       CONCAT_WS(' ', c.nombres, c.apellidopaterno, c.apellidomaterno) AS candidateName,
       p.id AS pruebaId,
       p.code,
       p.catalogo_id AS catalogoId,
       p.pubdate
     FROM pruebas p
     INNER JOIN candidatos c ON c.id = p.candidato_id
     WHERE p.candidato_id = ?
       AND p.code IS NOT NULL
       AND p.code <> ''
       AND p.completada = 1
       AND ${typeClause}
     ORDER BY p.pubdate DESC, p.id DESC
     LIMIT 1`,
    [pathId],
  );

  const row = rows?.[0];
  if (!row) return null;

  return {
    type: normalizedType,
    label: pathLabel(normalizedType),
    candidateId: row.candidatoId,
    candidateName: row.candidateName || "PATH",
    email: row.email || "",
    pruebaId: row.pruebaId,
    code: row.code,
    catalogoId: row.catalogoId,
    pubdate: row.pubdate || null,
    remoteUrl: `https://reclutamiento.casitaapps.com/resultados/${row.candidatoId}_${row.pruebaId}_${row.code}.pdf`,
  };
}

export async function getPathAvailability(signiaId, type, req) {
  const normalizedType = normalizePathType(type);
  if (!normalizedType) {
    return {
      status: 400,
      payload: {
        ok: false,
        available: false,
        linked: false,
        code: "INVALID_PATH_TYPE",
        message: "Tipo PATH inválido. Usa eco o mmpi.",
        acceptedTypes: ["eco", "mmpi"],
      },
    };
  }

  const signiaUser = await getSigniaUser(signiaId);
  if (!signiaUser) {
    return {
      status: 404,
      payload: {
        ok: false,
        available: false,
        linked: false,
        code: "SIGNIA_NOT_FOUND",
        message: "No existe un usuario Signia con ese id.",
        signiaId: parseSigniaId(signiaId),
      },
    };
  }

  if (!signiaUser.pathId) {
    return {
      status: 200,
      payload: {
        ok: true,
        available: false,
        linked: false,
        code: "NO_PATH_LINK",
        message: "El usuario Signia no tiene vinculación PATH.",
        signia: signiaUser,
        dictamen: { system: "PATH", type: normalizedType, label: pathLabel(normalizedType), sourceId: null },
      },
    };
  }

  const test = await getPathTest(signiaUser.pathId, normalizedType);
  if (!test) {
    return {
      status: 200,
      payload: {
        ok: true,
        available: false,
        linked: true,
        code: "PATH_DICTAMEN_NOT_FOUND",
        message: `Existe vinculación PATH, pero no hay dictamen ${pathLabel(normalizedType)} completado con PDF disponible.`,
        signia: signiaUser,
        dictamen: {
          system: "PATH",
          type: normalizedType,
          label: pathLabel(normalizedType),
          sourceId: signiaUser.pathId,
        },
      },
    };
  }

  return {
    status: 200,
    payload: {
      ok: true,
      available: true,
      linked: true,
      code: "PATH_DICTAMEN_AVAILABLE",
      message: `El dictamen PATH ${pathLabel(normalizedType)} puede obtenerse usando la vinculación existente.`,
      signia: signiaUser,
      dictamen: {
        system: "PATH",
        type: normalizedType,
        label: pathLabel(normalizedType),
        sourceId: signiaUser.pathId,
        candidate: {
          id: test.candidateId,
          name: test.candidateName,
          email: test.email,
        },
        prueba: {
          id: test.pruebaId,
          code: test.code,
          catalogoId: test.catalogoId,
          pubdate: test.pubdate,
        },
        endpoint: publicUrl(req, `/api/public/signia/${encodeURIComponent(signiaUser.id)}/path/${normalizedType}/dictamen`),
      },
    },
  };
}

export async function getAllAvailability(signiaId, req) {
  const [eva, eco, mmpi] = await Promise.all([
    getEvaAvailability(signiaId, req, { waitForReady: false }),
    getPathAvailability(signiaId, "eco", req),
    getPathAvailability(signiaId, "mmpi", req),
  ]);

  const signia = eva.payload?.signia || eco.payload?.signia || mmpi.payload?.signia || null;
  const status = [eva.status, eco.status, mmpi.status].includes(404) ? 404 : 200;

  return {
    status,
    payload: {
      ok: status === 200,
      signiaId: parseSigniaId(signiaId),
      signia,
      dictamenes: {
        eva: eva.payload,
        pathEco: eco.payload,
        pathMmpi: mmpi.payload,
      },
    },
  };
}

export async function streamEvaDictamen(signiaId, req) {
  const availability = await getEvaAvailability(signiaId, req, { waitForReady: true });
  if (!availability.payload?.available) {
    return jsonResponse(availability.payload, availability.status === 200 ? 409 : availability.status);
  }

  const signiaUser = availability.payload.signia;
  const evaId = signiaUser.evaId;
  const eva = getEva();

  try {
    const pdf = await eva.downloadPDF(evaId);
    await logAudit(
      PUBLIC_AUDIT_USER,
      "PUBLIC_API_DOWNLOAD_EVA_PDF",
      publicTarget(signiaUser, "EVA"),
      "EVA",
      "SUCCESS",
      { signiaId: signiaUser.id, evaId, size: pdf.length },
    );

    return new NextResponse(pdf, {
      status: 200,
      headers: corsHeaders({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="EVA_${signiaUser.id}_${evaId}.pdf"`,
      }),
    });
  } catch (error) {
    await logAudit(
      PUBLIC_AUDIT_USER,
      "PUBLIC_API_DOWNLOAD_EVA_PDF",
      publicTarget(signiaUser, "EVA"),
      "EVA",
      "ERROR",
      { signiaId: signiaUser.id, evaId, error: error?.message || String(error) },
    );

    return errorResponse(502, "EVA_DOWNLOAD_FAILED", "No se pudo obtener el dictamen EVA.", {
      signiaId: signiaUser.id,
      evaId,
      details: error?.message || String(error),
    });
  }
}

export async function streamPathDictamen(signiaId, type, req) {
  const availability = await getPathAvailability(signiaId, type, req);
  if (!availability.payload?.available) {
    return jsonResponse(availability.payload, availability.status === 200 ? 409 : availability.status);
  }

  const signiaUser = availability.payload.signia;
  const normalizedType = normalizePathType(type);
  const test = await getPathTest(signiaUser.pathId, normalizedType);

  try {
    const pdfRes = await fetch(test.remoteUrl, { cache: "no-store" });
    if (!pdfRes.ok) {
      throw new Error(`Remote PATH returned ${pdfRes.status} for ${test.remoteUrl}`);
    }

    const buf = await pdfRes.arrayBuffer();
    await logAudit(
      PUBLIC_AUDIT_USER,
      "PUBLIC_API_DOWNLOAD_PATH_PDF",
      publicTarget(signiaUser, "PATH"),
      "PATH",
      "SUCCESS",
      {
        signiaId: signiaUser.id,
        pathId: signiaUser.pathId,
        type: normalizedType,
        pruebaId: test.pruebaId,
        code: test.code,
        remoteUrl: test.remoteUrl,
      },
    );

    return new NextResponse(buf, {
      status: 200,
      headers: corsHeaders({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="PATH_${pathLabel(normalizedType).replace(/[^a-zA-Z0-9]/g, "_")}_${signiaUser.id}.pdf"`,
      }),
    });
  } catch (error) {
    await logAudit(
      PUBLIC_AUDIT_USER,
      "PUBLIC_API_DOWNLOAD_PATH_PDF",
      publicTarget(signiaUser, "PATH"),
      "PATH",
      "ERROR",
      {
        signiaId: signiaUser.id,
        pathId: signiaUser.pathId,
        type: normalizedType,
        error: error?.message || String(error),
      },
    );

    return errorResponse(502, "PATH_DOWNLOAD_FAILED", `No se pudo obtener el dictamen PATH ${pathLabel(normalizedType)}.`, {
      signiaId: signiaUser.id,
      pathId: signiaUser.pathId,
      type: normalizedType,
      details: error?.message || String(error),
    });
  }
}
