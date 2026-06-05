import { NextResponse } from "next/server";
import { waitEva, getEva, getSigniaPool } from "../shared.js";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { getEvaEmail, getSigniaEmail } from "../../lib/emailIdentity.js";
import { getBestPersonName, rankPersonCandidates, normalizeString } from "../../lib/nameMatch.js";
import { buildManualCandidatePayload, buildOwnerMap } from "../../lib/manualAssociation.js";

async function getSigniaUser(signiaId) {
  if (!signiaId) return null;
  const signiaDB = await getSigniaPool();
  const [rows] = await signiaDB.query(
    `SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email,evaId
     FROM user
     WHERE isActive=1 AND id=?
     LIMIT 1`,
    [signiaId],
  );
  return rows?.[0] || null;
}

async function getEvaOwners() {
  const signiaDB = await getSigniaPool();
  const [rows] = await signiaDB.query(
    `SELECT id,nombres,apellidoPaterno,apellidoMaterno,name,email,evaId
     FROM user
     WHERE isActive=1
       AND evaId IS NOT NULL
       AND evaId<>0
       AND evaId<>''`,
  );
  return rows || [];
}

function isManualTextMatch(entry, term) {
  if (!normalizeString(term)) return true;
  return entry.queryScore >= 45;
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
  const intent = searchParams.get("intent") || "manual";
  const includeLinked = searchParams.get("includeLinked") !== "0";
  const explicitExclude = (searchParams.get("exclude") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let signiaUser = null;
  let linkedOwners = [];
  try {
    [signiaUser, linkedOwners] = await Promise.all([
      getSigniaUser(signiaId),
      getEvaOwners(),
    ]);
  } catch (error) {
    console.warn("[search-eva] Could not load Signia link context:", error?.message);
  }

  const ownerMap = buildOwnerMap(linkedOwners, "evaId");
  const linkedIds = includeLinked ? [] : Array.from(ownerMap.keys());

  const ranked = rankPersonCandidates({
    signiaUser,
    signiaName: getBestPersonName(signiaUser),
    signiaEmail: getSigniaEmail(signiaUser),
    candidates: evaUsers || [],
    query: rawTerm,
    excludedIds: [...explicitExclude, ...linkedIds],
    getCandidateId: (candidate) => candidate.CID,
    getCandidateName: (candidate) => candidate.nombre || candidate.N || "",
    getCandidateEmail: (candidate) => getEvaEmail(candidate),
    getCandidateText: (candidate) => [
      `EVA ${candidate.CID}`,
      candidate.puesto || candidate.JN,
      candidate.estado,
    ]
      .filter(Boolean)
      .join(" "),
    limit: intent === "recommend" ? 12 : 50,
    minScore: rawTerm || signiaUser ? 1 : 0,
    includeWeakTextMatches: true,
  }).filter((entry) => isManualTextMatch(entry, rawTerm));

  return NextResponse.json(
    ranked.slice(0, intent === "recommend" ? 12 : 30).map((entry) => {
      const candidate = entry.candidate;
      return buildManualCandidatePayload({
        entry,
        candidateId: candidate.CID,
        name: entry.name,
        email: entry.email,
        ownerMap,
        currentSigniaId: signiaId,
        tests: null,
        extra: {
          source: "eva",
          puesto: candidate.puesto || candidate.JN || "",
          estado: candidate.estado || "",
        },
      });
    }),
  );
}
