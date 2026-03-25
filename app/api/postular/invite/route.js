import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
import { getEva, logAudit } from "../../shared";
const Hashids = require('hashids/cjs');

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const { system, email, name, puestoId } = await req.json();

    if (!system || !email || !name || !puestoId) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    const targetObj = { id: puestoId, name: name, email: email };

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
        VacantName: "Forma parte de nuestra gran familia"
      };
      await eva.post("https://empresas.evaluatest.com/proxy/api/v1/email/candidate/action/invite", emailPayload);

      await logAudit(session.user, "INVITE_CANDIDATE", targetObj, "EVA", "SUCCESS", { puestoId, evalCode, link });

      return NextResponse.json({ success: true, link });

    } else if (system === "PATH") {
      const ts = Date.now();

      // 1. Insertar el candidato en PATH
      const candRes = await fetch('https://reclutamiento.casitaapps.com/inserta.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [{ nombres: name, email: email }],
          table: 'candidatos'
        })
      });
      const candItem = await candRes.json();
      const candidatoId = Math.abs(candItem);
      
      if (!candidatoId) throw new Error("No se pudo insertar o recuperar el candidato.");

      // 2. Asignar las pruebas (ECO y MMPI2-RF)
      const pruebas = [
        { candidato_id: candidatoId, puesto_id: puestoId, code: ts, catalogo_id: 1 },
        { candidato_id: candidatoId, puesto_id: puestoId, code: ts, catalogo_id: 2 }
      ];
      await fetch('https://reclutamiento.casitaapps.com/inserta.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: pruebas, table: 'pruebas' })
      });

      // 3. Generar hashid (idéntico al bot legado: .encode(id, 26, ts))
      const hashids = new Hashids();
      const hashid = hashids.encode(candidatoId, 26, ts);
      const link = "https://reclutamiento.casitaapps.com/vacante/" + hashid;

      // 4. Enviar email a través de sendEmailAs
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
        link: link
      };

      await fetch('https://bot.casitaapps.com/sendEmailAs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: emailBotPayload })
      });

      await logAudit(session.user, "INVITE_CANDIDATE", targetObj, "PATH", "SUCCESS", { puestoId, candidatoId, hashid, link });

      return NextResponse.json({ success: true, link });

    } else {
      return NextResponse.json({ error: "Sistema no válido" }, { status: 400 });
    }

  } catch (error) {
    console.error("[Postular/Invite] Error:", error);
    try {
      const { system, email, name } = await req.json();
      await logAudit(session.user, "INVITE_CANDIDATE", { id: "UNKNOWN", name, email }, system || "SYSTEM", "ERROR", { error: error.message });
    } catch (_) {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}