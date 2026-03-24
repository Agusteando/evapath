
/**
 * Shared name-matching utilities for EVA and ECO/MMPI pipelines.
 * Implements strict per-word matching with ≥2/3 coverage and
 * high per-word similarity, plus a global similarity and email signal.
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

/**
 * Normalize a string for robust person-name comparison:
 * - lowercase
 * - remove diacritics
 * - strip punctuation to spaces
 * - collapse whitespace
 */
export function normalizeString(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a name into meaningful tokens, removing very short tokens
 * and common Spanish connectors (de, del, la, etc.).
 */
export function tokenizeName(name) {
  const norm = normalizeString(name);
  if (!norm) return [];
  return norm
    .split(" ")
    .filter(
      (tok) => tok && tok.length > 1 && !STOP_WORDS.has(tok)
    );
}

/**
 * Classic Levenshtein distance used for similarity on short strings.
 */
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
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[len1][len2];
}

/**
 * Normalized similarity between two short words: 0–1.
 */
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

/**
 * Global string similarity (0–100) using Levenshtein.
 */
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

/**
 * Greedy per-word matching:
 * - each token in A (Signia) picks the best unused token in B (candidate)
 * - only matches with similarity >= perWordThreshold are counted
 */
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
      const b = tokensB[j];
      const sim = wordSimilarity(a, b);
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

/**
 * Compute a rich, strict name-match score (0–100) and viability flag
 * between a Signia user and a candidate (EVA or PATH).
 *
 * Options allow tuning thresholds, but defaults are:
 * - coverageThreshold: 0.66 (2/3 of Signia tokens)
 * - perWordThreshold: 0.86 (high per-word similarity)
 */
export function computeNameMatchScore(
  signiaName,
  candidateName,
  signiaEmail,
  candidateEmail,
  {
    coverageThreshold = 0.66,
    perWordThreshold = 0.86,
  } = {}
) {
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
      viable: false,
    };
  }

  const { matchedCount, coverageA, avgWordSim } = matchTokens(
    tokensA,
    tokensB,
    perWordThreshold
  );

  // Require at least 2/3 of Signia tokens to be matched (rounded)
  const minRequiredMatches = Math.max(
    1,
    Math.round((tokensA.length * 2) / 3)
  );

  // Global similarity using sorted tokens (order-insensitive)
  const sortedA = tokensA.slice().sort().join(" ");
  const sortedB = tokensB.slice().sort().join(" ");
  const globalSim = stringSimilarity(sortedA, sortedB); // 0–100

  // Email local-part similarity as an extra hint
  let emailScore = 0;
  if (signiaEmail && candidateEmail) {
    const e1 = normalizeString(signiaEmail.split("@")[0]);
    const e2 = normalizeString(candidateEmail.split("@")[0]);
    if (e1 && e2) {
      emailScore = stringSimilarity(e1, e2); // 0–100
    }
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
      viable: false,
    };
  }

  // Weighted final score (0–100)
  const coverageScore = coverageA * 100;
  const perWordScore = avgWordSim * 100;

  const score = Math.round(
    coverageScore * 0.55 + // coverage dominates
      perWordScore * 0.25 + // average per-token similarity
      globalSim * 0.15 + // global sorted-name similarity
      emailScore * 0.05 // email hint
  );

  return {
    score,
    coverageA,
    matchedCount,
    avgWordSim,
    globalSim,
    emailScore,
    viable: true,
  };
}
