import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export interface TemplateInfo {
  name: string;
  title: string;
  preview: string;
}

const VALID_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

function assertValidName(name: string): void {
  if (!name || !VALID_NAME_RE.test(name) || name.includes('..')) {
    throw new Error(`invalid template name: '${name}'`);
  }
}

// Human-readable labels for built-in templates. The template *body* uses
// `{{title}}` placeholders, but those are for substitution at create time —
// they make terrible menu labels. Map name → label here so the picker shows
// "Meeting" instead of "Meeting · {{title}} · {{date}}".
const TEMPLATE_LABELS: Record<string, string> = {
  note: 'Blank Note',
  daily: 'Daily Note',
  meeting: 'Meeting',
  person: 'Person',
  project: 'Project',
};

function displayTitleFor(name: string): string {
  if (TEMPLATE_LABELS[name]) return TEMPLATE_LABELS[name];
  // Fallback for user-added templates: Title-Case the filename
  // ("book-review" → "Book Review", "weekly_review" → "Weekly Review").
  const parts = name.split(/[-_]+/).filter(Boolean);
  if (parts.length === 0) return name;
  return parts.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
}

export class TemplateStore {
  private dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'templates');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async list(): Promise<TemplateInfo[]> {
    try {
      const files = await fs.readdir(this.dir);
      const out: TemplateInfo[] = [];
      for (const f of files) {
        if (!f.endsWith('.md')) continue;
        const name = f.replace(/\.md$/, '');
        const body = await fs.readFile(join(this.dir, f), 'utf8');
        const title = displayTitleFor(name);
        // Strip the H1 line from preview — leading "# {{title}} · {{date}}"
        // makes the preview unhelpful. Show the actual content below.
        const preview = body
          .replace(/^#\s+.+(\r?\n|$)/, '')
          .slice(0, 100)
          .replace(/\s+/g, ' ')
          .trim();
        out.push({ name, title, preview });
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async get(name: string): Promise<string | null> {
    assertValidName(name);
    try {
      return await fs.readFile(join(this.dir, `${name}.md`), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async set(name: string, content: string): Promise<void> {
    assertValidName(name);
    await this.ensureDir();
    await fs.writeFile(join(this.dir, `${name}.md`), content, 'utf8');
  }

  async delete(name: string): Promise<void> {
    assertValidName(name);
    try {
      await fs.unlink(join(this.dir, `${name}.md`));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }

  apply(body: string, vars: Record<string, string>): string {
    let out = body;
    for (const [key, val] of Object.entries(vars)) {
      // split/join (no regex) so values with $-sequences don't get interpreted
      // as replacement backrefs, and so each occurrence is replaced.
      out = out.split(`{{${key}}}`).join(val);
    }
    return out;
  }

  async ensureDefaults(): Promise<void> {
    await this.ensureDir();
    for (const [name, body] of Object.entries(DEFAULT_TEMPLATES)) {
      const existing = await this.get(name);
      if (existing !== null) continue;
      await fs.writeFile(join(this.dir, `${name}.md`), body, 'utf8');
    }
  }
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  note: `# {{title}}\n\n`,
  daily: `# {{date_long}}\n\n← [[{{yesterday_slug}}|Yesterday]]  ·  [[{{tomorrow_slug}}|Tomorrow]] →\n\n## What I did\n\n## What I learned\n\n## Tomorrow\n\n`,
  meeting: `# Meeting · {{title}} · {{date}}\n\n**Attendees**: \n\n## Agenda\n\n- \n\n## Notes\n\n## Decisions\n\n## Action items\n\n- [ ] \n`,
  person: `# {{title}}\n\n**Role**: \n**Connected via**: \n\n## Background\n\n## Notable conversations\n\n## Threads to follow up\n\n`,
  project: `# {{title}}\n\n**Status**: Active  \n**Started**: {{date}}\n\n## Goal\n\n## Current state\n\n## Blockers\n\n## Next steps\n\n- [ ] \n`,
};
