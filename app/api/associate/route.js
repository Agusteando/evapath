import { NextResponse } from "next/server";
import { getSigniaPool, logAudit } from "../shared.js";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";

export async function POST(req, context) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const body = await req.json();
    const { signiaId, source, cid } = body || {};

    if (!signiaId || !["eva", "path"].includes(source) || cid === undefined || cid === null) {
      console.warn("[associate] Invalid params", { signiaId, source, cid });
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const signiaDB = await getSigniaPool();
    const column = source === "eva" ? "evaId" : "pathId";

    const [result] = await signiaDB.query(
      `UPDATE user SET ${column}=? WHERE id=?`,
      [cid, signiaId]
    );

    if (!result || !result.affectedRows) {
      await logAudit(session.user, "ASSOCIATE_USER", signiaId, source.toUpperCase(), "ERROR", { cid, error: "User not found" });
      return NextResponse.json({ ok: false, error: "User not found or not updated" }, { status: 404 });
    }

    await logAudit(session.user, "ASSOCIATE_USER", signiaId, source.toUpperCase(), "SUCCESS", { cid });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[associate] Error:", err);
    await logAudit(session?.user, "ASSOCIATE_USER", null, "SYSTEM", "ERROR", { error: err.message });
    return NextResponse.json(
      { error: err?.message || String(err) },
      { status: 500 }
    );
  }
}