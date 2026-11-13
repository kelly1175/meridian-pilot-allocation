# Validation scenarios

Scripts for allocator sessions (F1.4) and, later, operational acceptance (AC10). Start with `npm start`. Sample data resets on restart.

For each scenario, record: completed (yes/no), time taken, hesitation points, rule disagreements and missing information.

## S1 Allocate outstanding demand

**As:** Alex (Allocator)

1. Tick **Unresolved only**.
2. Pick the earliest unallocated movement.
3. Review the candidates. Assign a pilot marked **Passes configured checks** and tick **Confirm immediately**.

**Expect:** the status changes to Confirmed. The history shows creation and confirmation.
**Ask:** Is the information shown enough to choose? What's missing? Does the passes / warnings / draft only / blocked split match how you decide today?

## S2 Late change to a confirmed movement

**As:** Sam (Supervisor) simulates the source change, then Alex resolves it

1. Sam: open **CAPE HALLORAN**, click **Edit sample movement**, then **+4 h**, then **Apply change**.
2. Alex: refresh. The movement shows **Needs review** with the before → after time.
3. If the pilot is still suitable, **Mark reviewed**. If not, **Reallocate** with category *Movement change*.

**Expect:** the allocation can't be confirmed or left unchanged without review. The change is in the history.
**Ask:** How do you hear about late changes today? Who acts on them?

## S3 Pilot becomes unavailable

**As:** Sam

1. **Pilot availability**: record unavailability for **Pilot Carrick** covering their next assignment.
2. The toast reports how many allocations were flagged.
3. **Movement board**: open the flagged movement. **Mark reviewed** is refused because the pilot now fails checks.
4. Reallocate to a pilot who passes configured checks, with category *Pilot unavailable*.

**Expect:** the old allocation shows as superseded and linked. The reason is recorded.

## S4 Cancellation

**As:** Sam

1. On a movement with an allocation, **Simulate movement cancelled**.
2. The allocation is flagged. Alex cancels it with category *Movement change*.

**Expect:** the allocation record is kept as Cancelled. The movement shows Cancelled.

## S5 Authorised exception

1. Alex: open a movement where a pilot shows **Blocked** with "(exception: supervisor)". Alex can't assign them.
2. Sam: assign the same pilot with an exception reason.

**Expect:** the exception and reason are shown on the allocation and counted in Metrics.
**Ask:** Which conditions should be overridable, and by whom? (D-03)

## S6 Concurrent edit

1. Open the same movement in two browser windows as Alex and Blair.
2. Alex confirms or reallocates. Blair then tries to cancel without refreshing.

**Expect:** Blair sees "changed by someone else" and the view reloads. Nothing is silently overwritten.

## S7 Operational colleague view

**As:** Olly

**Expect:** board only, read-only, confirmed assignments only. Drafts are not shown as allocated.
**Ask:** Does this give you what you need to coordinate? What would you look at first?

## S8 Interim data import

**As:** Sam, using **Data import**

1. Import the sample row, then edit its time and import again.
2. Add a row with an invalid date.

**Expect:** created, then updated. The invalid row is rejected with its line number. Movements missing from the file are listed, not removed.
