const DEFAULT_SAMPLE_LIMIT = Number(process.env.EMAIL_MATCH_DEBUG_SAMPLE || 40);

function normalizeDebugEmail(value = "") {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function simpleHash(value = "") {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function maskEmail(value = "") {
  const email = normalizeDebugEmail(value);
  const [local = "", domain = ""] = email.split("@");
  if (!email || !domain) return email ? "***" : "";
  const localMasked = local.length <= 2 ? `${local[0] || ""}***` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return `${localMasked}@${domain}`;
}

function cleanForJson(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(cleanForJson);
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "function" || item === undefined) continue;
      out[key] = cleanForJson(item);
    }
    return out;
  }
  return value;
}

function extractDomain(email = "") {
  const parts = String(email || "").split("@");
  return parts.length > 1 ? parts.pop() : "";
}

export function createEmailMatchDebugger(options = {}) {
  const enabled = Boolean(options.enabled || process.env.EMAIL_MATCH_DEBUG === "1");
  const includePii = Boolean(options.includePii || process.env.EMAIL_MATCH_DEBUG_PII === "1");
  const sampleLimit = Number(options.sampleLimit || DEFAULT_SAMPLE_LIMIT || 40);
  const traceId = options.traceId || `email-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const focusEmail = normalizeDebugEmail(options.focusEmail || "");
  const focusSigniaId = options.focusSigniaId === undefined || options.focusSigniaId === null ? "" : String(options.focusSigniaId);
  const label = options.label || "bulk-email-sync";
  const events = [];
  const counters = {};
  const samples = {};

  function emit(event, payload = {}, { force = false, sampleKey = null } = {}) {
    if (!enabled && !force) return;
    const line = cleanForJson({
      tag: "EVAPATH_EMAIL_MATCH_DEBUG",
      traceId,
      label,
      event,
      ts: new Date().toISOString(),
      ...payload,
    });

    if (!sampleKey || (samples[sampleKey] || 0) < sampleLimit) {
      if (sampleKey) samples[sampleKey] = (samples[sampleKey] || 0) + 1;
      events.push(line);
      try {
        console.log(JSON.stringify(line));
      } catch {
        console.log("EVAPATH_EMAIL_MATCH_DEBUG", line);
      }
    }
  }

  function inc(name, amount = 1) {
    counters[name] = Number(counters[name] || 0) + Number(amount || 0);
  }

  function set(name, value) {
    counters[name] = value;
  }

  function emailSnapshot(email) {
    const normalized = normalizeDebugEmail(email);
    return {
      value: includePii ? normalized : undefined,
      masked: maskEmail(normalized),
      hash: simpleHash(normalized),
      domain: extractDomain(normalized),
      length: normalized.length,
    };
  }

  function candidateSnapshot(candidate = {}, email = "") {
    return {
      id: candidate?.id || candidate?.CID || null,
      name: candidate?.name || candidate?.nombre || candidate?.N || null,
      status: candidate?.status || candidate?.estado || candidate?.D || null,
      date: candidate?.fechaProceso || candidate?.processDate || candidate?.PD || null,
      email: emailSnapshot(email || candidate?.email || candidate?.correo || candidate?.M || ""),
      keys: Object.keys(candidate || {}).slice(0, 30),
    };
  }

  function userSnapshot(user = {}, email = "") {
    return {
      signiaId: user?.id ?? null,
      name: user?.name || user?.fullName || [user?.nombres, user?.apellidoPaterno, user?.apellidoMaterno].filter(Boolean).join(" ") || null,
      evaId: user?.evaId ?? null,
      pathId: user?.pathId ?? null,
      isActive: user?.isActive ?? 1,
      email: emailSnapshot(email || user?.email || ""),
    };
  }

  function isFocusEmail(email) {
    if (!focusEmail) return false;
    return normalizeDebugEmail(email) === focusEmail;
  }

  function isFocusUser(user) {
    if (focusSigniaId && String(user?.id) === focusSigniaId) return true;
    if (focusEmail) {
      const email = normalizeDebugEmail(user?.email || user?.correo || user?.mail || "");
      return email === focusEmail;
    }
    return false;
  }

  function snapshot() {
    return cleanForJson({
      traceId,
      label,
      enabled,
      includePii,
      focusEmail: focusEmail ? emailSnapshot(focusEmail) : null,
      focusSigniaId: focusSigniaId || null,
      counters,
      events,
      sampleLimit,
    });
  }

  return {
    enabled,
    includePii,
    traceId,
    focusEmail,
    focusSigniaId,
    emit,
    inc,
    set,
    emailSnapshot,
    candidateSnapshot,
    userSnapshot,
    isFocusEmail,
    isFocusUser,
    snapshot,
  };
}
