# Meridian Pilot Allocation: discovery walkthrough guide

**Audience:** Susan and marine operations
**Presenter:** Kelly Pearson, Product Owner
**Duration:** about 35 minutes

## 1. Purpose
- Show a working prototype of Meridian's first component: pilot allocation.
- Get reactions to the workflow and the illustrative rules. This is not sign-off on a product.
- Leave with owners for the decisions that block delivery scope (section 6).

**Say at the start:**
- The data is fictional.
- Every rule is illustrative and requires validation with marine operations. The notice under the header says so on every screen.
- Communication is simulated. No messages are sent.
- 31 March 2027 is a proposed milestone, not a commitment.

## 2. Before the session
1. On your Mac, check Node is version 22.13 or later: `node -v`
2. Clone the repo: `git clone https://github.com/kelly1175/meridian-pilot-allocation`
3. Start it: `cd meridian-pilot-allocation && npm start`
4. Open http://localhost:3000 and share that browser window.
5. Restart (`Ctrl + C`, then `npm start`) just before the session. Sample times are relative to start-up, so a restart gives clean, live-looking data.

**Roles** (top-right picker): Alex and Blair are allocators, Sam is a supervisor, Olly is an operational colleague (read-only).

## 3. Main walkthrough (20 minutes)

Follow the eight steps in order. They use **ATLANTIC FORTUNE**.

| Step | Who | Do | Point out |
|---|---|---|---|
| 1. Select an unallocated movement | Alex | Tick **Unresolved only** and click **ATLANTIC FORTUNE** | The status is Unallocated |
| 2. Review candidates | Alex | Read the candidate list | Each pilot shows **Passes configured checks**, **Warnings to review**, **Draft only — cannot confirm**, **Needs authorised exception** or **Blocked**, with the reason for each check. The help line says the allocator keeps the decision |
| 3. Create a draft | Alex | **Assign** on Pilot Bevan. Leave **Confirm immediately** unticked, then **Assign** | The status is Draft (outlined badge) |
| 4. Confirm | Alex | Click **Confirm** | The status is Confirmed (filled badge). Confirmation re-runs the checks |
| 5. Communication | Alex | **Send notification (simulated)**, then **Record acknowledgement** | Notification and pilot response are separate states. Nothing is actually sent |
| 6. Change the movement | Sam | Click **Edit sample movement**, then **−4 h**, then **Apply change** | It's labelled as a sample-data control. It stands in for an update from the movement source |
| 7. Review flag | Sam or Alex | Read the amber **Requires review** panel | It shows what changed (old → new start) and why it now fails: outside Bevan's recorded duty period. The confirmed allocation no longer looks clear |
| 8. Resolve and review history | Alex | Try **Mark reviewed** (refused, because the checks still fail). Then **Reallocate** on Pilot Ashworth, who now passes. Choose category *Movement change*, enter a reason, tick **Confirm immediately**, then **Reallocate**. Scroll to **History** | Bevan's allocation is kept as superseded. History reads: created → confirmed → notification sent → acknowledged → movement changed → requires review → pilot reassigned → confirmed |

**Ask Susan:**
- "Is this the information you'd use to choose a pilot? What's missing?"
- "How do late changes reach allocators today, and how often are they missed?"

## 4. Supporting scenarios (10 minutes)

### Missing information: KESTREL BAY
1. As **Alex**, open **KESTREL BAY**. The board shows **Draught missing**, and the detail panel explains it.
2. Candidates show **Draft only — cannot confirm**. The draught limit check is not counted as passed.
3. Assign Pilot Bevan. **Confirm immediately** is disabled, and the allocation card explains why.
4. As **Sam**, click **Edit sample movement**, enter a draught of 9.8 and apply. The candidates are re-assessed. The draft is flagged for review because its data changed.
5. As **Alex**: **Mark reviewed**, then **Confirm**.

Assumption on screen: *"Confirmation requires the information needed to complete configured suitability checks."*

### Trainee: STELLA MARIS II
- Pilot Holt is shown with a **TRAINEE** badge on the board, in candidates and on the timeline.
- The draft can't be confirmed, by anyone. The reason is shown as a prototype assumption: supervision requirements aren't defined.

**Ask:** "What supervision does a trainee assignment need, and who records it?"

### Authorised exception: NORDIC SPARROW
- As **Alex**, Pilot Bevan is **Blocked** with "supervisor exception possible".
- As **Sam**, the same pilot shows **Needs authorised exception**. Assigning requires a reason, which is recorded.

**Ask:** "Which conditions should ever be overridable, and by whom?"

### Pilot availability timeline
- Show the dated axis (UTC) and the **Now** marker.
- Point out confirmed (filled), draft (dashed outline) and requires review (amber, ⚠).
- The hatched margins are the 30-minute transit allowance that the conflict check uses.
- Every assignment is also listed in text under its row, with start and end times.

### Read-only view
Switch to **Olly**: board only, confirmed assignments only.

## 5. Likely questions

| Question | Answer |
|---|---|
| Are these our rules? | No. They're illustrative values in one config file (`docs/illustrative-rules.md`). Validating them is the point of discovery |
| Does it allocate automatically? | No. It checks and advises; people decide |
| Where does the data come from? | Fictional sample data. Real sources are still to be agreed (D-04, D-05) |
| Do pilots get notified? | Not in the prototype. Communication is simulated. Whether notifications are in scope is decision D-06 |
| Is the audit trail production-grade? | No. Events are added, never edited, in the prototype's database, but it isn't tamper-proof |
| When will it be live? | After the scope decisions, estimates and architecture review |

## 6. Decisions to close

| ID | Decision | Proposed owner |
|---|---|---|
| D-01 | Which port or operational area goes first? | Susan |
| D-02 / D-03 | Suitability rules, what blocks or warns, and who can authorise exceptions | Allocation rule authority (to be named) |
| D-06 | Are pilot notification and acknowledgement in the MVP? | Susan, with pilot representatives |
| D-15 | Trainee supervision requirements | Marine operations (to be named) |

**Close with:** "Can we name the rule authority and book allocator sessions for the next two weeks?"

## 7. Capture
- Where people hesitated or were unsure what to do.
- Rules they disagreed with, or said were missing.
- Information they asked for that the screens don't show.
