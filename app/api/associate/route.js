import { NextResponse } from "next/server";
import { getSigniaPool, logAudit } from "../shared.js";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { getBestPersonName } from "../../lib/nameMatch.js";
import { normalizeLinkId } from "../../lib/linkIdentity.js";

function targetFromUser(user = {}, fallbackId) {
  return {
    id: user.id || fallbackId,
    name: getBestPersonName(user) || user.name || "Sin nombre",
    email: user.email || "",
  };
}

export async function POST(req, context) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const body = await req.json();
    const { signiaId, source, cid, force = false } = body || {};

    if (!signiaId || !["eva", "path"].includes(source) || cid === undefined || cid === null) {
      console.warn("[associate] Invalid params", { signiaId, source, cid });
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const signiaDB = await getSigniaPool();
    const column = source === "eva" ? "evaId" : "pathId";
    const normalizedCid = normalizeLinkId(cid);

    const [userRows] = await signiaDB.query(
      "SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email,evaId,pathId FROM user WHERE id=? AND isActive=1",
      [signiaId],
    );
    if (!userRows.length) {
      await logAudit(
        session.user,
        "ASSOCIATE_USER",
        { id: signiaId, name: "Expediente Desconocido", email: "" },
        source.toUpperCase(),
        "ERROR",
        { cid, error: "User not found or inactive" },
      );
      return NextResponse.json({ ok: false, error: "User not found or inactive" }, { status: 404 });
    }

    const targetUser = userRows[0];
    const targetObj = targetFromUser(targetUser, signiaId);

    const [ownerRows] = await signiaDB.query(
      `SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email,${column}
       FROM user
       WHERE isActive=1
         AND ${column}=?
       LIMIT 5`,
      [normalizedCid],
    );

    const conflictingOwner = (ownerRows || []).find(
      (row) => normalizeLinkId(row.id) !== normalizeLinkId(signiaId),
    );

    if (conflictingOwner && !force) {
      const ownerTarget = targetFromUser(conflictingOwner, conflictingOwner.id);
      await logAudit(
        session.user,
        "ASSOCIATE_USER",
        targetObj,
        source.toUpperCase(),
        "ERROR",
        {
          cid,
          conflict: true,
          linkedTo: ownerTarget,
          error: "Candidate already linked to another active Signia user",
        },
      );
      return NextResponse.json(
        {
          ok: false,
          code: "LINK_CONFLICT",
          error: `${source.toUpperCase()} #${cid} ya está vinculado a ${ownerTarget.name}.`,
          conflict: ownerTarget,
        },
        { status: 409 },
      );
    }

    if (conflictingOwner && force) {
      await signiaDB.query(
        `UPDATE user SET ${column}=NULL WHERE isActive=1 AND ${column}=? AND id<>?`,
        [normalizedCid, signiaId],
      );
    }

    await signiaDB.query(
      `UPDATE user SET ${column}=? WHERE id=? AND isActive=1`,
      [normalizedCid, signiaId],
    );

    await logAudit(session.user, "ASSOCIATE_USER", targetObj, source.toUpperCase(), "SUCCESS", {
      cid,
      force: Boolean(force),
      previousOwnerId: conflictingOwner?.id || null,
    });

    return NextResponse.json({ ok: true, reassignedFrom: conflictingOwner?.id || null });
  } catch (err) {
    console.error("[associate] Error:", err);
    await logAudit(
      session?.user,
      "ASSOCIATE_USER",
      { id: "UNKNOWN", name: "Sistema", email: "" },
      "SYSTEM",
      "ERROR",
      { error: err.message },
    );
    return NextResponse.json(
      { error: err?.message || String(err) },
      { status: 500 },
    );
  }
}
