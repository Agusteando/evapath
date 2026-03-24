import { NextResponse } from "next/server";
import { evaStatusSingleton } from "../../api/shared.js";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const status = await evaStatusSingleton();
  return NextResponse.json(status, { status: 200 });
}