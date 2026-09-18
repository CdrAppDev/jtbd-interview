---
name: asdlc
description: The AI-native SDLC loop this repo follows. Use at the start of any feature work, when asked "what stage are we at", "what's next for <change>", or before creating intent, spec, or plan artifacts. Explains the artifact chain, where files live, and who accepts each gate.
---

# AI-native SDLC for this repo

Every change moves through a chain of committed artifacts. A stage ends by committing one; the next stage starts by reading it. Chris (product owner and only engineer) accepts each gate by editing the artifact's `Status` line and merging.

## Artifact home

One folder per change under `intent/`:

```
intent/
  001-multitenant-v1/
    intent.md   Stage 1  what is wanted, why, constraints, open questions
    spec.md     Stage 2  requirements and design, policy applied, concerns flagged
    plan.md     Stage 3  files that change, order of work, risks, proof
```

Numbers are sequential. Slugs are short and lowercase.

## Stages and gates

| Stage | Command | Reads | Writes | Gate |
|---|---|---|---|---|
| 1 Plan | `/asdlc-intent` | conversation | `intent.md` (Status: draft) | Chris sets `Status: accepted` |
| 2 Design | `/asdlc-spec` | accepted `intent.md` + policy skills | `spec.md` (Status: draft) | Chris resolves flagged concerns, sets `Status: accepted` |
| 3 Build | `/asdlc-plan` | accepted `spec.md` | `plan.md` (Status: draft) | Chris sets `Status: accepted`, then implementation starts |
| 4 Test | (during build) | `plan.md` Proof section | test output pasted in PR | typecheck and build green |
| 5 Deploy | PR | `REVIEW.md`, `plan.md` | PR with review findings | Chris approves and merges |
| 6 Maintain | manual for now | production, free-text answers | new `intent.md` | loop restarts |

## Rules

- Never start implementation without an accepted `plan.md` for the change.
- Never edit an artifact whose `Status: accepted` without saying so and bumping it back to `draft`. When implementation departs from the plan, update `plan.md` in the same commit.
- The spec stage must load the policy skills (`voice`, `data-security`) and flag every place a policy cannot be satisfied or two policies conflict. Flagged concerns are listed at the top of `spec.md` under `## Concerns`.
- Open questions carry forward. An open question in `intent.md` is either answered in `spec.md` or listed again there as still open.
- Keep artifacts short. A page each. Chris reads all of it.
- Before reporting any build task complete, run the verification commands in `CLAUDE.md` and paste the output.

## Status values

`draft` (agent wrote it, awaiting review), `accepted` (Chris approved; next stage may start), `superseded` (replaced by a later artifact; keep the file).

## Templates

Each stage command carries its own template. Do not invent new sections.
