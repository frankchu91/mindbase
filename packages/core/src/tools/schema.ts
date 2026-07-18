import type { ToolDefinition } from '../types';

export const READ_CONCEPT: ToolDefinition = {
  name: 'read_concept',
  description:
    'Read the full body of an existing wiki concept page. Use this before deciding whether to create a new concept or append/update an existing one. Returns the markdown body, truncated at 30000 chars if longer.',
  parameters: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Slug of the concept to read, e.g. "sam-altman"' },
    },
    required: ['slug'],
  },
};

export const APPEND_TO_CONCEPT: ToolDefinition = {
  name: 'append_to_concept',
  description:
    'Append a section of content to an existing concept article. Never overwrites existing text. Use this when a new source adds detail to a concept that already exists.',
  parameters: {
    type: 'object',
    properties: {
      concept_name: { type: 'string', description: 'Slug of the concept, e.g. "rag"' },
      section: { type: 'string', description: 'Heading for the new section, e.g. "Examples"' },
      content: { type: 'string', description: 'Markdown content to append under the heading' },
      raw_id: { type: 'string', description: 'The raw document id this content derives from, for citation' },
    },
    required: ['concept_name', 'section', 'content', 'raw_id'],
  },
};

export const CREATE_CONCEPT: ToolDefinition = {
  name: 'create_concept',
  description:
    'Create a brand new concept article. Use only when no existing concept fits.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Concept title, e.g. "Retrieval-Augmented Generation"' },
      one_liner: { type: 'string', description: 'One sentence summary for INDEX.md' },
      initial_content: { type: 'string', description: 'Markdown body of the concept' },
      raw_id: { type: 'string', description: 'Originating raw document id' },
    },
    required: ['name', 'one_liner', 'initial_content', 'raw_id'],
  },
};

export const UPDATE_SOURCE_BACKLINKS: ToolDefinition = {
  name: 'update_source_backlinks',
  description:
    'Declare which concepts cite this raw source. Writes wiki/sources/<raw_id>.md.',
  parameters: {
    type: 'object',
    properties: {
      raw_id: { type: 'string' },
      linked_concepts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Concept slugs that cite this raw document',
      },
    },
    required: ['raw_id', 'linked_concepts'],
  },
};

export const ADD_TO_INDEX: ToolDefinition = {
  name: 'add_to_index',
  description:
    'Add a new entry line to wiki/INDEX.md for a newly created concept. No-op if already present.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      path: { type: 'string', description: 'Relative path like wiki/concepts/rag.md' },
      one_liner: { type: 'string' },
    },
    required: ['title', 'path', 'one_liner'],
  },
};

export const UPDATE_NOTE: ToolDefinition = {
  name: 'update_note',
  description:
    'Update a specific section of an existing wiki page with new/better content. If the section does not exist, it is appended.',
  parameters: {
    type: 'object',
    properties: {
      note_name: { type: 'string', description: 'Slug of the note to update' },
      section: { type: 'string', description: 'The ## section heading to update' },
      new_content: { type: 'string', description: 'New content for this section' },
      reason: { type: 'string', description: 'Why this update is needed' },
      raw_id: { type: 'string', description: 'Raw document id this info comes from' },
    },
    required: ['note_name', 'section', 'new_content', 'reason'],
  },
};

export const PROPOSE_EDIT: ToolDefinition = {
  name: 'propose_edit',
  description:
    'Update an existing wiki page by replacing the content under a specific H2 section. Use when the new content adds detail or revises an existing concept. PREFER this over create_concept when any existing page in <context> is even loosely related.',
  parameters: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Slug of the existing page, e.g. "rag"' },
      section_anchor: { type: 'string', description: 'Existing or new H2 heading text, e.g. "Variants"' },
      new_content: { type: 'string', description: 'Markdown content to place under the heading' },
      reason: { type: 'string', description: 'One sentence explaining WHY this edit, surfaced in audit log' },
    },
    required: ['slug', 'section_anchor', 'new_content', 'reason'],
  },
};

export const LINK: ToolDefinition = {
  name: 'link',
  description:
    'Add a typed edge between two existing pages. Use this to capture relationships you observe but the body text does not explicitly include via [[wikilinks]]. Edge type must be one of: mentions, elaborates, cites, contradicts, supersedes, is_a, part_of, example_of.',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Source page slug' },
      to: { type: 'string', description: 'Target page slug' },
      type: {
        type: 'string',
        description: 'Edge type',
        enum: ['mentions', 'elaborates', 'cites', 'contradicts', 'supersedes', 'is_a', 'part_of', 'example_of'],
      },
      reason: { type: 'string', description: 'Brief justification surfaced in audit log' },
    },
    required: ['from', 'to', 'type', 'reason'],
  },
};

export const FLAG_CONTRADICTION: ToolDefinition = {
  name: 'flag_contradiction',
  description:
    'Mark two pages as containing contradictory claims that the user should review. Use when the new content directly conflicts with statements in an existing page. The pages are NOT modified — this is a notice for the human.',
  parameters: {
    type: 'object',
    properties: {
      slug_a: { type: 'string', description: 'First page slug' },
      slug_b: { type: 'string', description: 'Second page slug' },
      reason: { type: 'string', description: 'Description of the contradiction' },
    },
    required: ['slug_a', 'slug_b', 'reason'],
  },
};

export const MERGE: ToolDefinition = {
  name: 'merge',
  description:
    'Propose that two pages are duplicates of the same concept and should be merged. NEVER applied automatically — queued for human review in the audit log. Use sparingly: prefer link or flag_contradiction unless you are confident the two pages cover the same thing.',
  parameters: {
    type: 'object',
    properties: {
      keep: { type: 'string', description: 'Slug of the page to keep' },
      absorb: { type: 'string', description: 'Slug of the page to absorb into "keep"' },
      reason: { type: 'string', description: 'Why these are duplicates' },
    },
    required: ['keep', 'absorb', 'reason'],
  },
};

export const SKIP: ToolDefinition = {
  name: 'skip',
  description:
    'Conclude that no action is needed for this raw source. Use when (a) the content is already covered by existing pages, (b) the content is too low-quality to add to the wiki, or (c) the content is off-topic. Logged but produces no changes.',
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Why no action — required for audit' },
    },
    required: ['reason'],
  },
};

export const APPEND_TO_DAILY_NOTE: ToolDefinition = {
  name: 'append_to_daily_note',
  description:
    "Append the user's thought to today's daily note at wiki/notes/daily-<YYYY-MM-DD>.md. " +
    'Auto-creates the file with an H1 header if it does not exist. Use this when the input ' +
    'reads as an event, decision, status update, or any time-stamped moment of the day.',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Markdown to append. Will be inserted under a "## Captured" section, with the current time as a bullet.',
      },
      section: {
        type: 'string',
        description: 'Optional H2 heading to group the entry under (default "Captured"). E.g. "Decided", "Shipped", "Stuck on".',
      },
    },
    required: ['content'],
  },
};

export const L1_TOOLS: ToolDefinition[] = [
  READ_CONCEPT,
  APPEND_TO_CONCEPT,
  CREATE_CONCEPT,
  UPDATE_NOTE,
  UPDATE_SOURCE_BACKLINKS,
  ADD_TO_INDEX,
  PROPOSE_EDIT,
  LINK,
  FLAG_CONTRADICTION,
  MERGE,
  SKIP,
  APPEND_TO_DAILY_NOTE,
];

export const REWRITE_CONCEPT: ToolDefinition = {
  name: 'rewrite_concept',
  description:
    'Replace the full content of an existing concept article. Use during L2 health checks to improve low-quality articles.',
  parameters: {
    type: 'object',
    properties: {
      concept_name: { type: 'string', description: 'Slug of the concept to rewrite' },
      new_content: { type: 'string', description: 'New markdown body (replaces everything after the title)' },
      reason: { type: 'string', description: 'Why the rewrite is needed' },
    },
    required: ['concept_name', 'new_content', 'reason'],
  },
};

export const UPDATE_ONE_LINER: ToolDefinition = {
  name: 'update_one_liner',
  description:
    'Update a concept\'s one-liner summary in its meta.json and INDEX.md.',
  parameters: {
    type: 'object',
    properties: {
      concept_name: { type: 'string', description: 'Slug of the concept' },
      new_one_liner: { type: 'string', description: 'Improved one-sentence summary' },
    },
    required: ['concept_name', 'new_one_liner'],
  },
};

export const L2_TOOLS: ToolDefinition[] = [
  ...L1_TOOLS,
  REWRITE_CONCEPT,
  UPDATE_ONE_LINER,
];
