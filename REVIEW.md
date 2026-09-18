# Review instructions

## Passes
Run three passes and tag each finding with its pass:
- Bugs: logic errors, broken edge cases, regressions, wrong scoring maths.
- Security: cross-org data exposure, answers or transcripts readable via the anon key, missing RLS, links that do not check expiry or revocation, secrets in the diff. Read `.claude/skills/data-security/SKILL.md`.
- Compliance: the change matches `intent/<nnn>-<slug>/spec.md` and `plan.md` for the change, and follows the `voice` skill for any user-facing text.

## What Important means here
Reserve Important for findings that would break behaviour, leak data across orgs or respondents, or breach a policy skill. Style and naming are nits.

## Cap the nits
Report at most five nits per review; summarise the rest as a count.

## Always check
- If the diff touches implementation, does `plan.md` still describe it? A diverging plan is a finding.
- User-facing text: search for `survey`, `questionnaire`, `satisfaction`, `ODI`, `JTBD`, and em-dashes.
- New tables have RLS enabled and an `organization_id` where the policy requires it.

## Do not report
`package-lock.json`, `next-env.d.ts`, and anything `npm run typecheck` already catches.
