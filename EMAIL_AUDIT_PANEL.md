# Email audit panel

`Coincidencias directas por email` now returns a bounded diagnostic instead of rendering every indexed email.

Default behavior:
- shows aggregate counts
- shows only real matched rows when they exist
- does not send the full Signia/EVA/PATH email universe to the browser

Search behavior:
- the search box calls `/api/bulk-sync?auditSearch=<query>&auditLimit=40`
- the backend filters Signia pending emails, EVA emails, and PATH emails server-side
- each source is capped at 40 rows per request
- matched rows are highlighted in the UI

This is diagnostic-only. Bulk email matching and the background auto email sync still use the same shared matcher and do not depend on the UI search panel.
