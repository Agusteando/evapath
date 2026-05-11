export function normalizeLinkId(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized === "0" || normalized.toLowerCase() === "null" || normalized.toLowerCase() === "undefined") {
    return null;
  }
  return normalized;
}

export function hasLinkValue(value) {
  return Boolean(normalizeLinkId(value));
}
