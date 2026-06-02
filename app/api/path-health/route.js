import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { getPathHealthPage } from "../../lib/pathMaintenance";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const payload = await getPathHealthPage({
      q: searchParams.get("q") || "",
      status: searchParams.get("status") || "healthy",
      page: searchParams.get("page") || 1,
      pageSize: searchParams.get("pageSize") || 20,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[path-health] Error:", error);
    return NextResponse.json(
      { error: error.message, users: [], page: 1, pageSize: 20, total: 0, lastPage: 1 },
      { status: 500 },
    );
  }
}
