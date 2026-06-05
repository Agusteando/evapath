import { NextResponse } from "next/server";
import { getSigniaPool, getPathPool } from "../shared";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { getPathEmail, getSigniaEmail } from "../../lib/emailIdentity.js";
import { getBestPersonName, rankPersonCandidates, normalizeString } from "../../lib/nameMatch.js";
import { buildManualCandidatePayload, buildOwnerMap } from "../../lib/manualAssociation.js";

async function getSigniaUser(signiaDB, signiaId) {
  if (!signiaId) return null;
  const [rows] = await signiaDB.query(
    `SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email,pathId
     FROM user
     WHERE isActive=1 AND id=?
     LIMIT 1`,
    [signiaId],
  );
  return rows?.[0] || null;
}

function isManualTextMatch(entry, term) {
  if (!normalizeString(term)) return true;
  return entry.queryScore >= 45;
}

function buildPathTestMap(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row.candidato_id);
    const current = map.get(key) || { eco: false, mmpi: false };
    if (row.catalogo_id === 1) current.eco = true;
    if (row.catalogo_id === 2) current.mmpi = true;
    map.set(key, current);
  }
  return map;
}

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const term = searchParams.get("q") || "";
  const signiaId = searchParams.get("signiaId") || "";
  const intent = searchParams.get("intent") || "manual";
  const includeLinked = searchParams.get("includeLinked") !== "0";
  const explicitExclude = (searchParams.get("exclude") || "")
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

    const [linkedOwners] = await signiaDB.query(
      `SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email,pathId
       FROM user
       WHERE isActive=1
         AND pathId IS NOT NULL
         AND pathId<>0
         AND pathId<>''`,
    );
    const ownerMap = buildOwnerMap(linkedOwners, "pathId");
    const linkedIds = includeLinked ? [] : Array.from(ownerMap.keys());
    const excludedIds = [...explicitExclude, ...linkedIds];

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
      getCandidateText: (candidate) => `PATH ${candidate.id}`,
      limit: intent === "recommend" ? 12 : 50,
      minScore: term || signiaUser ? 1 : 0,
      includeWeakTextMatches: true,
    }).filter((entry) => isManualTextMatch(entry, term));

    const ids = ranked.map((entry) => entry.id).filter(Boolean);
    let testMap = new Map();
    if (ids.length) {
      const [tests] = await pathDB.query(
        `SELECT candidato_id,catalogo_id
         FROM pruebas
         WHERE candidato_id IN (${ids.map(() => "?").join(",")})
           AND code IS NOT NULL
           AND completada=1`,
        ids,
      );
      testMap = buildPathTestMap(tests);
    }

    const payload = ranked.slice(0, intent === "recommend" ? 12 : 30).map((entry) => {
      const candidate = entry.candidate;
      const tests = testMap.get(String(candidate.id)) || { eco: false, mmpi: false };
      return buildManualCandidatePayload({
        entry,
        candidateId: candidate.id,
        name: entry.name,
        email: entry.email,
        ownerMap,
        currentSigniaId: signiaId,
        tests,
        extra: { source: "path" },
      });
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[search-path] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
