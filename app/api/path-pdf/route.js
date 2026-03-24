import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { logAudit, getPathPool } from "../shared";
import { NextResponse } from "next/server";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const cid = searchParams.get("cid");
  const pid = searchParams.get("pid");
  const code = searchParams.get("code");
  const type = searchParams.get("type"); 

  if (!cid || !pid || !code) {
    return new NextResponse("Missing params", { status: 400 });
  }

  // Check against the updated "MMPI" type param. 
  // We keep "MMPI-2 RF" gracefully for backwards compatibility if a user already had a browser tab open.
  const isMMPI = type === "MMPI" || type === "MMPI-2 RF";
  const remoteUrl = `https://reclutamiento.casitaapps.com/${isMMPI ? "resultados-rf/" : "resultados/"}${cid}_${pid}_${code}.pdf`;

  // Fetch candidate info for readable audit logs
  let targetObj = { id: cid, name: "Candidato Desconocido", email: "" };
  try {
    const pathDb = await getPathPool();
    const [cand] = await pathDb.query("SELECT CONCAT_WS(' ', nombres, apellidopaterno, apellidomaterno) AS name, email FROM candidatos WHERE id = ?", [cid]);
    if (cand.length) {
      targetObj = { id: cid, name: cand[0].name || "Sin nombre", email: cand[0].email || "" };
    }
  } catch (e) {
    console.warn("Could not fetch candidate details for audit", e);
  }

  try {
    const pdfRes = await fetch(remoteUrl);
    if (!pdfRes.ok) throw new Error(`Remote returned ${pdfRes.status}`);
    const buf = await pdfRes.arrayBuffer();

    await logAudit(session.user, "DOWNLOAD_PATH_PDF", targetObj, "PATH", "SUCCESS", { pid, code, type, remoteUrl });

    // Normalize filename safely based on evaluation (ensures filename uses "MMPI" and avoids encoded spaces)
    const displayType = isMMPI ? "MMPI" : type;

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="PATH_${displayType.replace(/[^a-zA-Z0-9]/g, '_')}_${cid}.pdf"`
      }
    });
  } catch (err) {
    await logAudit(session.user, "DOWNLOAD_PATH_PDF", targetObj, "PATH", "ERROR", { pid, code, type, remoteUrl, error: err.message });
    return new NextResponse("Failed to download", { status: 500 });
  }
}