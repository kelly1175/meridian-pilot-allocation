# Open decisions

The prototype makes an explicit, reversible assumption for each decision below so allocators can react to something concrete. None of these assumptions is agreed.

| ID | Decision needed | Prototype assumption | Where in code | Owner | Needed by |
|---|---|---|---|---|---|
| D-01 | Which port or operational area is first? | Single fictional port with two areas: `INNER`, `OUTER` | `seed.js`, `rules.json.operationalArea` | Susan / marine ops — TBC | Before discovery sessions |
| D-02 | What makes a pilot suitable and available? | Active, authorised for area, LOA and draught within limits, on duty for the whole movement, not unavailable, not double-booked | `rules.js` | Allocation rule authority — TBC | Before build of checks |
| D-03 | Which conditions block, warn or allow an authorised exception, and who can authorise? | Only "outside duty" can be overridden, by supervisors, with a reason. Rest gap, missing data and stale availability are warnings. Others block | `rules.json.checks` | Allocation rule authority — TBC | Before build of checks |
| D-04 | Authoritative movement source; how changes are received and reconciled | Changes arrive as updates keyed on `external_ref`; any material change flags the active allocation | `service.js` `applyMovementChange` | Architect + data owner — TBC | Before integration design |
| D-05 | Interim data approach if integration is unavailable | Controlled CSV import with reject list and "not in file" report. Nothing auto-deleted | `service.js` `importMovementsCsv` | PO + ops — TBC. Record keep/replace decision | Before MVP scope sign-off |
| D-06 | Is pilot acknowledgement or notification in MVP scope? | Manual communication status (sent / acknowledged / declined) behind a feature flag. No automated notifications | `rules.json.features.communicationStatus` | Susan + pilot representatives — TBC | Before MVP scope sign-off |
| D-07 | User roles and access boundaries | Viewer (confirmed only), Allocator, Supervisor (adds exceptions, data updates, metrics) | `roles.js` | Ops + security — TBC | Before access build |
| D-08 | Identity and access service | Stub header | `server.js` | Architect — TBC | Before any real-data use |
| D-09 | Metric definitions, baseline, targets, owners | Time to allocate = movement first seen → first confirmation. Adoption = confirmed in Meridian ÷ eligible | `service.js` `metrics` | PO — TBC | During discovery |
| D-10 | Technology and hosting | Zero-dependency Node + SQLite for the prototype only | ADR-0001 | Architect — TBC | Architecture review |
| D-11 | Service hours, SLOs, recovery objectives and fallback | None set | — | Ops + engineering + SRE — TBC | Before release planning |
| D-12 | Handling missing, outdated or conflicting information | Missing LOA/draught: draft allowed, confirmation prevented. Availability older than 24h = warning | `rules.json` | Allocation rule authority — TBC | Before build of checks |
| D-13 | Audit retention period and access | Kept indefinitely, append-only | `db.js` | Data owner / security — TBC | Before release |
| D-15 | Trainee pilot supervision requirements | Not modelled. Trainee assignments can be drafted, never confirmed, and no role can override | `rules.json` → `trainee` | Marine operations — TBC | Before build of checks |
| D-14 | Time window and board horizon | 2h back, 24h forward by default | `rules.json.boardWindowHours` | Allocators — TBC | Discovery sessions |

## Delivery note

31 March 2027 is a proposed, unconfirmed milestone. A delivery commitment needs agreed scope, estimates, capacity, dependencies and readiness criteria.
