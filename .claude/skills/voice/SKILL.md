---
name: voice
description: Language and copy rules for anything a client or worker will read: UI text, first-screen copy, emails, Slack messages, intent and spec artifacts. Use whenever writing or reviewing user-facing text or product artifacts in this repo.
---

# Voice and language

This app is used by client workers who did not ask to be here. Copy has to feel plain, honest, and short.

## Rules

1. Workers "get interviewed." Never "take a survey," "complete a questionnaire," or "fill in a form."
2. Plain language. No framework jargon in anything a client or worker sees. Say:
   - "friction," not "outcome statements" or "unmet needs"
   - "how well it works today," not "satisfaction"
   - "what matters most," not "importance score"
   - "what to fix," not "opportunity algorithm" or "ODI score"
   - "the job," not "job-to-be-done" or "JTBD"
3. No em-dashes. Use a comma, a full stop, or parentheses.
4. Sentences short. One idea each.
5. Address the reader as "you." Refer to the consultant as "we" only in copy the consultant sends; the app itself does not say "we."
6. Privacy copy is explicit and specific: say who sees the answers and what they are used for. Never "your data is safe with us."
7. Names of steps come from the universal job map (Define, Locate, Prepare, Confirm, Execute, Monitor, Modify, Conclude) but the step title shown to workers is always a plain description of what they do at that step.

## Internal artifacts

`intent.md`, `spec.md`, and `plan.md` follow rules 3 and 4. Framework terms are fine there when precise, but define them once.

## Check before finishing

Search the diff for: `survey`, `questionnaire`, `outcome statement`, `satisfaction`, `opportunity`, `ODI`, `JTBD`, and the em-dash character. Each hit in user-facing text is a bug.
