import { NextResponse } from "next/server";
import { waitEva, getEva, getSigniaPool } from "../shared.js";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { getEvaEmail, getSigniaEmail } from "../../lib/emailIdentity.js";
import { getBestPersonName, rankPersonCandidates } from "../../lib/nameMatch.js";

async function getSigniaUser(signiaId) {
  if (!signiaId) return null;
  const signiaDB = await getSigniaPool();
  const [rows] = await signiaDB.query(
    `SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email
     FROM user
     WHERE isActive=1 AND id=?
     LIMIT 1`,
    [signiaId],
  );
  return rows?.[0] || null;
}

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    await waitEva(5000);
  } catch (err) {
    return NextResponse.json(
      { error: "EVA service not ready", details: err?.message },
      { status: 503 },
    );
  }

  const eva = getEva();
  let evaUsers;
  try {
    evaUsers = eva.getUsers();
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to obtain EVA users", details: err?.message },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const rawTerm = searchParams.get("q") || "";
  const signiaId = searchParams.get("signiaId") || "";
  const exclude = (searchParams.get("exclude") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let signiaUser = null;
  try {
    signiaUser = await getSigniaUser(signiaId);
  } catch (error) {
    console.warn("[search-eva] Could not load Signia context:", error?.message);
  }

  const ranked = rankPersonCandidates({
    signiaUser,
    signiaName: getBestPersonName(signiaUser),
    signiaEmail: getSigniaEmail(signiaUser),
    candidates: evaUsers || [],
    query: rawTerm,
    excludedIds: exclude,
    getCandidateId: (candidate) => candidate.CID,
    getCandidateName: (candidate) => candidate.nombre || candidate.N || "",
    getCandidateEmail: (candidate) => getEvaEmail(candidate),
    getCandidateText: (candidate) => [candidate.puesto || candidate.JN, candidate.estado]
      .filter(Boolean)
      .join(" "),
    limit: 20,
    minScore: rawTerm || signiaUser ? 50 : 0,
  });

  return NextResponse.json(
    ranked.map(({ candidate, name, email, metrics, displayScore }) => ({
      cid: candidate.CID,
      label: name,
      name,
      email,
      puesto: candidate.puesto || candidate.JN || "",
      score: displayScore,
      exactEmail: metrics.exactEmail,
      viable: metrics.viable,
    })),
  );
}
