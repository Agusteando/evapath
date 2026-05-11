const EMAIL_FIELD_NAMES = [
  "email",
  "correo",
  "mail",
  "Email",
  "Correo",
  "Mail",
  "M",
  "m",
  "candidateEmail",
  "CandidateEmail",
];

export function normalizeEmail(value) {
  const raw = String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toLowerCase();

  const bracketMatch = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
  const email = bracketMatch ? bracketMatch[1] : raw;

  return email.replace(/\s+/g, "");
}

export function emailsEqual(a, b) {
  const left = normalizeEmail(a);
  const right = normalizeEmail(b);
  return Boolean(left && right && left === right);
}

function firstEmail(record = {}, fields = []) {
  for (const field of fields) {
    const value = normalizeEmail(record?.[field]);
    if (value) return value;
  }
  return "";
}

export function getSigniaEmail(user = {}) {
  return firstEmail(user, ["email", "correo", "mail", "Email", "Correo", "M", "m"]);
}

export function getEvaEmail(user = {}) {
  return firstEmail(user, ["correo", "M", "m", "email", "Email", "Correo", "mail", "Mail"]);
}

export function getPathEmail(user = {}) {
  return firstEmail(user, ["email", "correo", "Email", "Correo", "mail", "Mail", "M", "m"]);
}

export function getAnyRecordEmail(record = {}) {
  return firstEmail(record, EMAIL_FIELD_NAMES);
}

export function hasExactEmailMatch(left = {}, right = {}, leftGetter = getSigniaEmail, rightGetter = getPathEmail) {
  return emailsEqual(leftGetter(left), rightGetter(right));
}
