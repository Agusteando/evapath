
/**
 * Canonical empty names object used by Linker when initializing
 * or resetting the editable name fields.
 */
export const EMPTY_NAMES = {
  nombres: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
};

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
 * - "eco": users without ECO/MMPI results
 * - "all": no missing-based filter (return all users)
 */
export function filterByMissingCategory(users, filter) {
  switch (filter) {
    case "missing":
      return users.filter(isUserMissingAny);
    case "nombres":
      return users.filter(
        (u) => u.missingNombres || u.missingApellido || u.missingNames
      );
    case "eva":
      return users.filter((u) => !u.hasEva);
    case "eco":
      return users.filter((u) => !u.hasEco || !u.hasMmpi);
    case "all":
      return users;
    default:
      return users.filter(isUserMissingAny);
  }
}

/**
 * Combined filter used by the Asociar/Linker UI:
 * - First applies the missing-data category filter (see above).
 * - Then optionally filters by plantelId.
 * - Finally applies a text search over full name, email, CURP, and plantel label/name.
 *
 * This ensures navigation, GPT-bulk operations, and UI counts all
 * operate over the same filtered subset of users.
 */
export function filterLinkerUsers(
  users,
  {
    categoryFilter = "missing",
    searchTerm = "",
    plantelId = "",
  } = {}
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
