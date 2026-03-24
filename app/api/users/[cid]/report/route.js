const { NextResponse } = require("next/server");
const { getEva, logAudit } = require("../../../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../../../lib/auth");

async function GET(req, context) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const params = await context.params;
  const eva = getEva();
  
  if (!eva.ready) {
    console.error("[PDF Report] EVA service not ready");
    return new NextResponse("EVA service not ready", { status: 503 });
  }

  // Look up candidate name/email from Eva memory/cache for the audit log
  let targetObj = { id: params.cid, name: "Candidato Desconocido", email: "" };
  const userFound = eva.results.find((u) => String(u.CID) === String(params.cid)) || 
                    Object.values(eva.cache).find((u) => String(u.CID) === String(params.cid));
                    
  if (userFound) {
    targetObj = { 
      id: params.cid, 
      name: userFound.N || userFound.nombre || "Sin nombre", 
      email: userFound.M || userFound.correo || "" 
    };
  }

  try {
    console.log("[PDF Report] Attempting to download PDF for CID:", params.cid);
    const pdf = await eva.downloadPDF(params.cid);
    
    await logAudit(session.user, "DOWNLOAD_EVA_PDF", targetObj, "EVA", "SUCCESS", { size: pdf.length });

    return new NextResponse(pdf, {
      headers: { 
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="report-${params.cid}.pdf"`
      }
    });
  } catch (err) {
    console.error("[PDF Report] Error downloading PDF for CID", params.cid, ":", err.message);
    await logAudit(session.user, "DOWNLOAD_EVA_PDF", targetObj, "EVA", "ERROR", { error: err.message });
    
    return new NextResponse(
      JSON.stringify({ 
        error: "Failed to generate PDF report",
        details: err.message,
        cid: params.cid
      }), 
      { 
        status: 404,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

module.exports = { GET };