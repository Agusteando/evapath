# Debug de coincidencias directas por email

Se agregó instrumentación parseable para diagnosticar por qué una coincidencia exacta por email aparece en Auto-Similitud pero no aparece en `Coincidencias directas por email`.

## Activar debug sin cambiar código

Para una revisión puntual desde el navegador o Postman:

```text
GET /api/bulk-sync?debug=1&signiaId=862
GET /api/bulk-sync?debug=1&email=cristian.amates@gmail.com
```

Para incluir emails completos en el JSON/logs:

```text
GET /api/bulk-sync?debug=1&email=cristian.amates@gmail.com&pii=1
```

Sin `pii=1`, los emails salen enmascarados y con hash estable.

## Activar debug global en servidor

```env
EMAIL_MATCH_DEBUG=1
EMAIL_MATCH_DEBUG_SAMPLE=80
EMAIL_MATCH_DEBUG_PII=0
```

Con `EMAIL_MATCH_DEBUG=1`, el cálculo manual de `/api/bulk-sync` y el job automático imprimen líneas JSON parseables en consola con esta marca:

```text
EVAPATH_EMAIL_MATCH_DEBUG
```

## Qué copiar para análisis

Copiar las líneas completas que contienen `EVAPATH_EMAIL_MATCH_DEBUG`, especialmente estas etapas:

```text
email_opportunity_start
signia_loaded
focus_signia_user_loaded
eva_status_before_wait
eva_status_after_wait
eva_index_complete
focus_eva_candidate_indexed
path_index_complete
email_match_user_accepted_or_candidate
email_match_user_rejected
opportunity_complete
email_opportunity_end
```

## Métricas importantes

El debug reporta:

- usuarios Signia activos cargados
- usuarios Signia con email utilizable
- pendientes sin EVA / sin PATH / sin ambos
- estado de EVA antes y después de esperar
- candidatos EVA leídos
- candidatos EVA con email utilizable
- candidatos EVA sin `CID`
- emails EVA únicos indexados
- grupos EVA con email duplicado
- candidatos PATH leídos e indexados
- intersecciones exactas antes de revisar disponibilidad
- rechazos por candidato ya vinculado a otro Signia activo
- matches finales aceptados

Esto permite distinguir entre estas fallas:

1. EVA no estaba lista.
2. El candidato exacto no llegó desde `eva.getUsers()`.
3. El candidato llegó, pero sin email utilizable.
4. El candidato llegó, pero sin `CID`.
5. El email sí intersectó, pero fue rechazado por estar vinculado a otro Signia activo.
6. El match sí fue encontrado, pero el `UPDATE` no aplicó porque el usuario ya no estaba pendiente o activo.
