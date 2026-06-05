import { getBestPersonName } from "./nameMatch.js";
import { normalizeLinkId } from "./linkIdentity.js";

export function buildOwnerMap(rows = [], linkField) {
  const map = new Map();
  for (const row of rows || []) {
    const id = normalizeLinkId(row?.[linkField]);
    if (!id || map.has(id)) continue;
    map.set(id, row);
  }
  return map;
}

export function getManualLinkStatus({ candidateId, ownerMap, currentSigniaId }) {
  const normalizedCandidateId = normalizeLinkId(candidateId);
  const owner = normalizedCandidateId ? ownerMap?.get(normalizedCandidateId) : null;
  const currentId = normalizeLinkId(currentSigniaId);

  if (!owner) {
    return {
      state: "unlinked",
      label: "Disponible",
      tone: "ok",
      signiaId: null,
      signiaName: "",
      signiaEmail: "",
    };
  }

  const ownerId = normalizeLinkId(owner.id);
  const isCurrent = Boolean(ownerId && currentId && ownerId === currentId);
  return {
    state: isCurrent ? "linked_to_current" : "linked_to_other",
    label: isCurrent ? "Vinculación actual" : "Vinculado a otro Signia",
    tone: isCurrent ? "info" : "danger",
    signiaId: owner.id,
    signiaName: getBestPersonName(owner) || owner.name || `Signia #${owner.id}`,
    signiaEmail: owner.email || "",
  };
}

export function getConfidence(score = 0, metrics = {}) {
  if (metrics.exactEmail || score >= 95) return "high";
  if (metrics.viable || score >= 80) return "medium";
  if (score >= 55) return "low";
  return "weak";
}

export function buildManualReasons({ metrics = {}, queryScore = 0, score = 0, tests, linkStatus }) {
  const reasons = [];

  if (metrics.exactEmail) reasons.push("Correo exacto");
  if (metrics.viable) {
    reasons.push(
      metrics.matchedCount
        ? `Nombre compatible (${metrics.matchedCount} tokens)`
        : "Nombre compatible",
    );
  } else if (score >= 80) {
    reasons.push("Nombre parecido");
  }

  if (queryScore >= 90) reasons.push("Coincide con la búsqueda");
  else if (queryScore >= 65) reasons.push("Coincide parcialmente con la búsqueda");

  if (tests?.eco && tests?.mmpi) reasons.push("Tiene ECO y MMPI");
  else if (tests?.eco) reasons.push("Tiene ECO");
  else if (tests?.mmpi) reasons.push("Tiene MMPI");

  if (linkStatus?.state === "linked_to_current") reasons.push("Ya está vinculado a este Signia");
  if (linkStatus?.state === "linked_to_other") {
    reasons.push(`Conflicto: pertenece a ${linkStatus.signiaName || "otro Signia"}`);
  }

  return Array.from(new Set(reasons)).slice(0, 5);
}

export function buildManualCandidatePayload({
  entry,
  candidateId,
  name,
  email,
  ownerMap,
  currentSigniaId,
  tests,
  extra = {},
}) {
  const linkStatus = getManualLinkStatus({ candidateId, ownerMap, currentSigniaId });
  const score = entry.displayScore || 0;
  const confidence = getConfidence(score, entry.metrics || {});
  const requiresConfirmation = linkStatus.state === "linked_to_other" || confidence === "weak";
  const canLink = linkStatus.state !== "linked_to_current";

  return {
    cid: candidateId,
    label: `${name || `#${candidateId}`}${email ? ` <${email}>` : ""}`,
    name: name || `#${candidateId}`,
    email: email || "",
    score,
    confidence,
    exactEmail: Boolean(entry.metrics?.exactEmail),
    viable: Boolean(entry.metrics?.viable),
    metrics: entry.metrics || {},
    queryScore: entry.queryScore || 0,
    reasons: buildManualReasons({
      metrics: entry.metrics || {},
      queryScore: entry.queryScore || 0,
      score,
      tests,
      linkStatus,
    }),
    linkStatus,
    tests: tests || null,
    actions: {
      canLink,
      requiresConfirmation,
      disabledReason: canLink ? "" : "Este registro ya está vinculado al Signia actual.",
    },
    requiresConfirmation,
    canLink,
    ...extra,
  };
}
