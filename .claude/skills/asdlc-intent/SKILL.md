---
name: asdlc-intent
description: Stage 1 of the AI-native SDLC. Turn a brainstormed idea into intent/<nnn>-<slug>/intent.md in the product owner's own words. Use when Chris says "write this up as intent", "capture this as an intent.md", or a conversation has produced a concrete idea worth building.
---

# Write intent.md

Read `.claude/skills/asdlc/SKILL.md` first if the loop is not already in context.

## Steps

1. If the idea is not yet concrete, ask the questions an analyst would: who is affected, what better looks like, what is out of scope, what success looks like. Stop asking once the template can be filled honestly.
2. Pick the next number under `intent/` and a short slug.
3. Write `intent/<nnn>-<slug>/intent.md` from the template below, in Chris's words, not framework jargon. Follow the `voice` skill.
4. Say what you were unsure about so Chris can correct it before accepting.
5. Commit with message `intent: <slug>`. Do not set `Status: accepted` yourself.

## Template

```markdown
# Intent: <title>
Author: Chris. Status: draft. Date: <YYYY-MM-DD>.

## Problem
What cannot be done today, and who feels it.

## Proposed outcome
What better looks like, from the user's side. No implementation detail.

## Affected users and systems
Who uses this, which parts of the app and which external systems it touches.

## Constraints
Hard limits: security, cost, existing tech, language rules, dates.

## Out of scope
What this change deliberately does not do.

## Open questions
Decisions Chris has not made yet. Each one a single line.
```
