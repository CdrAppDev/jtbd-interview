# Intent: branding and completion notifications
Author: Chris. Status: draft. Date: 2026-09-18.

## Problem
The interview looks like an anonymous web form. Workers have no visual cue that it came from my company on behalf of their employer, which weakens the trust signal the org contact's forwarded link is supposed to carry. And I only find out an interview is done by checking the admin page.

## Proposed outcome
- Every screen carries my company's branding (logo, name, colors) with the client's name and logo alongside it on the first screen: "an interview from [my company] for [client]."
- I set the client's display name and logo on the organization record.
- I get a Slack message when a worker completes an interview: org, job, role, name if given, running count ("7 of 10"). Optionally a message the first time a link is opened, so I know the contact forwarded it.
- Slack messages never contain free-text answers or ratings.

## Affected users and systems
- Workers: what they see on every interview screen.
- Chris: org settings, Slack.
- App: layout and CSS tokens, organizations table (display name, logo), a database trigger or edge function posting to a Slack incoming webhook.

## Constraints
- The Slack webhook URL is a server-side secret, never in the repo or the browser (`data-security` skill, rule 10).
- Client logos are uploaded to Supabase storage under the org, not hot-linked.
- No UI library. Branding is a change to the existing CSS tokens and layout.
- Depends on 002 (organizations must exist).

## Out of scope
- Full white-labelling: custom domains, hiding my brand.
- Email notifications, daily digests.
- Per-org color themes. Client gets name and logo only.

## Open questions
- Logo and color assets for my company: where do I get them?
- One Slack channel for everything, or one per org?
