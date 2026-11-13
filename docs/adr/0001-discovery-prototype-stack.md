# ADR-0001: Discovery prototype stack

- **Status:** Accepted for prototype only. Production stack subject to architecture review (D-10).
- **Date:** 2026-11-13

## Context

The epic needs allocators to validate the workflow with realistic scenarios before implementation scope is agreed. Technology, hosting and integration choices are explicitly deferred to architecture review.

## Decision

Build the prototype as a zero-dependency Node.js 22 app:

- `node:sqlite` for storage, with a partial unique index and append-only audit triggers.
- `node:http` JSON API and a vanilla JS front end. No build step.
- Rules in a JSON config so they can change in sessions without code changes.

## Consequences

- Runs anywhere with Node 22.13 or later. No supply-chain surface. Easy to demo.
- Domain logic (`rules.js`, `service.js`) is separate from transport and storage, so the workflow, checks and tests can carry into the production stack.
- Not suitable for production: stub identity, single process, no observability. `node:sqlite` is still experimental in Node 22.
