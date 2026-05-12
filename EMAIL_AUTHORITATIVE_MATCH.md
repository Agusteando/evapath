# Email authoritative matching

`/api/bulk-sync` now treats a unique exact email match as the strongest linkage signal.

Behavior:

- Active Signia users only (`isActive=1`).
- Signia email is compared against EVA and PATH email indexes.
- A unique usable candidate ID by email creates missing links.
- A unique usable candidate ID by email overwrites stale/wrong existing links.
- If another active Signia user owns that candidate ID but has a different email, that stale owner is cleared and the email owner is linked.
- If multiple active Signia users share the same email, the row is a conflict.
- If multiple usable EVA/PATH candidates share the same email, the row is a conflict.
- If the source has the email but no usable ID, the row is skipped and shown as such.

The same shared logic powers Resumen manual apply and the automatic email-sync job.
