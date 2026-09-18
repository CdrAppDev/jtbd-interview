---
name: asdlc-spec
description: Stage 2 of the AI-native SDLC. Take an accepted intent.md and produce spec.md (requirements and design) with policy applied and concerns flagged. Use when Chris says "spec this", "write the spec for <change>", or an intent.md has Status: accepted and no spec.md exists.
---

# Write spec.md

Read `.claude/skills/asdlc/SKILL.md` first if the loop is not already in context.

## Preconditions

- `intent/<nnn>-<slug>/intent.md` exists with `Status: accepted`. If it is still `draft`, stop and say so.
- Load the policy skills before writing: `voice` and `data-security`. They are constraints on the design, not suggestions.

## Steps

1. Read the intent and the current codebase (`CLAUDE.md`, `app/`, `components/`, `lib/`, and the Supabase schema via the Supabase tools).
2. Write `spec.md` from the template. Design for the existing stack; do not propose new frameworks or UI libraries.
3. Where a policy cannot be satisfied, or two policies conflict, or the intent asks for something the policy forbids, put it under `## Concerns` at the top. Concerns are what Chris resolves before accepting.
4. Answer every open question from the intent, or carry it forward unchanged under `## Open questions`.
5. Commit with message `spec: <slug>`. Do not set `Status: accepted` yourself.

## Template

```markdown
# Spec: <title>
From: intent.md (<date>). Status: draft. Date: <YYYY-MM-DD>.

## Concerns
Places where a policy cannot be met or policies conflict. Empty is fine.

## Requirements
Numbered, testable statements of what the change must do. Reference the
intent's proposed outcome.

## Design
### Data model
Tables, columns, relationships. Migrations named.
### Access control
Who can read and write what, and how it is enforced (RLS, server routes, tokens).
### Routes and screens
Each route, what it shows, who can reach it.
### External systems
Integrations, what they need, failure behaviour.

## Copy
User-facing text that the design introduces, written per the voice skill.

## Out of scope
Carried from intent, plus anything the design deliberately defers.

## Open questions
Still-open items, or "none".
```
