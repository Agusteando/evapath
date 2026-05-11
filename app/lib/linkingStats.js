export function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


export function isActiveSigniaUser(user = {}) {
  if (user.isActive === undefined || user.isActive === null) return true;
  if (user.isActive === true) return true;
  return String(user.isActive).trim() === "1";
}

export function hasEvaLink(user) {
  return Boolean(user?.hasEva || user?.evaId);
}

export function hasPathLink(user) {
  return Boolean(user?.hasPath || user?.pathId);
}

export function getMissingLinkType(user) {
  const withoutEva = !hasEvaLink(user);
  const withoutPath = !hasPathLink(user);

  if (withoutEva && withoutPath) return "both";
  if (withoutEva) return "eva";
  if (withoutPath) return "path";
  return "complete";
}

export function getVinculacionStats(users = []) {
  const base = (Array.isArray(users) ? users : []).filter(isActiveSigniaUser);

  return base.reduce(
    (acc, user) => {
      const withoutEva = !hasEvaLink(user);
      const withoutPath = !hasPathLink(user);

      acc.total += 1;
      if (withoutEva) acc.withoutEva += 1;
      if (withoutPath) acc.withoutPath += 1;
      if (withoutEva && withoutPath) acc.withoutBoth += 1;
      if (!withoutEva) acc.withEva += 1;
      if (!withoutPath) acc.withPath += 1;
      if (!withoutEva && !withoutPath) acc.complete += 1;

      return acc;
    },
    {
      total: 0,
      withoutEva: 0,
      withoutPath: 0,
      withoutBoth: 0,
      withEva: 0,
      withPath: 0,
      complete: 0,
    },
  );
}

export function getPrimarySearchValue(user = {}) {
  return (
    normalizeEmail(user.email) ||
    user.fullName ||
    user.name ||
    [user.nombres, user.apellidoPaterno, user.apellidoMaterno]
      .filter(Boolean)
      .join(" ")
  ).trim();
}
