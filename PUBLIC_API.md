# EvaPath public dictamen API

These endpoints are intentionally tokenless. They are meant for trusted network-level consumers that only know a Signia user id and need to check or fetch the linked EVA/PATH dictamen.

Base parameter: `signiaId` is the `user.id` from Signia.

## Quick availability lookup

Use these endpoints before requesting a PDF. They do not download or generate the dictamen.

```http
GET /api/public/signia/{signiaId}/available
GET /api/public/signia/{signiaId}/eva/available
GET /api/public/signia/{signiaId}/path/eco/available
GET /api/public/signia/{signiaId}/path/mmpi/available
```

A successful lookup returns JSON like:

```json
{
  "ok": true,
  "available": true,
  "linked": true,
  "code": "PATH_DICTAMEN_AVAILABLE",
  "signia": { "id": 123, "email": "user@example.com", "name": "Nombre", "evaId": 456, "pathId": 789 },
  "dictamen": {
    "system": "PATH",
    "type": "eco",
    "label": "ECO",
    "sourceId": 789,
    "endpoint": "https://evapath.example.com/api/public/signia/123/path/eco/dictamen"
  }
}
```

Important response codes in the JSON payload:

- `SIGNIA_NOT_FOUND`: no Signia user exists for that id.
- `NO_EVA_LINK`: the Signia user has no `evaId`.
- `NO_PATH_LINK`: the Signia user has no `pathId`.
- `EVA_NOT_READY`: the EVA service is still initializing. Retry later or call the EVA dictamen endpoint with a long client timeout.
- `EVA_CANDIDATE_NOT_FOUND`: the stored `evaId` is not present in the current EVA cache.
- `PATH_DICTAMEN_NOT_FOUND`: the PATH link exists, but no completed PDF is available for that PATH type.
- `EVA_DICTAMEN_AVAILABLE` / `PATH_DICTAMEN_AVAILABLE`: the dictamen can be requested.

## Fetch the dictamen PDF

These endpoints return `application/pdf` inline when available.

```http
GET /api/public/signia/{signiaId}/eva/dictamen
GET /api/public/signia/{signiaId}/path/eco/dictamen
GET /api/public/signia/{signiaId}/path/mmpi/dictamen
```

PATH PDFs are fetched from the existing PATH result file location using the linked `pathId` and latest completed `pruebas` record for the requested type.

EVA PDFs can take longer. The EVA endpoint keeps the HTTP request open while EvaPath waits for the EVA service to become ready and then calls the existing `eva.downloadPDF(evaId)` flow. Clients integrating with this endpoint should use a long request timeout, ideally 4 to 5 minutes, and should not assume the request is failed just because it takes longer than a normal lookup.

Example client pattern:

```js
async function getEvaDictamen(baseUrl, signiaId) {
  const availability = await fetch(`${baseUrl}/api/public/signia/${signiaId}/eva/available`, {
    cache: "no-store",
  }).then((res) => res.json());

  if (!availability.available && availability.code !== "EVA_NOT_READY") {
    return availability;
  }

  const pdfResponse = await fetch(`${baseUrl}/api/public/signia/${signiaId}/eva/dictamen`, {
    signal: AbortSignal.timeout(300000),
  });

  if (!pdfResponse.ok) {
    return pdfResponse.json();
  }

  return pdfResponse.arrayBuffer();
}
```

## Public EVA API for tgbot

These endpoints are also intentionally tokenless and are read-only. They are designed so external consumers such as `tgbot` can use EvaPath as the single EVA service instead of launching their own Puppeteer/Evaluatest session.

### Status

```http
GET /api/public/eva/status
GET /api/public/eva/status?wait=1
```

Returns the current EVA cache status:

```json
{
  "ok": true,
  "ready": true,
  "status": "ready",
  "users": 123,
  "lastUpdatedAt": "2026-06-02T18:00:00.000Z",
  "lastUpdatedCount": 123,
  "cacheWindowMonths": 3
}
```

### Search candidates

```http
GET /api/public/eva/search?q=nombre%20correo%20puesto&months=3&limit=30
GET /api/public/eva/search?mode=recent&evaluated=1&limit=15
```

The response returns normalized candidate rows compatible with the bot flow:

```json
{
  "ok": true,
  "ready": true,
  "total": 1,
  "count": 1,
  "items": [
    {
      "CID": 123,
      "JID": 456,
      "N": "Nombre Candidato",
      "M": "correo@example.com",
      "D": "Evaluado",
      "PD": "2026-06-02",
      "JN": "Puesto",
      "key": "Nombre Candidato *Puesto*",
      "dictamenEndpoint": "https://evapath.example.com/api/public/eva/candidates/123/dictamen"
    }
  ]
}
```

By default the search uses the current EVA cache window, normally 3 months. Use `all=1` only for trusted internal callers that need to search every candidate currently loaded in memory.

### Check or download a candidate dictamen

```http
GET /api/public/eva/candidates/{cid}/available
GET /api/public/eva/candidates/{cid}/dictamen
```

The `dictamen` endpoint waits for EVA to be ready and then streams `application/pdf`. It returns JSON errors for not-ready, not-found, not-evaluated, or download-failed states. Clients should use a long timeout, normally 4 to 5 minutes.

### Public EVA operations for tgbot

These endpoints are intentionally tokenless because `tgbot` is being downgraded to a relay. EvaPath remains the only process that talks to Evaluatest.

```http
GET /api/public/eva/puestos?q=<filtro>&limit=100
GET /api/public/eva/puestos/{puestoId}
POST /api/public/eva/invite
POST /api/public/eva/postulacion
```

`/invite` posts the candidate to EVA and sends the Evaluatest invitation email. `/postulacion` posts the candidate to EVA without sending the email unless `sendEmail: true` is explicitly provided.

Body:

```json
{
  "name": "Nombre Candidato",
  "email": "correo@example.com",
  "puestoId": 23490
}
```

Successful response:

```json
{
  "ok": true,
  "success": true,
  "system": "EVA",
  "action": "invite",
  "puestoId": 23490,
  "evalCode": "ABC123",
  "link": "https://...",
  "emailSent": true
}
```
