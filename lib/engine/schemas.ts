// One schema per call. Quotes are always passage numbers, never text, so a
// quote can be resolved to a real row and cannot be invented.

const strictObject = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});

const quotesOfOne = {
  type: "array",
  items: strictObject({ passage: { type: "integer", description: "Passage number in this conversation." } }, ["passage"]),
};

const quotesOfMany = {
  type: "array",
  items: strictObject(
    {
      transcript: { type: "integer", description: "Conversation number as given." },
      passage: { type: "integer", description: "Passage number within that conversation." },
    },
    ["transcript", "passage"],
  ),
};

export type FoundOne = {
  jobs: { statement: string; executor_role: string; explanation: string; quotes: { passage: number }[] }[];
  not_jobs: { statement: string; kind: "solution" | "constraint"; reason: string; quotes: { passage: number }[] }[];
};

export const FIND_ONE_SCHEMA = strictObject(
  {
    jobs: {
      type: "array",
      items: strictObject(
        {
          statement: { type: "string", description: "The job as a verb, an object and a context." },
          executor_role: { type: "string", description: "The one role that does this work." },
          explanation: { type: "string", description: "One paragraph on why this is the job." },
          quotes: quotesOfOne,
        },
        ["statement", "executor_role", "explanation", "quotes"],
      ),
    },
    not_jobs: {
      type: "array",
      items: strictObject(
        {
          statement: { type: "string" },
          kind: { type: "string", enum: ["solution", "constraint"] },
          reason: { type: "string" },
          quotes: quotesOfOne,
        },
        ["statement", "kind", "reason", "quotes"],
      ),
    },
  },
  ["jobs", "not_jobs"],
);

export type FoundAll = {
  candidates: {
    statement: string;
    executor_role: string;
    explanation: string;
    merged_from: string[];
    quotes: { transcript: number; passage: number }[];
  }[];
  more_evidence: { candidate: number; quotes: { transcript: number; passage: number }[] }[];
  not_jobs: { statement: string; kind: "solution" | "constraint"; reason: string; quotes: { transcript: number; passage: number }[] }[];
};

export const FIND_ALL_SCHEMA = strictObject(
  {
    candidates: {
      type: "array",
      items: strictObject(
        {
          statement: { type: "string" },
          executor_role: { type: "string" },
          explanation: { type: "string" },
          merged_from: { type: "array", items: { type: "string" }, description: "The wordings merged into this one." },
          quotes: quotesOfMany,
        },
        ["statement", "executor_role", "explanation", "merged_from", "quotes"],
      ),
    },
    more_evidence: {
      type: "array",
      description: "New support for a candidate already decided on, by its given number.",
      items: strictObject({ candidate: { type: "integer" }, quotes: quotesOfMany }, ["candidate", "quotes"]),
    },
    not_jobs: {
      type: "array",
      items: strictObject(
        {
          statement: { type: "string" },
          kind: { type: "string", enum: ["solution", "constraint"] },
          reason: { type: "string" },
          quotes: quotesOfMany,
        },
        ["statement", "kind", "reason", "quotes"],
      ),
    },
  },
  ["candidates", "more_evidence", "not_jobs"],
);

export type Drafted = {
  title: string;
  executor_name: string;
  executor_role: string;
  description: string;
  quotes: { transcript: number; passage: number }[];
  data_items: { key: string; name: string; quotes: { transcript: number; passage: number }[] }[];
  steps: {
    position: number;
    stage: string;
    title: string;
    description: string;
    items: string[];
    quotes: { transcript: number; passage: number }[];
    statements: { position: number; text: string; data_item: string; quotes: { transcript: number; passage: number }[] }[];
  }[];
};

export const DRAFT_SCHEMA = strictObject(
  {
    title: { type: "string", description: "The job statement." },
    executor_name: { type: "string", description: "A first name for the worker in the story." },
    executor_role: { type: "string" },
    description: { type: "string", description: "What the first screen tells the worker." },
    quotes: quotesOfMany,
    data_items: {
      type: "array",
      items: strictObject(
        { key: { type: "string" }, name: { type: "string" }, quotes: quotesOfMany },
        ["key", "name", "quotes"],
      ),
    },
    steps: {
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: strictObject(
        {
          position: { type: "integer", minimum: 1, maximum: 8 },
          stage: { type: "string", enum: ["Define", "Locate", "Prepare", "Confirm", "Execute", "Monitor", "Modify", "Conclude"] },
          title: { type: "string" },
          description: { type: "string" },
          items: { type: "array", items: { type: "string" }, description: "Data item keys offered at this step." },
          quotes: quotesOfMany,
          statements: {
            type: "array",
            items: strictObject(
              {
                position: { type: "integer" },
                text: { type: "string" },
                data_item: { type: "string", description: "The key of the one data item this depends on, or empty." },
                quotes: quotesOfMany,
              },
              ["position", "text", "data_item", "quotes"],
            ),
          },
        },
        ["position", "stage", "title", "description", "items", "quotes", "statements"],
      ),
    },
  },
  ["title", "executor_name", "executor_role", "description", "quotes", "data_items", "steps"],
);

export type Refreshed = {
  additions: {
    kind: "step" | "data_item" | "statement";
    step_position: number;
    key: string;
    name: string;
    text: string;
    data_item: string;
    why: string;
    quotes: { passage: number }[];
  }[];
};

export const REFRESH_SCHEMA = strictObject(
  {
    additions: {
      type: "array",
      items: strictObject(
        {
          kind: { type: "string", enum: ["step", "data_item", "statement"] },
          step_position: { type: "integer", description: "Which step this belongs to, or 0 for a data item." },
          key: { type: "string", description: "Data item key, for a data item or a statement that depends on one." },
          name: { type: "string", description: "Data item name, for a data item." },
          text: { type: "string", description: "Statement text, or the fuller step description." },
          data_item: { type: "string", description: "For a statement, the key it depends on, or empty." },
          why: { type: "string", description: "One sentence on what this adds." },
          quotes: quotesOfOne,
        },
        ["kind", "step_position", "key", "name", "text", "data_item", "why", "quotes"],
      ),
    },
  },
  ["additions"],
);
