# Active Signia users only

EvaPath now treats `Signia.user.isActive = 1` as the required base condition for all Signia-facing calculations and workflows.

This affects:

- `/api/signia-users`
- `/api/signia-missing`
- Vinculación Resumen counts and pending lists
- Asociación Manual and Auto-Similitud input datasets
- direct email-match preview and bulk apply
- the two-hour automatic email-match sync job
- public dictamen availability/download endpoints
- EVA/PATH reverse match checks that look up Signia users by email or `pathId`
- association, disassociation, name update, and CURP upload actions

Inactive rows with `isActive = 0` are intentionally ignored rather than counted as pending, matchable, linked, or available. Direct write endpoints also reject inactive Signia IDs so inactive records cannot be linked or corrected through the app.
