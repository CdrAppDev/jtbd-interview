---
name: asdlc-plan
description: Stage 3 of the AI-native SDLC. Take an accepted spec.md and produce plan.md, the implementation plan, in plan mode. Use when Chris says "plan this", "make the plan for <change>", or a spec.md has Status: accepted and no plan.md exists.
---

# Write plan.md

Read `.claude/skills/asdlc/SKILL.md` first if the loop is not already in context.

## Preconditions

- `intent/<nnn>-<slug>/spec.md` exists with `Status: accepted`. If not, stop and say so.
- Enter plan mode (`EnterPlanMode`) before reading the codebase, so nothing changes until the plan is accepted.

## Steps

1. Read the spec, `CLAUDE.md`, and every file the change will touch.
2. Write `plan.md` from the template. Name real files. Order the work so each step leaves the app running.
3. Interrogate your own plan before showing it: what could this break, which step is riskiest, what did you choose not to do and why. Put the answers in `## Risks` and `## Alternatives not taken`.
4. The test is: could an engineer who never saw this conversation implement the change from `plan.md` alone. If not, the plan is not done.
5. Exit plan mode and commit with message `plan: <slug>`. Do not set `Status: accepted` yourself.
6. Once Chris sets `Status: accepted`, implement. If the implementation departs from the plan, update `plan.md` in the same commit.

## Template

```markdown
# Plan: <title>
From: spec.md (<date>). Status: draft. Date: <YYYY-MM-DD>.

## Files that change
One line per file: path, new or modified, one-phrase reason.

## Migrations
Supabase migrations in order, with names.

## Order of work
Numbered steps. Each step leaves the app running and typechecking.

## Risks
What this could break and how the plan guards against it.

## Alternatives not taken
Choices considered and rejected, one line each.

## Proof
What "done" looks like: commands run, screens checked, data verified.
Concrete enough that the verification can be pasted into the PR.
```
