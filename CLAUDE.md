# JTBD interview app

A form-based interview that walks a worker through the eight steps of a job (Ulwick's universal job map: Define, Locate, Prepare, Confirm, Execute, Monitor, Modify, Conclude). At each step the worker checks the data they use, rates a few statements on importance (1–5) and how well it works today (1–5), and adds free text. A results page scores every statement on the ODI 0–20 scale and rolls the scores up to data items, sorting them into migration buckets.

Purpose: test whether ODI/JTBD can scope a data migration. "Migrate data from A to B" is the customer's solution, not anyone's job; the job is what workers do with the data. Every stakeholder (including legal and finance) is a job executor and gets interviewed. Only true constraints (laws, target-system limits, cutover dates) live on a separate checklist.

This is an internal mock run. The seeded job is Derek, an account executive at a Salesforce implementation partner: "Put together the statement of work for a deal that's been approved to move forward." Internal teammates answer in Derek's shoes.

## Language rules (client-facing and in-app)

- Workers "get interviewed," never "take a survey."
- Plain language. No framework jargon in the UI: say "friction," "how well it works today," "what to fix," not "outcome statements" or "opportunity algorithm."
- No em-dashes in copy.

## Stack

- Next.js 14 (app router), TypeScript, plain CSS in `app/globals.css`. No Tailwind, no UI library.
- Supabase Postgres, accessed with the publishable (anon) key from both server and client. RLS is on; policies allow anon read of content and anon insert/update/read of responses. Fine for an internal test, not for a client run.
- Fonts: Newsreader (display) + Public Sans (body) via Google Fonts. Palette tokens are in `globals.css`, light and dark.

## Supabase

- Project: `jtbd-interview`, ref `xmfyhcxfyzandkpmbfbo`, region us-east-1, org "CdrAppDev's Org" (free plan, 2-project cap).
- URL: `https://xmfyhcxfyzandkpmbfbo.supabase.co`
- Publishable key: `sb_publishable_UeW98UzhC_HoGthDOR8KOg_56n7n2R2` (public by design; defaults are in `lib/supabase.ts`, override with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Migrations applied: `interview_schema`, `seed_derek_sow_job` (visible in the Supabase dashboard under Database > Migrations).

### Tables

- `jobs` (slug `sow`), `steps` (8, `position` + `stage` + plain `title`/`description`), `data_items` (25, keyed), `step_data_items` (which items are offered at each step), `statements` (33, each points at one `data_item_id`).
- `respondents` (name, role, completed_at), `step_responses` (one per respondent+step: `data_item_ids[]`, `other_data`, `free_text`), `ratings` (one per respondent+statement: importance, satisfaction).
- Content lives in the DB so wording changes need no redeploy.

There is one test respondent named "Smoke Test" in the DB. Delete it before the real run:
`delete from respondents where name = 'Smoke Test';` (cascades).

## Scoring (results page)

- Per statement: importance and satisfaction are means of the 1–5 ratings, doubled to a 0–10 scale. Score = importance + max(importance − satisfaction, 0), range 0–20.
- Tiers: 15+ fix first, 12–15 high friction, 10–12 worth watching, under 10 works well enough.
- Data buckets: "Move carefully" if any statement pointing at the item scores 12+; "Move" if anyone checked it or a statement scores 10+; "Leave behind" otherwise.
- Charts: opportunity landscape scatter (importance vs works-today, dashed diagonal, underserved below it), ranked bars, data-item table, full statement table, free-text comments.

## Routes

- `/` intro + name/role, creates a respondent
- `/interview/[respondentId]/[step]` one step per screen; revisiting a step reloads saved answers
- `/done`
- `/results` (no auth; internal)

## Run

```
npm install
npm run dev
```

## Deploy

Vercel, team "Chris' projects" (`team_qjcwaOCujkwW7oKLhxvRMqhS`). Import this repo as a new project; Next.js is auto-detected, no env vars required.

## Next up

1. Delete the Smoke Test respondent, deploy, share the link with the team.
2. Read the free-text answers after the first few interviews; add missing data items and statements to the seed (or directly in the DB).
3. Second job for the same migration: a finance or audit executor, to show the framework catching the retention case.
4. Constraints checklist (laws, target-system limits, cutover dates) as a separate short form.
