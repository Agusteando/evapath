export function normalizeEmail(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
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
  return firstEmail(user, ["email", "correo", "mail", "Email", "Correo", "M"]);
}

export function getEvaEmail(user = {}) {
  return firstEmail(user, ["correo", "M", "email", "Email", "Correo", "mail"]);
}

export function getPathEmail(user = {}) {
  return firstEmail(user, ["email", "correo", "Email", "Correo", "mail", "M"]);
}

export function hasExactEmailMatch(left = {}, right = {}, leftGetter = getSigniaEmail, rightGetter = getPathEmail) {
  return emailsEqual(leftGetter(left), rightGetter(right));
}
