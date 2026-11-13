# Illustrative rules register

**None of these are approved operating rules.** They are sample values chosen so the prototype has something concrete for marine operations to react to. Each one needs validating (open decisions D-02, D-03, D-12 and D-15).

All values below are in `src/config/rules.json` unless the table says otherwise. Change the file and restart the app; no code changes are needed.

| Rule | Current sample value | Where | Effect in prototype | Status |
|---|---|---|---|---|
| Transit allowance | 30 min either side of an assignment | `transitAllowanceMinutes` | Overlap within it **blocks** (conflicts with another assignment). Shown as hatched margins on the timeline | Assumption |
| Minimum interval between assignments | 120 min | `minIntervalBetweenAssignmentsMinutes` | A shorter gap is a **warning** | Assumption |
| Pilot class limits (LOA / draught) | Class 1: 400 m / 16 m · Class 2: 250 m / 12 m · Class 3: 180 m / 9.5 m · Class 4: 120 m / 7 m | `pilotClassLimits` | Exceeding a limit **blocks** | Assumption |
| Area authorisations | Per pilot (for example, Garside is OUTER only) | `src/seed.js` (sample pilots) | An unauthorised area **blocks** | Sample data |
| Duty periods | Two 12-hour shift patterns relative to start-up, with a 2-hour cover gap | `src/seed.js` (sample duty) | Outside duty **blocks**, except a supervisor may authorise an exception with a reason | Sample data and assumption |
| Supervisor exceptions | Only "outside duty" is overridable, only by a supervisor, and a reason is required | `checks.OUTSIDE_DUTY.overridableBy` | No other check can be overridden | Assumption |
| Availability freshness | 24 hours | `availabilityFreshnessHours` | Older availability is a **warning** | Assumption |
| Missing required information | LOA and draught are required | `requiredMovementFields` | Draft allowed, **confirmation prevented**. Never treated as zero or as a pass | Prototype assumption |
| Trainee pilots | Supervision requirements not defined | `trainee` | Draft allowed, **confirmation prevented**. No role can override | Prototype assumption |

## Check effects

| Effect | Meaning in the UI |
|---|---|
| Passes configured checks | No configured check raised an issue. The allocator still decides |
| Warning | The allocator must acknowledge it before assigning |
| Prevents confirmation | Can be saved as a draft; can't be confirmed until resolved |
| Needs authorised exception | Blocked unless a permitted role gives a reason |
| Blocks | Can't be assigned |

## What the prototype deliberately does not model

- A real trainee supervision policy, such as who may supervise or which movements a trainee may do.
- Tidal windows, berth restrictions, vessel type, weather or towage requirements.
- Fatigue or working-time rules beyond the single illustrative interval.
