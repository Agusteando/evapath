import { NextResponse } from "next/server";
import { getSigniaPool, getPathPool, waitEva, getEva, logAudit } from "../shared.js";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";

export async function POST(req, context) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const eva = getEva();
  try {
    await waitEva();
  } catch (err) {
    console.error("[bulk-sync] EVA not ready:", err);
    return NextResponse.json(
      { error: "EVA service not ready", details: err?.message || String(err) },
      { status: 503 }
    );
  }

  let evaUsers;
  try {
    evaUsers = eva.getUsers();
  } catch (err) {
    console.error("[bulk-sync] eva.getUsers() failed:", err);
    return NextResponse.json(
      { error: "Failed to obtain EVA users", details: err?.message || String(err) },
      { status: 500 }
    );
  }

  const evaByEmail = Object.fromEntries(evaUsers.map((u) => [u.correo, u.CID]));
  const signiaDB = await getSigniaPool();
  const pathDB = await getPathPool();

  const [sig] = await signiaDB.query("SELECT id,email,evaId,pathId FROM user");

  let evaSet = 0;
  let pathSet = 0;

  for (const u of sig) {
    if (!u.evaId && evaByEmail[u.email]) {
      await signiaDB.query("UPDATE user SET evaId=? WHERE id=?", [evaByEmail[u.email], u.id]);
      evaSet++;
    }
    if (!u.pathId) {
      const [c] = await pathDB.query(
        "SELECT id FROM candidatos WHERE email=? LIMIT 1",
        [u.email]
      );
      if (c.length) {
        await signiaDB.query("UPDATE user SET pathId=? WHERE id=?", [c[0].id, u.id]);
        pathSet++;
      }
    }
  }

  await logAudit(session.user, "BULK_SYNC", "ALL", "SYSTEM", "SUCCESS", { evaSet, pathSet, totalSignia: sig.length });

  return NextResponse.json({ evaSet, pathSet });
}