import type { EditorView } from '@codemirror/view';

export interface SlashCommand {
  category: 'Format' | 'Blocks' | 'Links' | 'AI' | 'Templates';
  label: string;
  hint?: string;
  insert: (view: EditorView) => void;
  ai?: 'continue' | 'summarize' | 'expand' | 'translate';
}

function insertAtCursor(view: EditorView, snippet: string, cursorOffset?: number) {
  const head = view.state.selection.main.head;
  // Remove the "/" the user typed (it triggered the menu)
  const text = view.state.doc.toString();
  const slashPos = text.lastIndexOf('/', head - 1);
  const from = slashPos >= 0 ? slashPos : head;
  const transaction = view.state.update({
    changes: { from, to: head, insert: snippet },
    selection: { anchor: from + (cursorOffset ?? snippet.length) },
  });
  view.dispatch(transaction);
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Format
  { category: 'Format', label: 'Heading 1', hint: 'Big section title', insert: (v) => insertAtCursor(v, '# ') },
  { category: 'Format', label: 'Heading 2', hint: 'Subsection', insert: (v) => insertAtCursor(v, '## ') },
  { category: 'Format', label: 'Heading 3', hint: 'Sub-subsection', insert: (v) => insertAtCursor(v, '### ') },
  { category: 'Format', label: 'Bullet list', insert: (v) => insertAtCursor(v, '- ') },
  { category: 'Format', label: 'Numbered list', insert: (v) => insertAtCursor(v, '1. ') },
  { category: 'Format', label: 'Checkbox', insert: (v) => insertAtCursor(v, '- [ ] ') },
  { category: 'Format', label: 'Quote', insert: (v) => insertAtCursor(v, '> ') },
  { category: 'Format', label: 'Divider', insert: (v) => insertAtCursor(v, '\n---\n\n') },
  // Blocks
  { category: 'Blocks', label: 'Code block', hint: 'Fenced code', insert: (v) => insertAtCursor(v, '```\n\n```\n', 4) },
  { category: 'Blocks', label: 'Callout', hint: '> [!note]', insert: (v) => insertAtCursor(v, '> [!note]\n> ', 12) },
  // Links
  { category: 'Links', label: 'Wikilink', hint: 'Link to another page', insert: (v) => insertAtCursor(v, '[[', 2) },
  { category: 'Links', label: 'External link', hint: '[text](url)', insert: (v) => insertAtCursor(v, '[](url)', 1) },
  // AI
  { category: 'AI', label: 'Continue writing', hint: 'AI extends the next sentence', ai: 'continue', insert: () => {} },
  { category: 'AI', label: 'Summarize selection', hint: 'Compress to a paragraph', ai: 'summarize', insert: () => {} },
  { category: 'AI', label: 'Expand bullet', hint: 'Develop a single bullet into a paragraph', ai: 'expand', insert: () => {} },
  { category: 'AI', label: 'Translate', hint: 'EN ⇄ ZH', ai: 'translate', insert: () => {} },
  // Templates
  { category: 'Templates', label: 'Daily note', insert: (v) => insertAtCursor(v, `# ${new Date().toISOString().slice(0, 10)}\n\n## What I did\n\n## What I learned\n\n## Tomorrow\n\n`) },
  { category: 'Templates', label: 'Meeting note', insert: (v) => insertAtCursor(v, `# Meeting · ${new Date().toLocaleDateString()}\n\n**Attendees**: \n\n## Agenda\n\n- \n\n## Notes\n\n## Decisions\n\n## Action items\n\n- [ ] \n`) },
  { category: 'Templates', label: 'Person profile', insert: (v) => insertAtCursor(v, `# Person Name\n\n**Role**: \n**Connected via**: \n\n## Background\n\n## Notable conversations\n\n## Threads to follow up\n\n`) },
];
