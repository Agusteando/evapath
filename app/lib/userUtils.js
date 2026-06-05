/**
 * Canonical empty names object used by Linker when initializing
 * or resetting the editable name fields.
 */
export const EMPTY_NAMES = {
  nombres: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
};


export function isActiveSigniaUser(user = {}) {
  if (user.isActive === undefined || user.isActive === null) return true;
  if (user.isActive === true) return true;
  return String(user.isActive).trim() === "1";
}

/**
 * Returns true if a Signia user is missing any critical linkage information
 * required by the reconciliation / association process.
 */
export function isUserMissingAny(u) {
  return (
    !u.hasEva ||
    !u.hasPath ||
    !u.hasCurp ||
    !u.hasEco ||
    !u.hasMmpi ||
    u.missingApellido ||
    u.missingNombres
  );
}

/**
 * Filter Signia users by a high-level "missing data" category.
 *
 * Supported filters:
 * - "missing": any missing EVA / PATH / CURP / ECO / MMPI or name fields
 * - "nombres": only those with missing or incomplete names
 * - "eva": users without EVA association
 * - "path": users without PATH association
 * - "both": users without EVA and PATH association
 * - "eco": users without ECO/MMPI results
 * - "all": no missing-based filter (return all users)
 */
export function filterByMissingCategory(users, filter) {
  const activeUsers = (users || []).filter(isActiveSigniaUser);

  switch (filter) {
    case "missing":
      return activeUsers.filter(isUserMissingAny);
    case "nombres":
      return activeUsers.filter(
        (u) => u.missingNombres || u.missingApellido || u.missingNames,
      );
    case "eva":
      return activeUsers.filter((u) => !u.hasEva);
    case "path":
      return activeUsers.filter((u) => !u.hasPath);
    case "both":
      return activeUsers.filter((u) => !u.hasEva && !u.hasPath);
    case "eco":
      return activeUsers.filter((u) => !u.hasEco || !u.hasMmpi);
    case "all":
      return activeUsers;
    default:
      return activeUsers.filter(isUserMissingAny);
  }
}

/**
 * Combined filter used by the Asociar/Linker UI:
 * - First applies the missing-data category filter (see above).
 * - Then optionally filters by plantelId.
 * - Finally applies a text search over full name, email, CURP, and plantel label/name.
 *
 * This ensures navigation and UI counts all
 * operate over the same filtered subset of users.
 */
export function filterLinkerUsers(
  users,
  { categoryFilter = "missing", searchTerm = "", plantelId = "" } = {},
) {
  // 1) Base filter: missing category
  const base = filterByMissingCategory(users, categoryFilter);

  // 2) Optional plantel filter
  const plantelValue = plantelId ? String(plantelId) : "";
  const byPlantel = plantelValue
    ? base.filter((u) => String(u.plantelId || "") === plantelValue)
    : base;

  // 3) Text search across key fields
  const term = (searchTerm || "").toLowerCase().trim();
  if (!term) return byPlantel;

  return byPlantel.filter((u) => {
    const nameFull = (u.fullName || u.name || "").toLowerCase();
    const email = (u.email || "").toLowerCase();
    const curp = (u.curpExtract?.curp || "").toLowerCase();
    const plantelLabel = (u.plantelLabel || u.plantelName || "").toLowerCase();
    return (
      nameFull.includes(term) ||
      email.includes(term) ||
      curp.includes(term) ||
      plantelLabel.includes(term)
    );
  });
}

/**
 * Metadata for editable name fields, used by NamesEditBlock.
 */
export const FIELDS = [
  { name: "nombres", label: "Nombres" },
  { name: "apellidoPaterno", label: "Apellido Paterno" },
  { name: "apellidoMaterno", label: "Apellido Materno" },
];
