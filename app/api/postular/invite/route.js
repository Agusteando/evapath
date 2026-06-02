import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import Hashids from "hashids";
import { authOptions } from "../../../lib/auth";
import { getEva, getPathPool, logAudit } from "../../shared";

const EMAIL_RE = /^([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)$/;
const PATH_CATALOGOS = [1, 2];

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeSystem(value) {
  return cleanText(value).toUpperCase();
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function parsePuestoId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
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

async function insertPathInvite({ name, email, puestoId, ts }) {
  const pathDB = getPathPool();
  const connection = await pathDB.getConnection();

  try {
    await connection.beginTransaction();

    const [candidateResult] = await connection.query(
      `INSERT INTO candidatos (nombres, email)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         nombres = VALUES(nombres),
         email = VALUES(email),
         id = LAST_INSERT_ID(id)`,
      [name, email],
    );

    let candidatoId = Number(candidateResult.insertId || 0);

    if (!candidatoId) {
      const [existingRows] = await connection.query(
        `SELECT id
         FROM candidatos
         WHERE LOWER(TRIM(email)) = ?
         ORDER BY id DESC
         LIMIT 1`,
        [normalizeEmail(email)],
      );
      candidatoId = Number(existingRows?.[0]?.id || 0);
    }

    if (!candidatoId) {
      throw new Error("No se pudo insertar o recuperar el candidato en PATH.");
    }

    const pruebaValues = PATH_CATALOGOS.map((catalogoId) => [candidatoId, puestoId, ts, catalogoId]);
    await connection.query(
      `INSERT INTO pruebas (candidato_id, puesto_id, code, catalogo_id)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         candidato_id = VALUES(candidato_id),
         puesto_id = VALUES(puesto_id),
         code = VALUES(code),
         catalogo_id = VALUES(catalogo_id)`,
      [pruebaValues],
    );

    await connection.commit();
    return candidatoId;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function sendPathInviteEmail({ email, name, hashid, link }) {
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

  await postJson("https://bot.casitaapps.com/sendEmailAs", { data: emailBotPayload }, "No se pudo enviar el correo PATH");
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const body = await readBody(req);
  const system = normalizeSystem(body.system);
  const email = cleanText(body.email);
  const name = cleanText(body.name);
  const puestoId = parsePuestoId(body.puestoId);
  const targetObj = { id: puestoId || "UNKNOWN", name, email };

  try {
    if (!system || !email || !name || !puestoId) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Correo electrónico no válido" }, { status: 400 });
    }

    if (system === "EVA") {
      const eva = getEva();
      if (!eva.ready) {
        throw new Error("El servicio de EVA no está inicializado o listo.");
      }

      // 1. Obtener Evaluation Code
      const codeRes = await eva.get(`api/v1/JobProfile/${puestoId}/evaluationcode`, true);
      if (!codeRes || !codeRes.length) {
        throw new Error("Ese puesto no existe o no tiene código de evaluación asignado.");
      }
      const evalCode = codeRes[0].Code;

      // 2. Postular candidato
      const bodyData = { Name: name, Email: email, EvaluationCode: evalCode };
      await eva.post("https://empresas.evaluatest.com/proxy/api/v1/jobprofile/candidates/invite", bodyData);

      // 3. Obtener el Job Exchange Link de publicación
      const publishRes = await eva.get(`api/v1/JobProfile/${puestoId}/publish`, true);
      const link = publishRes.JobExchangeLink;

      // 4. Mandar el correo electrónico al candidato
      const emailPayload = {
        CandidateEmail: email,
        CandidateName: name,
        EnterpriseName: "IECS-IEDIS",
        EvaluationTypeId: "2",
        VacantCode: evalCode,
        VacantId: puestoId,
        VacantName: "Forma parte de nuestra gran familia",
      };
      await eva.post("https://empresas.evaluatest.com/proxy/api/v1/email/candidate/action/invite", emailPayload);

      await logAudit(session.user, "INVITE_CANDIDATE", targetObj, "EVA", "SUCCESS", { puestoId, evalCode, link });

      return NextResponse.json({ success: true, link });
    }

    if (system === "PATH") {
      if (puestoId > 1000) {
        return NextResponse.json({ error: "Estás usando un puesto de EVALUATEST. Selecciona un puesto PATH válido." }, { status: 400 });
      }

      const ts = Date.now();
      const candidatoId = await insertPathInvite({ name, email, puestoId, ts });

      // Generar hashid con el mismo contrato legado: encode(id, 26, timestamp)
      const hashids = new Hashids();
      const hashid = hashids.encode(candidatoId, 26, ts);
      const link = `https://reclutamiento.casitaapps.com/vacante/${hashid}`;

      await sendPathInviteEmail({ email, name, hashid, link });

      await logAudit(session.user, "INVITE_CANDIDATE", targetObj, "PATH", "SUCCESS", { puestoId, candidatoId, hashid, link });

      return NextResponse.json({ success: true, link });
    }

    return NextResponse.json({ error: "Sistema no válido" }, { status: 400 });
  } catch (error) {
    console.error("[Postular/Invite] Error:", error);
    await logAudit(session.user, "INVITE_CANDIDATE", targetObj, system || "SYSTEM", "ERROR", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
