import { NextResponse } from "next/server";
import { getSigniaPool, getPathPool } from "../shared";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { getPathEmail, getSigniaEmail } from "../../lib/emailIdentity.js";
import { getBestPersonName, rankPersonCandidates } from "../../lib/nameMatch.js";

async function getSigniaUser(signiaDB, signiaId) {
  if (!signiaId) return null;
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

  const { searchParams } = new URL(req.url);
  const term = searchParams.get("q") || "";
  const signiaId = searchParams.get("signiaId") || "";
  const exclude = (searchParams.get("exclude") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const pathDB = await getPathPool();
    const signiaDB = await getSigniaPool();
    const signiaUser = await getSigniaUser(signiaDB, signiaId);

    const [candidates] = await pathDB.query(
      `SELECT id,email,CONCAT_WS(' ',nombres,apellidopaterno,apellidomaterno) AS nombre
       FROM candidatos
       WHERE id IS NOT NULL`,
    );

    const [linked] = await signiaDB.query(
      `SELECT pathId
       FROM user
       WHERE isActive=1
         AND pathId IS NOT NULL
         AND pathId<>0
         AND pathId<>''`,
    );
    const linkedSet = new Set((linked || []).map((row) => String(row.pathId)));
    const excludedIds = new Set([...exclude, ...linkedSet]);

    const ranked = rankPersonCandidates({
      signiaUser,
      signiaName: getBestPersonName(signiaUser),
      signiaEmail: getSigniaEmail(signiaUser),
      candidates: candidates || [],
      query: term,
      excludedIds,
      getCandidateId: (candidate) => candidate.id,
      getCandidateName: (candidate) => candidate.nombre || "",
      getCandidateEmail: (candidate) => getPathEmail(candidate),
      limit: 20,
      minScore: term || signiaUser ? 50 : 0,
    });

    return NextResponse.json(
      ranked.map(({ candidate, name, email, metrics, displayScore }) => ({
        cid: candidate.id,
        label: `${name}${email ? ` <${email}>` : ""}`,
        name,
        email,
        score: displayScore,
        exactEmail: metrics.exactEmail,
        viable: metrics.viable,
      })),
    );
  } catch (error) {
    console.error("[search-path] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
