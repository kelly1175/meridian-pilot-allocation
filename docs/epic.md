# Epic: Meridian — Digitise Pilot Allocation MVP

## Problem statement
Marine operations needs a shared digital capability to manage pilot allocation against vessel movements, maintain visibility of assignments and respond to operational changes.

Discovery must establish the current process, its pain points and baseline performance. The proposed MVP addresses visibility, allocation control and traceability. Authorised operational staff keep the allocation decisions.

## Background
Susan has confirmed pilot allocation as the first component required within Meridian. This epic proposes an initial release for one agreed port or operational area. It covers viewing movements that need a pilot, reviewing pilot availability, allocating pilots and managing changes. The operational area, workflow, rules, data sources and communication requirements need validation before delivery scope is agreed.

## Goals and objectives
- Provide a shared view of movements requiring pilot allocation and their current allocation status.
- Enable authorised users to assign and reassign pilots using agreed operational rules.
- Make affected allocations visible when movement details or pilot availability change.
- Record allocation decisions and changes.
- Establish measurable evidence of operational value before expanding the capability.

## Meridian requirement
As a marine operations allocator, I want to view movements requiring pilotage alongside pilot availability and suitability information, and manage assignments in one workspace, so that I can make informed allocation decisions and keep the operational team informed when plans change.

## Accountability matrix
| Role | Person / position |
|---|---|
| Product Owner | Kelly Pearson (planned) |
| Agile Delivery Lead | To confirm |
| Architect | To confirm |
| Engineering Lead | To confirm |
| SRE / operational support owner | To confirm |
| Purchasing Lead (Buyer) | Applicability and owner to confirm |
| Financial Operations | Applicability and owner to confirm |

Operational acceptance owner and authority to approve allocation rules: to confirm with Susan and marine operations.

## WSJF
- **Business value:** score after operational benefits are validated.
- **Time criticality:** score after delivery drivers are confirmed. The proposed 31 March date doesn't by itself make a fixed deadline.
- **Risk reduction / opportunity enablement:** score against evidenced operational risks and the value of establishing the first Meridian component.
- **Cost of delay:** BV + TC + RR/OE.
- **Job size:** engineering estimate required after initial discovery.
- **WSJF:** CoD ÷ job size. Not yet calculated.

## User stories
- As an allocator, I want to see movements requiring a pilot and their allocation status so that I can identify outstanding demand.
- As an allocator, I want to review pilot availability and relevant suitability information so that I can select an appropriate pilot.
- As an allocator, I want to assign, reassign or cancel an allocation so that I can respond to operational changes.
- As an operational colleague, I want to see the current confirmed allocation so that I can coordinate my work.
- As an operational supervisor, I want to review allocation history so that I can understand decisions and resolve queries.

User roles and access boundaries need confirmation.

## Out of scope (proposed, for architecture)
- Automated allocation and optimisation
- Full workforce, roster or leave management
- Payroll and billing
- Predictive demand forecasting
- Rollout across all ports
- Replacement of wider vessel-movement systems

Pilot acknowledgement and notifications are still scope decisions. Include them if a complete, usable operational workflow needs them.

## Architecture (proposed logical components)
- **Web application:** movement board, pilot availability and allocation details.
- **Application service:** workflow, agreed allocation checks, permissions and change handling.
- **Data store:** allocation records, required reference data and audit history.
- **System connections:** movement data, pilot information and communication channels where required.

Agree the authoritative source and update responsibility for each data type. Reference existing movement identifiers where available. Technology, hosting and integration choices remain subject to architecture review.

## Acceptance criteria
1. **Movement visibility:** authorised users can view movements requiring pilot allocation in the agreed area and time window, including current allocation status.
2. **Pilot information:** users can review the availability and suitability information agreed as necessary for allocation. Missing or outdated information is clearly identified.
3. **Allocation:** an authorised allocator can assign a pilot to a movement. The system applies agreed checks and handles blocking conditions, warnings and authorised exceptions as specified.
4. **Change handling:** changes to relevant movement details or pilot availability flag affected allocations for review.
5. **Reallocation and cancellation:** authorised users can amend or cancel an assignment, preserving the previous allocation and recording the change.
6. **Concurrent working:** conflicting edits can't silently overwrite one another.
7. **Status and communication:** users can tell draft from confirmed assignments and see communication or acknowledgement status where the agreed workflow includes it.
8. **Auditability:** allocation changes record the user, time and relevant before-and-after details, with reasons where required.
9. **Access:** users can perform only the actions permitted for their agreed operational role.
10. **Operational validation:** marine operations completes agreed end-to-end scenarios, including a late change, a cancellation and an unavailable-pilot scenario.

## Definition of done
- Agreed MVP stories and acceptance criteria are complete and evidenced.
- Relevant functional, integration, access and concurrent-edit tests pass.
- Agreed security, data-handling and operational requirements are met.
- Marine operations accepts the end-to-end workflow.
- Monitoring, support ownership and incident procedures are in place.
- Outage, recovery and fallback procedures are documented and exercised as agreed.
- User guidance and required training are complete.
- Release approval is recorded and the agreed operational rollout is complete.
- Measurement is enabled and a post-release review is scheduled.

## Metric tracking plan
| Measure | Proposed method |
|---|---|
| Time to allocate a movement | Measure between agreed start and confirmation events |
| Unallocated movements | Count at agreed operational review points |
| Reallocation and rework | Record changes and categorise reasons |
| Adoption | Compare allocations recorded in Meridian with eligible movements |
| Workflow usability | Observe task completion and gather allocator feedback |

Definitions, baseline, targets, reporting frequency and owners are agreed during discovery.

## SLAs and SLOs
Agree service hours, availability, response times, data freshness, recovery objectives and support response expectations with marine operations and engineering. Thresholds must reflect operational needs and the agreed fallback process. No numerical commitments are set at this stage.

## Stakeholders
- **Susan:** confirmed pilot allocation as the first Meridian priority. Detailed scope and acceptance role to confirm.
- **Marine operations allocators:** workflow, allocation rules and usability.
- **Pilots / pilot representatives:** availability, communication and acknowledgement requirements.
- **Operational supervisors:** oversight, exceptions and operational acceptance.
- **Engineering and architecture:** feasibility, implementation and system connections.
- **Programme delivery:** dependencies, capacity and delivery planning.
- **Support, security and data owners:** service operation, access and information handling.

Named representatives and decision rights are still to be agreed.

## Tactical / tech debt
A controlled import or manual data-entry approach may support an initial release if integration isn't available. Any interim approach must have explicit ownership, reconciliation controls and a recorded decision on whether it stays or is replaced.

## UX/UI
- Movement board showing demand and allocation status.
- Pilot availability view showing the information needed to assess candidates.
- Allocation details showing assignment, status and history.
- Filters for operational area, time window and unresolved allocations.

Validate the design with allocators using realistic operational scenarios before implementation.

## Resources required
Product ownership, marine operations subject-matter expertise, UX/design, engineering, testing, architecture and operational support. Security, data and integration specialists as required. Capacity and effort estimates are still to be agreed.

## Work breakdown
1. Validate workflow, operational rules and MVP boundary.
2. Establish movement and pilot data access.
3. Build movement and availability views.
4. Implement allocation checks and assignment workflow.
5. Implement reallocation, cancellation and change handling.
6. Implement permissions and audit history.
7. Deliver agreed communication and acknowledgement capability.
8. Complete operational validation, support preparation and rollout.
9. Enable measurement and review initial outcomes.

## Considerations
- What makes a pilot suitable and available?
- Which conditions block allocation, warn the allocator or permit an authorised exception?
- How are movement changes received and reconciled?
- Does the workflow need acknowledgement from the pilot?
- What happens when information is missing, outdated or conflicting?
- Which operational area should be first?

**Delivery planning:** 31 March 2027 is a proposed, unconfirmed programme milestone. A delivery commitment needs agreed scope, estimates, capacity, dependencies and readiness criteria. The Product Owner's first-90-day onboarding plan is separate from this programme delivery commitment.

## External dependencies (to validate)
- Access to authoritative vessel-movement information
- Access to pilot availability and suitability information
- Agreement of allocation rules and exception authority
- Identity and access services
- Operational communication channels
- Hosting, monitoring and support arrangements
- Availability of operational users for discovery, testing and training

Record a named owner, required date and delivery impact for each confirmed dependency.
