import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
import { getAutoEmailSyncStatus, startAutoEmailSyncJob } from "../../../lib/autoEmailSyncJob.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    startAutoEmailSyncJob();
    const status = await getAutoEmailSyncStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("[auto-email-sync/status] Error:", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo leer el estado del auto email-match." },
      { status: 500 },
    );
  }
}
