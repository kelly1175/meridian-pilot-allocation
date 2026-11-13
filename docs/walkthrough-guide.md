# Meridian Pilot Allocation: prototype walkthrough guide

**Audience:** James and Susan
**Presenter:** Kelly Pearson, Product Owner
**Duration:** about 30 minutes

## 1. Purpose of the session
- Show a working prototype of the first Meridian component: pilot allocation.
- Get reactions to the workflow, not sign-off on a product.
- Leave with owners and dates for the four decisions that block delivery scope (section 7).

**Set expectations up front:**
- The data is fictional: no real vessels, pilots or port.
- The allocation rules are placeholders, chosen so there's something concrete to react to.
- Technology and hosting still go through architecture review.
- The 31 March 2027 date is not a commitment.

## 2. Before the session
1. On your Mac, check Node is version 22.13 or later with `node -v`.
2. Clone the repo: `git clone https://github.com/kelly1175/meridian-pilot-allocation`.
3. Start it: `cd meridian-pilot-allocation && npm start`.
4. Open http://localhost:3000 and share that browser window.
5. Restart the app (`Ctrl + C`, then `npm start`) just before the session for a clean data set. Times are relative to when it starts, so the board always looks live.

## 3. Screen tour (3 minutes)

| Area | What to point out |
|---|---|
| User picker (top right) | Switches role. Alex and Blair are allocators, Sam is a supervisor, Olly is an operational colleague (read-only) |
| Movement board | Every movement that needs a pilot, with its allocation status. Filters for area, time window and unresolved only |
| Status badges | Unallocated (red), Draft (blue), Needs review (amber), Confirmed (green) |
| Detail panel (right) | Movement facts, the current allocation, candidate pilots and the full history |
| Pilot availability | Timeline showing duty, unavailability and assignments. Flags pilots whose availability may be out of date |
| Metrics | Proposed measures: time to allocate, unallocated, rework, adoption and exceptions |
| Audit log | Every change, append-only |

## 4. Walkthrough script (20 minutes)

### Scenario 1: Allocate outstanding demand (as Alex)
1. Tick **Unresolved only**.
2. Click the earliest **Unallocated** movement.
3. Read the candidate list. Each pilot shows **Eligible**, **Warnings**, **Exception needed** or **Blocked**, with the reasons.
4. Click **Assign** on an eligible pilot, tick **Confirm immediately**, then click **Assign**.

**Say:** "The system checks suitability, but the allocator still makes the decision."
**Ask Susan:** "Is this the information you'd use to choose? What's missing?"

### Scenario 2: Late change (Sam, then Alex)
1. Switch to **Sam**. Open **CAPE HALLORAN** and click **Simulate time change**, then **OK**.
2. The status changes to **Needs review**, and the panel shows the old and new times.
3. Switch to **Alex**. The allocation can't be confirmed until someone reviews it. Click **Mark reviewed**, or **Reallocate** if the pilot no longer fits.

**Say:** "In the real system, this change would come from the movement feed. The button stands in for that."
**Ask:** "How do late changes reach allocators today, and how often do they get missed?"

### Scenario 3: Pilot becomes unavailable (as Sam)
1. Open **Pilot availability**. Click **Record unavailability** for **Pilot Carrick** and save the default times.
2. A message reports that an allocation was flagged.
3. Go back to the board and open the flagged movement. **Mark reviewed** is refused because the pilot now fails the checks.
4. Click **Reallocate** on an eligible pilot. Choose the reason **Pilot unavailable**, add a note, then click **Reallocate**.
5. Point to the history: the old allocation is kept as superseded, and the reason is recorded.

### Scenario 4: Authorised exception (Alex, then Sam)
1. As **Alex**, open **NORDIC SPARROW** (the first OUTER arrival). Pilot Bevan shows **Blocked** with "outside duty (exception: supervisor)". The allocator can't assign Bevan.
2. Switch to **Sam**. The same pilot now shows **Exception needed**. Click **Assign**, enter an exception reason, then click **Assign**.
3. The allocation shows the exception, who authorised it and why. It's also counted in **Metrics**.

**Ask Susan:** "Which conditions should ever be overridable, and who should be allowed to do it?"

### Scenario 5: Cancellation (as Sam)
1. On a movement with an allocation, click **Simulate movement cancelled**.
2. Click **Cancel allocation**, choose a reason, then confirm.
3. The record is kept and shown in the history.

### Scenario 6: Operational colleague view (as Olly)
1. Switch to **Olly**.
2. Only the board is available. It's read-only, and drafts aren't shown as allocated.

**Ask James:** "Is this what the wider team needs to coordinate?"

### Optional: two people editing at once
Open two browser windows, one as Alex and one as Blair, on the same movement. Make a change as Alex, then try to change it as Blair. Blair gets a "changed by someone else" message, so nothing is overwritten silently.

## 5. Questions likely to come up

| Question | Answer |
|---|---|
| Does it allocate automatically? | No. Automated allocation is out of scope for the MVP. It checks and advises, and people decide. |
| Where does the data come from? | Sample data for now. The real sources are still to be agreed (D-04). A controlled CSV import is the fallback (D-05). |
| Are these the real rules? | No. They're placeholders in one config file, and changing them doesn't need code. Who approves them is decision D-03. |
| Do pilots get notified? | Not yet. There's a manual sent / acknowledged / declined status. Whether notifications are in scope is decision D-06. |
| Can we use it now? | No. It has no real sign-in, hosting or support. It's for validating the workflow. |
| When will it be live? | After the scope decisions, estimates and architecture review. 31 March 2027 is a proposed milestone only. |

## 6. Capture during the session
- Points where they hesitated or were unsure what to do.
- Rules they disagreed with, or said were missing.
- Information they asked for that the screens don't show.
- Who else needs to see it, especially allocators and pilot representatives.

## 7. Decisions to close (the ask)

| ID | Decision | Proposed owner |
|---|---|---|
| D-01 | Which port or operational area goes first? | Susan |
| D-02 | What makes a pilot suitable and available? | Allocation rule authority (to be named) |
| D-03 | Which conditions block, warn or allow an exception, and who can authorise one? | Allocation rule authority (to be named) |
| D-06 | Are pilot acknowledgement and notifications in the MVP? | Susan, with pilot representatives |

**Close with:** "Can we name the rule authority and book allocator sessions for the next two weeks?"

## 8. After the session
- Log the feedback against `docs/backlog.md` and update `docs/open-decisions.md`.
- Book three or more allocator sessions using `docs/validation-scenarios.md`.
