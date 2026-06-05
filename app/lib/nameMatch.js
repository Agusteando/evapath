import { normalizeEmail } from "./emailIdentity.js";

/**
 * Shared name-matching utilities for EVA and ECO/MMPI pipelines.
 * The same scoring is used by manual search, Auto-Similitud, and bulk name sync.
 */

const STOP_WORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "y",
  "e",
  "da",
  "do",
  "dos",
  "das",
]);

export function normalizeString(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeName(name) {
  const norm = normalizeString(name);
  if (!norm) return [];
  return norm
    .split(" ")
    .filter((tok) => tok && tok.length > 1 && !STOP_WORDS.has(tok));
}

function firstPresent(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

export function buildStructuredPersonName(record = {}) {
  return [
    firstPresent(record, ["nombres", "nombre", "firstName"]),
    firstPresent(record, ["apellidoPaterno", "apellidopaterno", "lastName", "paterno"]),
    firstPresent(record, ["apellidoMaterno", "apellidomaterno", "materno"]),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getBestPersonName(record = {}) {
  const structured = buildStructuredPersonName(record);
  const fallback = firstPresent(record, ["fullName", "name", "nombre", "N", "label"]);
  if (!structured) return fallback.trim();
  if (!fallback) return structured.trim();

  const structuredTokenCount = tokenizeName(structured).length;
  const fallbackTokenCount = tokenizeName(fallback).length;
  return (fallbackTokenCount > structuredTokenCount ? fallback : structured).trim();
}

export function levenshteinDistance(str1, str2) {
  const a = str1 || "";
  const b = str2 || "";
  const len1 = a.length;
  const len2 = b.length;
  if (!len1 && !len2) return 0;
  const matrix = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[len1][len2];
}

export function wordSimilarity(a, b) {
  const s1 = normalizeString(a);
  const s2 = normalizeString(b);
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const maxLen = Math.max(s1.length, s2.length);
  if (!maxLen) return 1;
  const dist = levenshteinDistance(s1, s2);
  return (maxLen - dist) / maxLen;
}

export function stringSimilarity(str1, str2) {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  if (!s1 && !s2) return 100;
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 100;
  const maxLen = Math.max(s1.length, s2.length);
  if (!maxLen) return 100;
  const dist = levenshteinDistance(s1, s2);
  return Math.round(((maxLen - dist) / maxLen) * 100);
}

function matchTokens(tokensA, tokensB, perWordThreshold) {
  const usedB = new Set();
  let matchedCount = 0;
  let sumWordSim = 0;

  for (let i = 0; i < tokensA.length; i++) {
    const a = tokensA[i];
    let bestSim = 0;
    let bestIndex = -1;

    for (let j = 0; j < tokensB.length; j++) {
      if (usedB.has(j)) continue;
      const sim = wordSimilarity(a, tokensB[j]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIndex = j;
      }
    }

    if (bestSim >= perWordThreshold && bestIndex !== -1) {
      matchedCount++;
      sumWordSim += bestSim;
      usedB.add(bestIndex);
    }
  }

  const coverageA = tokensA.length ? matchedCount / tokensA.length : 0;
  const avgWordSim = matchedCount ? sumWordSim / matchedCount : 0;
  return { matchedCount, coverageA, avgWordSim };
}

export function computeNameMatchScore(
  signiaName,
  candidateName,
  signiaEmail,
  candidateEmail,
  { coverageThreshold = 0.66, perWordThreshold = 0.86 } = {},
) {
  const normalizedSigniaEmail = normalizeEmail(signiaEmail);
  const normalizedCandidateEmail = normalizeEmail(candidateEmail);
  const exactEmail = Boolean(
    normalizedSigniaEmail &&
      normalizedCandidateEmail &&
      normalizedSigniaEmail === normalizedCandidateEmail,
  );

  if (exactEmail) {
    return {
      score: 100,
      coverageA: 1,
      matchedCount: tokenizeName(signiaName).length || 1,
      avgWordSim: 1,
      globalSim: stringSimilarity(signiaName, candidateName),
      emailScore: 100,
      exactEmail: true,
      viable: true,
    };
  }

  const tokensA = tokenizeName(signiaName);
  const tokensB = tokenizeName(candidateName);

  if (!tokensA.length || !tokensB.length) {
    return {
      score: 0,
      coverageA: 0,
      matchedCount: 0,
      avgWordSim: 0,
      globalSim: 0,
      emailScore: 0,
      exactEmail: false,
      viable: false,
    };
  }

  const { matchedCount, coverageA, avgWordSim } = matchTokens(
    tokensA,
    tokensB,
    perWordThreshold,
  );

  const minRequiredMatches = Math.max(1, Math.ceil(tokensA.length * coverageThreshold));
  const sortedA = tokensA.slice().sort().join(" ");
  const sortedB = tokensB.slice().sort().join(" ");
  const globalSim = stringSimilarity(sortedA, sortedB);

  let emailScore = 0;
  if (signiaEmail && candidateEmail) {
    const e1 = normalizeString(signiaEmail.split("@")[0]);
    const e2 = normalizeString(candidateEmail.split("@")[0]);
    if (e1 && e2) emailScore = stringSimilarity(e1, e2);
  }

  const viable =
    matchedCount >= minRequiredMatches &&
    coverageA >= coverageThreshold &&
    avgWordSim >= perWordThreshold;

  if (!viable) {
    return {
      score: 0,
      coverageA,
      matchedCount,
      avgWordSim,
      globalSim,
      emailScore,
      exactEmail: false,
      viable: false,
    };
  }

  const coverageScore = coverageA * 100;
  const perWordScore = avgWordSim * 100;
  const score = Math.round(
    coverageScore * 0.55 +
      perWordScore * 0.25 +
      globalSim * 0.15 +
      emailScore * 0.05,
  );

  return {
    score,
    coverageA,
    matchedCount,
    avgWordSim,
    globalSim,
    emailScore,
    exactEmail: false,
    viable: true,
  };
}

function queryScore(query, candidateName, candidateEmail = "", candidateText = "") {
  const normalizedQuery = normalizeString(query);
  if (!normalizedQuery) return 0;

  const haystack = normalizeString(
    [candidateName, candidateEmail, candidateText].filter(Boolean).join(" "),
  );
  if (!haystack) return 0;
  if (haystack.includes(normalizedQuery)) return 100;

  const queryTokens = tokenizeName(normalizedQuery);
  if (!queryTokens.length) return 0;
  const haystackTokens = tokenizeName(haystack);
  if (!haystackTokens.length) return 0;

  let matched = 0;
  let sum = 0;
  for (const qToken of queryTokens) {
    let best = 0;
    for (const hToken of haystackTokens) {
      best = Math.max(best, wordSimilarity(qToken, hToken));
    }
    if (best >= 0.82) matched += 1;
    sum += best;
  }

  const coverage = matched / queryTokens.length;
  const average = sum / queryTokens.length;
  return Math.round((coverage * 0.7 + average * 0.3) * 100);
}

export function rankPersonCandidates({
  signiaUser,
  signiaName,
  signiaEmail,
  candidates = [],
  query = "",
  excludedIds = [],
  getCandidateId = (candidate) => candidate.id,
  getCandidateName = (candidate) => getBestPersonName(candidate),
  getCandidateEmail = (candidate) => candidate.email || candidate.correo || candidate.M || "",
  getCandidateText = () => "",
  limit = 20,
  minScore = 0,
  includeWeakTextMatches = true,
} = {}) {
  const resolvedSigniaName = (signiaName || getBestPersonName(signiaUser) || "").trim();
  const resolvedSigniaEmail = signiaEmail || signiaUser?.email || "";
  const excludedSet = new Set((excludedIds || []).map((id) => String(id)));

  const ranked = [];
  for (const candidate of candidates || []) {
    const id = getCandidateId(candidate);
    if (!id || excludedSet.has(String(id))) continue;

    const candidateName = getCandidateName(candidate);
    const candidateEmail = getCandidateEmail(candidate);
    const candidateText = getCandidateText(candidate);
    const metrics = computeNameMatchScore(
      resolvedSigniaName,
      candidateName,
      resolvedSigniaEmail,
      candidateEmail,
      { coverageThreshold: 0.5, perWordThreshold: 0.82 },
    );
    const qScore = queryScore(query || resolvedSigniaName, candidateName, candidateEmail, candidateText);
    const displayScore = Math.max(metrics.score, qScore, metrics.exactEmail ? 100 : 0);

    if (
      displayScore < minScore &&
      !metrics.exactEmail &&
      !metrics.viable &&
      !(includeWeakTextMatches && qScore >= 70)
    ) {
      continue;
    }

    ranked.push({
      candidate,
      id,
      name: candidateName,
      email: candidateEmail,
      metrics,
      queryScore: qScore,
      displayScore,
    });
  }

  ranked.sort((a, b) => {
    if (b.metrics.exactEmail !== a.metrics.exactEmail) return b.metrics.exactEmail ? 1 : -1;
    if (b.metrics.viable !== a.metrics.viable) return b.metrics.viable ? 1 : -1;
    if (b.displayScore !== a.displayScore) return b.displayScore - a.displayScore;
    if (b.metrics.globalSim !== a.metrics.globalSim) return b.metrics.globalSim - a.metrics.globalSim;
    if (b.metrics.matchedCount !== a.metrics.matchedCount) return b.metrics.matchedCount - a.metrics.matchedCount;
    return a.name.localeCompare(b.name, "es");
  });

  return ranked.slice(0, limit);
}
