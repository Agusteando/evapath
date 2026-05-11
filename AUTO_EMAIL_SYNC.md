# Auto email-match sync

EvaPath starts the server-side job from the node-only auto email sync API/status route. This avoids loading EVA/Puppeteer from Next.js instrumentation while still keeping one scheduler alive in a persistent Node server process after the app is accessed. The job checks every 2 hours for pending Signia users that can be linked by direct email match and applies those links automatically.

Behavior:

- Source: pending Signia users without `evaId`, `pathId`, or both.
- Match rule: normalized direct email match using `LOWER(TRIM(email))` semantics.
- EVA target: existing EVA user email, when EVA is ready.
- PATH target: existing PATH `candidatos.email`.
- Apply rule: only missing links are written. Existing `evaId` or `pathId` values are not overwritten.
- Status persistence: stored in PATH DB table `auto_email_sync_status`.

Resumen reads:

```text
GET /api/auto-email-sync/status
```

The response includes `nextRunAt`, `lastExecutedAt`, `lastSuccess`, `status`, and the last applied counts. The UI intentionally shows only the next auto run, last executed time, and status.

Optional environment variables:

```text
AUTO_EMAIL_SYNC_DISABLED=1          # disables scheduler
AUTO_EMAIL_SYNC_INTERVAL_MS=7200000 # default: 2 hours
AUTO_EMAIL_SYNC_CHECK_MS=60000      # default scheduler poll: 1 minute
AUTO_EMAIL_SYNC_EVA_WAIT_MS=45000   # default EVA wait per run
```
