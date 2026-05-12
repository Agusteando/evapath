# Email audit panel

`Vinculación > Resumen > Coincidencias directas por email` now renders a compact email audit directly in the frontend.

It compares only active Signia users that are still missing EVA and/or PATH against the EVA and PATH email universes used by the direct-email workflow.

The panel includes:

- pending Signia emails
- EVA emails
- PATH emails
- a shared search input across all three sources
- highlighted rows where a pending Signia email exists in EVA or PATH
- a visible marker when an EVA/PATH email exists but has no usable ID for linking

Auto-Similitud now excludes exact-email matches. Exact email cases belong in the direct-email area first, including the audit panel when they are not directly applicable.
