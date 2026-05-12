import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { logAudit } from "../shared.js";
import { applyEmailOpportunity, loadEmailOpportunity } from "../../lib/bulkEmailSync.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getDebugOptions(req, label) {
  const { searchParams } = new URL(req.url);
  const enabled = searchParams.get("debug") === "1" || process.env.EMAIL_MATCH_DEBUG === "1";
  return {
    enabled,
    label,
    focusEmail: searchParams.get("email") || searchParams.get("focusEmail") || "",
    focusSigniaId: searchParams.get("signiaId") || searchParams.get("focusSigniaId") || "",
    includePii: searchParams.get("pii") === "1" || process.env.EMAIL_MATCH_DEBUG_PII === "1",
    sampleLimit: Number(searchParams.get("sample") || process.env.EMAIL_MATCH_DEBUG_SAMPLE || 40),
  };
}

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const debugOptions = getDebugOptions(req, "bulk-sync-get");
    const { evaResult, opportunity, debug } = await loadEmailOpportunity({
      waitForEva: true,
      evaTimeoutMs: Number(process.env.BULK_EMAIL_SYNC_EVA_WAIT_MS || 90000),
      debug: debugOptions,
    });

    return NextResponse.json({
      ...opportunity,
      evaReady: evaResult.ready,
      evaStatus: evaResult.status,
      evaError: evaResult.error,
      evaStats: {
        usersRead: evaResult.usersRead,
        emailsIndexed: evaResult.emailsIndexed,
        rowsWithEmail: evaResult.rowsWithEmail,
        rowsWithoutEmail: evaResult.rowsWithoutEmail,
        rowsWithoutId: evaResult.rowsWithoutId,
        duplicateEmailGroups: evaResult.duplicateEmailGroups,
      },
      dryRun: true,
      debug: debug?.enabled ? debug.snapshot() : undefined,
    });
  } catch (err) {
    console.error("[bulk-sync][GET] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to calculate email-match opportunity" },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const debugOptionsFromQuery = getDebugOptions(req, "bulk-sync-post");
  let requestedIds = null;
  let debugOptions = debugOptionsFromQuery;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.signiaIds)) {
      requestedIds = body.signiaIds.map((id) => String(id));
    }
    if (body?.debug) {
      debugOptions = {
        ...debugOptionsFromQuery,
        enabled: true,
        focusEmail: body.focusEmail || debugOptionsFromQuery.focusEmail,
        focusSigniaId: body.focusSigniaId || debugOptionsFromQuery.focusSigniaId,
        includePii: Boolean(body.includePii || debugOptionsFromQuery.includePii),
      };
    }
  } catch {
    requestedIds = null;
  }

  try {
    const result = await applyEmailOpportunity({
      requestedIds,
      waitForEva: true,
      evaTimeoutMs: Number(process.env.BULK_EMAIL_SYNC_EVA_WAIT_MS || 90000),
      debug: debugOptions,
    });

    const targetObj = {
      id: requestedIds ? "SELECTED" : "ALL",
      name: requestedIds ? "Usuarios seleccionados" : "Múltiples Usuarios",
      email: "Proceso Masivo",
    };
    await logAudit(session.user, "BULK_SYNC", targetObj, "SYSTEM", "SUCCESS", {
      evaSet: result.evaSet,
      pathSet: result.pathSet,
      bothSet: result.bothSet,
      records: result.records,
      selected: result.selected,
      totalSignia: result.totalSignia,
      evaReady: result.evaReady,
      evaStatus: result.evaStatus,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[bulk-sync][POST] Error:", err);
    await logAudit(
      session?.user,
      "BULK_SYNC",
      { id: requestedIds ? "SELECTED" : "ALL", name: "Múltiples Usuarios", email: "Proceso Masivo" },
      "SYSTEM",
      "ERROR",
      { error: err.message },
    );
    return NextResponse.json(
      { error: err?.message || "Failed to apply email-match sync" },
      { status: 500 },
    );
  }
}
