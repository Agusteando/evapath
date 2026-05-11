import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { logAudit } from "../../lib/serverDb.js";
import { applyNameOpportunity, loadNameOpportunity } from "../../lib/bulkNameSync.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const { evaResult, opportunity } = await loadNameOpportunity({ waitForEva: true });

    return NextResponse.json({
      ...opportunity,
      evaReady: evaResult.ready,
      evaStatus: evaResult.status,
      evaError: evaResult.error,
      dryRun: true,
    });
  } catch (err) {
    console.error("[bulk-name-sync][GET] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to calculate name-match opportunity" },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  let requestedIds = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.signiaIds)) {
      requestedIds = body.signiaIds.map((id) => String(id));
    }
  } catch {
    requestedIds = null;
  }

  try {
    const result = await applyNameOpportunity({ requestedIds, waitForEva: true });

    await logAudit(
      session.user,
      "BULK_NAME_SYNC",
      {
        id: requestedIds ? "SELECTED" : "ALL",
        name: requestedIds ? "Usuarios seleccionados" : "Múltiples Usuarios",
        email: "Proceso Masivo por Nombre",
      },
      "SYSTEM",
      "SUCCESS",
      {
        evaSet: result.evaSet,
        pathSet: result.pathSet,
        bothSet: result.bothSet,
        records: result.records,
        selected: result.selected,
        totalSignia: result.totalSignia,
        minScore: result.minScore,
        evaReady: result.evaReady,
        evaStatus: result.evaStatus,
      },
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("[bulk-name-sync][POST] Error:", err);
    await logAudit(
      session?.user,
      "BULK_NAME_SYNC",
      { id: requestedIds ? "SELECTED" : "ALL", name: "Múltiples Usuarios", email: "Proceso Masivo por Nombre" },
      "SYSTEM",
      "ERROR",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "Failed to apply name-match sync" },
      { status: 500 },
    );
  }
}
