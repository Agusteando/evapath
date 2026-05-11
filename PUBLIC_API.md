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
