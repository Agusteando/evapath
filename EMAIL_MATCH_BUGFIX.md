# Email match bugfix

Direct email matching now indexes all EVA/PATH candidates for an email instead of keeping only the first candidate found.

This matters because EVA can expose multiple candidate rows with the same email across vacancies/processes. The previous matcher kept the first row for a normalized email and discarded the rest. If that first row was already owned, stale, or not the candidate shown in Auto-Similitud, Resumen and the background auto email job could incorrectly report `0` direct email matches even when Auto-Similitud clearly showed an exact email match.

The shared matcher now:

- normalizes Signia, EVA, and PATH emails consistently;
- stores multiple candidates per normalized email;
- chooses the first available, unowned candidate for the active Signia user;
- treats `null`, empty string, and `0` / `"0"` link values as missing;
- applies the same logic to Resumen, manual bulk email apply, and the two-hour background job.

Auto-Similitud remains a review tool. Exact email matches should now appear in `Coincidencias directas por email` first and be eligible for automatic email sync.
