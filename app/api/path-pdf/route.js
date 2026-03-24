import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { logAudit } from "../shared";
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

  const isMMPI = type === "MMPI-2 RF";
  const remoteUrl = `https://reclutamiento.casitaapps.com/${isMMPI ? "resultados-rf/" : "resultados/"}${cid}_${pid}_${code}.pdf`;

  try {
    const pdfRes = await fetch(remoteUrl);
    if (!pdfRes.ok) throw new Error(`Remote returned ${pdfRes.status}`);
    const buf = await pdfRes.arrayBuffer();

    await logAudit(session.user, "DOWNLOAD_PATH_PDF", cid, "PATH", "SUCCESS", { pid, code, type, remoteUrl });

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="PATH_${type.replace(/[^a-zA-Z0-9]/g, '_')}_${cid}.pdf"`
      }
    });
  } catch (err) {
    await logAudit(session.user, "DOWNLOAD_PATH_PDF", cid, "PATH", "ERROR", { pid, code, type, remoteUrl, error: err.message });
    return new NextResponse("Failed to download", { status: 500 });
  }
}