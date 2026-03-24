import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { getPathPool } from "../shared";
import { NextResponse } from "next/server";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) {
    console.warn("[Audit API] Unauthorized access attempt.");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page")) || 1;
  const pageSize = parseInt(searchParams.get("pageSize")) || 20;
  const q = searchParams.get("q") || "";

  try {
    const db = await getPathPool();

    let where = "";
    let params = [];
    if (q) {
      where = "WHERE user_email LIKE ? OR action_type LIKE ? OR target_entity LIKE ? OR target_name LIKE ? OR target_email LIKE ?";
      params = [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`];
    }

    const offset = (page - 1) * pageSize;
    
    console.log(`[Audit API] Fetching page ${page} (pageSize: ${pageSize}), query: "${q}"`);
    const [rows] = await db.query(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    const [countRows] = await db.query(`SELECT COUNT(*) as total FROM audit_logs ${where}`, params);

    return NextResponse.json({
      logs: rows,
      total: countRows[0].total,
      page,
      pageSize,
      lastPage: Math.ceil(countRows[0].total / pageSize) || 1
    });
  } catch (err) {
    console.error("[Audit API] Internal Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}