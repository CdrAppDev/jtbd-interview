---
name: data-security
description: Data access and security policy for this app. Use whenever designing or changing tables, RLS policies, routes, auth, share links, integrations, or anything that reads or writes interview answers, results, or client transcripts.
---

# Data security policy

The app will hold three classes of client data. The policy is different for each.

| Class | Examples | Sensitivity |
|---|---|---|
| Content | jobs, steps, statements, data items | Ours. Low. |
| Answers | respondents, step responses, ratings, free text | Client's workflow detail, possibly attributable to a person. High. |
| Transcripts | client meeting transcripts and anything derived from them | Verbatim client conversations. Highest. |

## Rules

1. **Workers never sign up.** The interview share link is the worker's credential. It may only insert or update that respondent's own answers. It can never read another respondent's answers, results, or transcripts.
2. **Every link expires and can be revoked.** A share link has an expiry date and a revoked flag. Both are checked server-side on every request.
3. **Name is optional, role is required.** Never make a worker identify themselves to complete an interview.
4. **Reads of answers and transcripts go through authenticated server code.** Never expose them to the browser via the anon key. RLS is the last line of defence, not the only one.
5. **RLS is on for every table, always.** Policies are written per class:
   - Content: readable by anyone holding a valid link for that job; writable by admins.
   - Answers: insert/update only for the respondent bound to the presenting link; read only by admins and that org's viewers.
   - Transcripts: read and write by admins only. No org viewer access without an explicit product decision.
6. **Tenancy is enforced in the database.** Every row of answers, transcripts, and jobs carries `organization_id`. Every policy filters on it. A bug in a page must not be able to leak across orgs.
7. **Roles are per org membership, not global.** `admin` (all orgs), `org_viewer` (aggregated results for one org). Add a role only when a real need appears.
8. **Audit log.** Record who viewed transcripts and individual answers, with timestamp. Cheap now, painful to retrofit.
9. **Retention is a promise we keep.** Every org has a retention setting. Deleting an org cascades everything, transcripts included.
10. **Integrations hold least privilege.** API keys for Fellow, Slack, or email live in server-side environment variables, never in the repo or the browser. Notifications carry role, org, and job; never free-text answers.
11. **Secrets never enter the codebase.** The Supabase publishable key is public by design. Nothing else is.

## When designing

For every new table, route, or integration, state in `spec.md`:
- which data class it touches,
- who can read it and who can write it,
- which mechanism enforces that (RLS policy name, server route, token check).

If a requirement cannot meet these rules, flag it under `## Concerns` in the spec rather than weakening the rule.
