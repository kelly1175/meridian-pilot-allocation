# Backlog

Structured to match the epic's work breakdown. Each feature can be raised as a Jira feature, with its stories as child items. "Prototype" shows what the discovery prototype already demonstrates. It does not mean production-ready.

## F1 Validate workflow, rules and MVP boundary

| Story | Acceptance criteria | Prototype |
|---|---|---|
| F1.1 Map the current allocation process and baseline | Current-state process map agreed with allocators. Baseline captured for time to allocate, unallocated count and rework | — |
| F1.2 Agree allocation rules | D-02, D-03, D-12 resolved and signed off by the named rule authority | Placeholder rules in `rules.json` |
| F1.3 Confirm first operational area and MVP boundary | D-01, D-05, D-06 resolved. Out-of-scope list confirmed with architecture | — |
| F1.4 Run prototype sessions with allocators | Validation scenarios run with 3 or more allocators. Findings logged and backlog updated | Ready to run |

## F2 Movement and pilot data access

| Story | Acceptance criteria | Prototype |
|---|---|---|
| F2.1 Agree authoritative source per data type | Source, owner and update responsibility recorded for movements, pilot suitability and availability (D-04) | — |
| F2.2 Ingest movements | Movements in the agreed area and window appear on the board, keyed on the existing movement identifier | CSV import |
| F2.3 Ingest pilot suitability and availability | Limits, authorisations and availability are visible with last-updated time | Sample data |
| F2.4 Interim import with reconciliation | Rejected rows reported. Movements missing from a file are reported, not deleted. Owner and keep/replace decision recorded | ✅ |

## F3 Movement and availability views

| Story | Acceptance criteria | Prototype |
|---|---|---|
| F3.1 Movement board (AC1) | Filter by area, time window and unresolved. Shows allocation status per movement | ✅ |
| F3.2 Pilot availability view (AC2) | Duty, unavailability and assignments on a timeline. Stale availability flagged | ✅ |
| F3.3 Candidate assessment (AC2) | For a selected movement, each pilot shows eligible / warnings / exception needed / blocked, with reasons | ✅ |
| F3.4 Operational colleague view | Read-only. Confirmed assignments only | ✅ |

## F4 Allocation checks and assignment (AC3)

| Story | Acceptance criteria | Prototype |
|---|---|---|
| F4.1 Assign pilot as draft or confirmed | Allocator can assign an eligible pilot. Draft and confirmed are distinct | ✅ |
| F4.2 Blocking checks | Assignment is refused with reasons when a blocking check fails | ✅ |
| F4.3 Warnings | Allocator must acknowledge warnings. Warnings are stored on the allocation | ✅ |
| F4.4 Authorised exceptions | Only permitted roles can override. A reason is required and recorded | ✅ |

## F5 Reallocation, cancellation and change handling (AC4, AC5, AC6)

| Story | Acceptance criteria | Prototype |
|---|---|---|
| F5.1 Flag allocations on movement change | Time, size, route or cancellation changes flag the active allocation, with what changed | ✅ |
| F5.2 Flag allocations on availability change | New unavailability flags affected allocations that now fail checks | ✅ |
| F5.3 Review a flagged allocation | Reviewer can clear the flag only if the pilot still passes checks. Confirmation blocked until reviewed | ✅ |
| F5.4 Reallocate | Reason and category required. Previous allocation kept and linked | ✅ |
| F5.5 Cancel | Reason and category required. Record kept | ✅ |
| F5.6 Concurrent edits | Stale edits rejected with a reload prompt. No parallel allocations for one movement | ✅ |

## F6 Permissions and audit (AC8, AC9)

| Story | Acceptance criteria | Prototype |
|---|---|---|
| F6.1 Role-based access | Actions limited to the agreed role matrix (D-07) | ✅ placeholder roles |
| F6.2 Integrate identity service | Users authenticate with the agreed service (D-08) | Stub |
| F6.3 Audit trail | Every change records user, role, time, before/after and reason. Log is append-only | ✅ |
| F6.4 Allocation history view | Supervisor and allocator can see the full chain for a movement | ✅ |

## F7 Communication and acknowledgement (AC7, scope decision D-06)

| Story | Acceptance criteria | Prototype |
|---|---|---|
| F7.1 Communication status | Users can see sent / acknowledged / declined for confirmed assignments | ✅ manual, feature-flagged |
| F7.2 Decline handling | A decline flags the allocation for review | ✅ |
| F7.3 Notification channel | Pilot notified via the agreed channel | Not started — pending D-06 |

## F8 Operational validation, support and rollout (AC10)

| Story | Acceptance criteria | Prototype |
|---|---|---|
| F8.1 End-to-end scenarios | Marine operations completes the agreed scenarios, including late change, cancellation and unavailable pilot | Scripts ready |
| F8.2 Support readiness | Monitoring, support owner, incident procedure, fallback and recovery documented and exercised | — |
| F8.3 Training and guidance | User guidance published. Allocators trained | — |
| F8.4 Release approval and rollout | Approval recorded. Rollout to agreed area complete | — |

## F9 Measurement

| Story | Acceptance criteria | Prototype |
|---|---|---|
| F9.1 Metric definitions agreed | Definitions, baseline, targets, frequency and owners agreed (D-09) | Proposed definitions |
| F9.2 Metrics capture | Time to allocate, unallocated, rework by reason, adoption, exceptions available | ✅ |
| F9.3 Post-release review | Review scheduled and held | — |

## Test traceability

| AC | Tests (`test/allocation.test.js`) |
|---|---|
| AC1 | `AC1 movement visibility` (3) |
| AC2 | `AC2 pilot information` |
| AC3 | `AC3 allocation with agreed checks` (4) |
| AC4 | `AC4 change handling` (3) |
| AC5 | `AC5 reallocation and cancellation` (2) |
| AC6 | `AC6 concurrent working` (4) |
| AC7 | `AC7 status and communication` |
| AC8 | `AC8 auditability` (2) |
| AC9 | `AC9 access` + `test/http.test.js` |
| Import | `Tactical CSV import` |
