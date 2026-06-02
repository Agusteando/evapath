import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
import { repairPathBulk, repairPathCandidate } from "../../../lib/pathMaintenance";

async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const body = await readBody(req);

    if (body.mode === "bulk") {
      const result = await repairPathBulk({ limit: body.limit, user: session.user });
      return NextResponse.json({ success: true, mode: "bulk", ...result });
    }

    const result = await repairPathCandidate({
      candidatoId: body.candidatoId,
      puestoId: body.puestoId,
      user: session.user,
    });

    return NextResponse.json({ success: true, mode: "candidate", ...result });
  } catch (error) {
    console.error("[path-health/repair] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
