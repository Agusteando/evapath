# Vinculación pending exports and manual search

## Pending CSV exports

Resumen now includes CSV export buttons for pending EVA, pending PATH, and critical missing-both panels. The export contains the same active Signia users shown in the panel and includes a `Motivo` column.

The EVA motive is derived from the authoritative email diagnostic:

- `EVA registrado por email; pruebas incompletas / sin CID usable`: the email exists in EVA, but the EVA row does not expose a usable CID. In operational terms, the Evaluatest user appears registered but has not completed the required test flow/dictamen.
- `Sin registro EVA por email`: no EVA email record was found for that active Signia user.
- `Coincidencia EVA por email lista para vincular #...`: EVA has a unique usable email match.
- Conflict motives are exported when duplicate active Signia emails or duplicate usable EVA/PATH candidates prevent an automatic decision.

PATH motives follow the same pattern for direct PATH email availability.

## Asociación Manual suggestions

The default EVA/PATH suggestion search now starts from the first word of the Signia user's name. It falls back to email only when no name token is available.

Suggestion requests are request-scoped and abortable, so late responses from a previous user can no longer overwrite the current user's suggestion lists.
