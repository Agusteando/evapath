# Direct email-match correction

Direct email matching now uses a single normalization helper for Signia, EVA, and PATH emails:

- trims whitespace
- lowercases values
- removes zero-width Unicode characters
- supports the EVA/PATH field variants used across the app (`correo`, `M`, `email`, `Email`, etc.)

`/api/bulk-sync` continues to be the source of truth for direct email opportunities and now waits longer for EVA before returning the preview. If EVA is not ready when Resumen loads, Resumen retries the preview instead of treating EVA matches as a permanent zero.

Auto-Similitud now treats exact email equality as a 100% exact-email match. This prevents an exact email case from appearing as a weak name-only suggestion while waiting for the email-link job or manual bulk email apply.

Name-based 95% bulk matching intentionally excludes exact-email cases so those remain in the direct email-match flow.
