# API

All `/api` calls except `health`, `users` and `config` need the header `x-meridian-user: <user id>` (prototype identity stub).
Every write takes the record's `version`. A stale version returns `409 CONFLICT` with `details.current`.

| Method | Path | Permission | Body / query |
|---|---|---|---|
| GET | `/api/movements` | movements:view | `area`, `from`, `to`, `unresolved=1` |
| GET | `/api/movements/:id` | movements:view | Includes `allocations` and `history` with audit:view |
| PATCH | `/api/movements/:id` | movements:update | `{ version, changes: { scheduled_start, duration_minutes, loa_m, draught_m, status, ... } }` |
| GET | `/api/movements/:id/candidates` | pilots:view | — |
| POST | `/api/import/movements` | movements:import | CSV body |
| GET | `/api/pilots` | pilots:view | Returns `{ now, from, to, transitAllowanceMinutes, pilots }`. Assignment times come from the same functions the checks use |
| POST | `/api/pilots/:id/unavailability` | pilots:update_availability | `{ start, end, note }` |
| POST | `/api/allocations` | allocations:create | `{ movementId, pilotId, movementVersion?, confirm?, acceptWarnings?, overrideReason? }` |
| POST | `/api/allocations/:id/confirm` | allocations:confirm | `{ version }` |
| POST | `/api/allocations/:id/reallocate` | allocations:reallocate | `{ version, pilotId, reason, reasonCategory, confirm?, acceptWarnings?, overrideReason? }` |
| POST | `/api/allocations/:id/cancel` | allocations:cancel | `{ version, reason, reasonCategory }` |
| POST | `/api/allocations/:id/review` | allocations:review | `{ version, note? }` |
| POST | `/api/allocations/:id/communication` | allocations:comm | `{ version, status: SENT \| ACKNOWLEDGED \| DECLINED }`. SENT first, then a response. Simulated |
| GET | `/api/audit` | audit:view | `movementId?` |
| GET | `/api/metrics` | metrics:view | — |

## Allocation errors (422)

| Code | Meaning |
|---|---|
| `ALLOCATION_BLOCKED` | A blocking check failed that this role can't override. `details.checks` lists the results |
| `EXCEPTION_REASON_REQUIRED` | This role can override, but needs `overrideReason` |
| `WARNINGS_NOT_ACCEPTED` | Resend with `acceptWarnings: true` after review |
| `REVIEW_REQUIRED` | Clear the review flag before confirming |
| `CONFIRMATION_HELD` | A check that prevents confirmation is open (missing required data, trainee supervision). Drafts are still allowed |
