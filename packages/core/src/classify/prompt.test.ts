import { describe, it, expect } from 'vitest';
import { buildClassifyPrompt } from './prompt';
import type { Folder } from './folders';

const FOLDERS: Folder[] = [
  { path: 'inbox', name: 'Inbox', created_at: '2026-05-23T00:00Z' },
  { path: 'journal', name: '日记', created_at: '2026-05-23T00:01Z' },
  { path: 'knowledge', name: '知识资料', created_at: '2026-05-23T00:02Z' },
  { path: 'knowledge/ml', name: '机器学习', created_at: '2026-05-23T00:03Z' },
];

const SAMPLES = new Map<string, string[]>([
  ['journal', ['morning thoughts', 'daily 2026-05-19']],
  ['knowledge/ml', ['transformer deep dive', 'attention notes']],
]);

describe('buildClassifyPrompt', () => {
  it('returns a [system, user] message pair', () => {
    const msgs = buildClassifyPrompt({
      folders: FOLDERS, samples: SAMPLES, userRules: '',
      noteTitle: 'My note', noteContent: 'Body here',
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[1]!.role).toBe('user');
  });

  it('system message includes JSON output contract', () => {
    const msgs = buildClassifyPrompt({
      folders: FOLDERS, samples: SAMPLES, userRules: '',
      noteTitle: 'X', noteContent: 'Y',
    });
    const sys = msgs[0]!.content as string;
    expect(sys).toContain('valid JSON');
    expect(sys).toContain('"folder"');
    expect(sys).toContain('"reason"');
  });

  it('system message explicitly instructs the LLM to use existing-notes-per-folder as the decision signal', () => {
    const msgs = buildClassifyPrompt({
      folders: FOLDERS, samples: SAMPLES, userRules: '',
      noteTitle: 'X', noteContent: 'Y',
    });
    const sys = msgs[0]!.content as string;
    // Without this guidance the LLM treats samples as decoration. Lock it in.
    expect(sys).toMatch(/Existing notes per folder/i);
    expect(sys).toMatch(/conceptually similar|notes inside are the real|recent note titles/i);
  });

  it('system message lists every folder path as valid', () => {
    const msgs = buildClassifyPrompt({
      folders: FOLDERS, samples: SAMPLES, userRules: '',
      noteTitle: 'X', noteContent: 'Y',
    });
    const sys = msgs[0]!.content as string;
    for (const f of FOLDERS) {
      expect(sys).toContain(f.path);
      expect(sys).toContain(f.name);
    }
  });

  it('system message embeds the user rules verbatim when provided', () => {
    const userRules = '# My rules\n\n1. Always put code stuff in knowledge';
    const msgs = buildClassifyPrompt({
      folders: FOLDERS, samples: SAMPLES, userRules,
      noteTitle: 'X', noteContent: 'Y',
    });
    const sys = msgs[0]!.content as string;
    expect(sys).toContain(userRules);
  });

  it('system message handles empty user rules without leaving a gap', () => {
    const msgs = buildClassifyPrompt({
      folders: FOLDERS, samples: SAMPLES, userRules: '',
      noteTitle: 'X', noteContent: 'Y',
    });
    const sys = msgs[0]!.content as string;
    // The H2 header is only inserted when userRules is non-empty.
    // (The phrase "User's classification preferences" may still appear in the
    // fixed DECISION PROCESS as a reference to the optional section.)
    expect(sys).not.toContain("## User's classification preferences");
  });

  it('system message includes sample notes per folder', () => {
    const msgs = buildClassifyPrompt({
      folders: FOLDERS, samples: SAMPLES, userRules: '',
      noteTitle: 'X', noteContent: 'Y',
    });
    const sys = msgs[0]!.content as string;
    expect(sys).toContain('morning thoughts');
    expect(sys).toContain('transformer deep dive');
  });

  it('system message marks folders that have no sample notes', () => {
    const msgs = buildClassifyPrompt({
      folders: FOLDERS, samples: SAMPLES, userRules: '',
      noteTitle: 'X', noteContent: 'Y',
    });
    const sys = msgs[0]!.content as string;
    // 'inbox' is in FOLDERS but has no entry in SAMPLES
    expect(sys).toMatch(/inbox[\s\S]+no notes yet/);
  });

  it('user message includes title and body', () => {
    const msgs = buildClassifyPrompt({
      folders: FOLDERS, samples: SAMPLES, userRules: '',
      noteTitle: 'My useContext thoughts', noteContent: 'useContext lets me...',
    });
    const user = msgs[1]!.content as string;
    expect(user).toContain('My useContext thoughts');
    expect(user).toContain('useContext lets me');
  });

  it('user message truncates very long bodies at 4000 chars', () => {
    const longBody = 'a'.repeat(5000);
    const msgs = buildClassifyPrompt({
      folders: FOLDERS, samples: SAMPLES, userRules: '',
      noteTitle: 'X', noteContent: longBody,
    });
    const user = msgs[1]!.content as string;
    expect(user.length).toBeLessThan(longBody.length + 200);
    expect(user).toContain('truncated');
  });
});
