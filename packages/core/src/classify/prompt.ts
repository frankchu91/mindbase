import type { ChatMessage } from '../types';
import type { Folder } from './folders';

const MAX_NOTE_CHARS = 4000;

const FIXED_HEADER = `You are a note classifier for MindBase. Your job: read a note and pick the single best-fitting folder from a fixed list.

OUTPUT FORMAT — MUST be valid JSON, nothing else:
  {"folder": "<one of the available folder paths>", "reason": "<one sentence>"}

DECISION PROCESS — follow in order:
1. Read the note (title + body) and identify its core topic.
2. Look at "Available folders" below to see what folders exist and what they're called.
3. Look at "Existing notes per folder" — each folder's recent note titles show you what kind of content actually lives there. This is your strongest signal: pick the folder whose existing notes look most conceptually similar to the new note. The folder's path and display name are just labels; the notes inside are the real semantics.
4. If a folder has no notes yet ("no notes yet — pioneer this folder if appropriate"), you may still pick it when the folder's name/path clearly matches the new note's topic.
5. If the user has supplied "User's classification preferences" above, those take precedence over your own judgment when they conflict.

RULES:
- \`folder\` MUST be exactly one of the paths in "Available folders" below.
- Never invent a new folder path.
- If genuinely unable to classify (note is empty, off-topic, ambiguous beyond the rules), output {"folder": "inbox", "reason": "..."}.
- Output JSON only. No markdown fences, no preamble.
`;

export interface BuildClassifyPromptInput {
  folders: Folder[];
  samples: Map<string, string[]>;
  userRules: string;
  noteTitle: string;
  noteContent: string;
}

export function buildClassifyPrompt(input: BuildClassifyPromptInput): ChatMessage[] {
  const { folders, samples, userRules, noteTitle, noteContent } = input;

  const parts: string[] = [FIXED_HEADER];

  // User-editable section (omit entirely if empty so there's no orphan header)
  if (userRules.trim().length > 0) {
    parts.push('');
    parts.push("## User's classification preferences");
    parts.push('');
    parts.push(userRules);
  }

  // Fixed footer: dynamic state (folders + samples)
  parts.push('');
  parts.push('## Available folders (the ONLY valid folder values)');
  for (const f of folders) {
    parts.push(`- ${f.path} — ${f.name}`);
  }

  parts.push('');
  parts.push('## Existing notes per folder (in-context examples — recent first)');
  for (const f of folders) {
    parts.push('');
    parts.push(`### ${f.path}`);
    const titles = samples.get(f.path) ?? [];
    if (titles.length === 0) {
      parts.push('_(no notes yet — pioneer this folder if appropriate)_');
    } else {
      for (const t of titles) parts.push(`- ${t}`);
    }
  }

  const systemContent = parts.join('\n');

  let body = noteContent;
  if (body.length > MAX_NOTE_CHARS) {
    body = body.slice(0, MAX_NOTE_CHARS) + '\n\n[…body truncated]';
  }

  const userContent = `## Note to classify\n\nTitle: ${noteTitle}\n---\n${body}`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}
