import { NextResponse } from "next/server";
import { waitEva, getEva } from "../shared.js";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";

export async function GET(req, context) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    await waitEva(5000);
  } catch (err) {
    return NextResponse.json({ error: "EVA service not ready", details: err?.message }, { status: 503 });
  }

  const eva = getEva();
  let evaUsers;
  try {
    evaUsers = eva.getUsers();
  } catch (err) {
    return NextResponse.json({ error: "Failed to obtain EVA users", details: err?.message }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const rawTerm = searchParams.get("q") || "";
  const term = rawTerm.toLowerCase();
  let exclude = (searchParams.get("exclude") || "").split(",").map((s) => s.trim()).filter(Boolean);

  if (exclude.length) {
    const excludeSet = new Set(exclude.map(String));
    evaUsers = evaUsers.filter((u) => !excludeSet.has(String(u.CID)));
  }

  if (term) {
    evaUsers = evaUsers.filter((u) => (u.nombre || "").toLowerCase().includes(term) || (u.puesto || "").toLowerCase().includes(term) || (u.correo || "").toLowerCase().includes(term));
  }

  return NextResponse.json(evaUsers.slice(0, 20).map((u) => ({ cid: u.CID, label: u.nombre ?? "", name: u.nombre ?? "", puesto: u.puesto ?? "" })));
}