import { NextResponse } from "next/server";
import { getSigniaPool, getPathPool } from "../shared";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const term = (searchParams.get("q") || "").toLowerCase();
  let exclude = (searchParams.get("exclude") || "").split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const pathDB = await getPathPool();
    const signiaDB = await getSigniaPool();
    const [cand] = await pathDB.query(`SELECT id,email,CONCAT_WS(' ',nombres,apellidopaterno,apellidomaterno) AS nombre FROM candidatos WHERE email LIKE ? OR CONCAT_WS(' ',nombres,apellidopaterno,apellidomaterno) LIKE ? LIMIT 20`, [`%${term}%`, `%${term}%`]);

    const ids = cand.map(c => c.id);
    let linkedSet = new Set();
    if (ids.length) {
      const [linked] = await signiaDB.query(`SELECT pathId FROM user WHERE pathId IN (${ids.map(() => "?").join(",")})`, ids);
      linkedSet = new Set(linked.map(r => r.pathId));
    }
    let filtered = cand.filter(c => !linkedSet.has(c.id));
    if (exclude.length) filtered = filtered.filter(c => !exclude.includes(String(c.id)));
    return NextResponse.json(filtered.map(c => ({ cid: c.id, label: `${c.nombre} <${c.email}>` })));
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}