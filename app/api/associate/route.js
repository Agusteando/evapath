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
    
    // Fetch user details for audit
    let targetObj = { id: signiaId, name: "Expediente Desconocido", email: "" };
    const [userRows] = await signiaDB.query("SELECT name, email FROM user WHERE id=? AND isActive=1", [signiaId]);
    if (!userRows.length) {
      await logAudit(session.user, "ASSOCIATE_USER", targetObj, source.toUpperCase(), "ERROR", { cid, error: "User not found or inactive" });
      return NextResponse.json({ ok: false, error: "User not found or inactive" }, { status: 404 });
    }
    targetObj = { id: signiaId, name: userRows[0].name || "Sin nombre", email: userRows[0].email || "" };

    const column = source === "eva" ? "evaId" : "pathId";
    await signiaDB.query(
      `UPDATE user SET ${column}=? WHERE id=? AND isActive=1`,
      [cid, signiaId]
    );

    await logAudit(session.user, "ASSOCIATE_USER", targetObj, source.toUpperCase(), "SUCCESS", { cid });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[associate] Error:", err);
    await logAudit(session?.user, "ASSOCIATE_USER", { id: "UNKNOWN", name: "Sistema", email: "" }, "SYSTEM", "ERROR", { error: err.message });
    return NextResponse.json(
      { error: err?.message || String(err) },
      { status: 500 }
    );
  }
}