# ADR-0001: Record architecture decisions

Status: accepted · Date: 2026-08-28

## Context
Decisions that constrain the future (stack choices, data models, auth
approach, external services) get lost in chat history and re-litigated by
every later session — human or agent.

## Decision
Any decision that constrains future work is recorded here as a numbered ADR:
context, decision, consequences. Agents read `docs/adr/` before proposing
architecture and never silently contradict an accepted ADR — superseding one
requires a new ADR that names it.

## Consequences
Small writing overhead per decision; in exchange, sessions stop re-deciding
settled questions and the "why" survives the chat that produced it.
