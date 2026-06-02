import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
import { resendPathInvite } from "../../../lib/pathMaintenance";

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
    const result = await resendPathInvite({ candidatoId: body.candidatoId, user: session.user });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[path-health/resend] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
