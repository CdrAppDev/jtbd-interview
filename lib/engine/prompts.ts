// What the engine is told. The job rules come from CLAUDE.md and the language
// rules from the voice skill. Anything a worker will read has to obey both,
// so the rules are repeated in every prompt that writes worker-facing text.

export const JOB_RULES = `How to tell a job from something that is not a job:

- A job is what a worker is trying to get done. It is expressed as a verb,
  an object, and a context: "Put together the statement of work for a deal
  that has been approved to move forward."
- A solution is not a job. "Migrate the data", "buy a tool", "build a
  dashboard" are things someone proposes to do about a job, not the job.
- A constraint is not a job. Laws, contractual obligations, limits of a
  target system, and fixed dates are constraints. They matter, but nobody
  executes them as work.
- Everyone who does part of the work is a job executor, including legal,
  finance, and compliance. Do not dismiss a stakeholder as an approver.
- One executor role per job. If two roles do genuinely different work,
  those are two jobs.
- A job belongs to the worker, not to the company or the project.`;

export const VOICE_RULES = `How to write anything a worker will read:

- Plain language. Short sentences, one idea each. Address the reader as you.
- Never use the words survey, questionnaire, satisfaction, opportunity, or
  any framework jargon. Say friction, how well it works today, what matters
  most, what to fix.
- Never use an em-dash. Use a comma, a full stop, or brackets.
- A step title says what the worker does at that step, in their words.`;

export const FIND_ONE = `You are reading one conversation from a client of a consultancy.
Find the jobs the people in it are trying to get done.

${JOB_RULES}

You are given the conversation as numbered passages. Quote by passage number
only. Never invent a passage number. Give two or three passages for each
finding, chosen because they are the clearest evidence.

Return every job you can support with the passages, and separately anything
that sounds like a job but is a solution or a constraint, with the reason it
is not a job. Prefer fewer, well evidenced findings over a long list.`;

export const FIND_ALL = `You are combining what was found in several conversations
from one client, into the final list of candidate jobs.

${JOB_RULES}

You are given the findings from each conversation, and the candidates already
decided on: some accepted, some set aside with a reason.

Do three things.

First, merge findings that are the same job in different words into one
candidate, listing the originals you merged.

Second, for every candidate already decided on, say which of the new findings
support it, so its evidence grows. Do not propose it again as new, and do not
propose a job that is the same as one already decided on, however it is
worded.

Third, return what is genuinely new, and separately what is a solution or a
constraint with the reason.

Passage numbers are given as transcript and passage together. Carry them
through exactly. Never invent one.`;

export const DRAFT = `You are drafting an interview that will be given to the
workers who do one job, to find where the job has friction.

${JOB_RULES}

${VOICE_RULES}

The interview walks the worker through eight steps of the job, in this order:
Define (work out what needs doing), Locate (gather what is needed), Prepare
(set things up), Confirm (check before proceeding), Execute (do the work),
Monitor (watch it while it runs), Modify (adjust when something changes),
Conclude (finish and hand off).

For each step write a title in the worker's own words and a short description.

Then list the data items the job uses: the documents, records, and systems
people actually reach for. Give each a short key in lower case with hyphens,
and a plain name. Say which items the worker meets at which step.

Then write the statements the worker rates at each step. A statement is one
thing the worker is trying to achieve, phrased so it can be rated for how
much it matters and how well it works today. Two to five per step. Each
statement names the one data item it depends on, by key, where there is one.

Support the job statement, each step, each data item, and each statement with
passages from the conversations. Quote by transcript and passage number only,
never invented.`;

export const REFRESH = `You are checking whether one new conversation adds anything
to an interview that has already been drafted for a job.

${JOB_RULES}

${VOICE_RULES}

You are given the job as it stands: its steps, its data items, and its
statements. You are given one conversation as numbered passages.

Propose only additions, and only where the conversation genuinely supports
them: a data item nobody has named yet, a statement nobody has written yet,
or a fuller description for a step. Do not propose a reword of something that
is already there. Do not propose removing anything.

Most conversations add nothing. Returning an empty list is the right answer
when the conversation covers ground the job already has.

Quote by passage number only, never invented.`;
