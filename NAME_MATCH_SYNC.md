# High-confidence name-match sync

`Vinculación > Resumen` now shows a second mass-match opportunity area for high-confidence name matches (`95%+`) in addition to direct email matches.

The calculation runs on page load through:

```txt
GET /api/bulk-name-sync
```

The apply action uses:

```txt
POST /api/bulk-name-sync
Body: { "signiaIds": [123, 456] }
```

Safety rules:

- Only active Signia users are considered (`isActive = 1`).
- Only missing links are eligible; existing `evaId` or `pathId` values are never overwritten.
- Candidates already linked to another active Signia user are excluded.
- Ambiguous name results are excluded from the mass-apply list. If a Signia user has more than one possible 95%+ candidate in the same destination, that case remains for manual/Auto-Similitud review.
- EVA and PATH counts are calculated separately, with a combined count when both missing destinations can be linked safely.

Auto-Similitud was also tightened so it no longer suggests candidates that are already owned by another active Signia user during the sequential review flow. Reassignment/swap cases should be handled through manual review rather than the automatic suggestion queue.
