/**
 * Server-side brief utilities: HTML/text renderers, SMTP send, file persistence.
 * Core brief-building logic lives in @mindbase/core/brief/build.ts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { buildBrief as coreBuildBrief } from '@mindbase/core';
import type { BriefRecord, BriefSection } from '@mindbase/core';
import type { ServerContext } from '../context';
import type { DailyBriefConfig } from '../config';

// Re-export types so callers can import from here
export type { BriefRecord, BriefSection };
export { buildBrief } from '@mindbase/core';

// ── HTML Renderer ────────────────────────────────────────────────────────────

/**
 * Render [N] citation markers as <a> links in HTML.
 */
function renderCitationsHtml(
  text: string,
  citations: BriefRecord['citations'],
  publicUrl: string,
): string {
  return text.replace(/\[(\d+)\]/g, (match, nStr) => {
    const n = parseInt(nStr, 10);
    const cit = citations.find((c) => c.n === n);
    if (!cit) return match;
    const href = `${publicUrl}/article/${cit.slug}`;
    return `<a href="${href}" title="${escapeHtml(cit.title)}" style="color:#5b8dee;font-weight:600;text-decoration:none;">[${n}]</a>`;
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSectionHtml(
  section: BriefSection,
  citations: BriefRecord['citations'],
  publicUrl: string,
): string {
  const content = renderCitationsHtml(escapeHtml(section.content), citations, publicUrl);
  return `
    <h3 style="margin:20px 0 6px;font-size:14px;font-weight:700;color:#111;letter-spacing:-0.2px;">
      ${escapeHtml(section.heading)}
    </h3>
    <p style="margin:0 0 12px;line-height:1.65;color:#333;">${content}</p>`;
}

export function renderBriefHtml(brief: BriefRecord, publicUrl: string): string {
  const summary = renderCitationsHtml(
    escapeHtml(brief.summary),
    brief.citations,
    publicUrl,
  );

  const sections = brief.sections
    .map((s) => renderSectionHtml(s, brief.citations, publicUrl))
    .join('');

  const onThisDayHtml = brief.on_this_day
    ? `
    <div style="margin-top:24px;padding:12px 16px;background:#f8f4ee;border-left:3px solid #c8a96e;border-radius:4px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a07840;margin-bottom:4px;">On This Day</div>
      <div style="font-size:13px;color:#555;line-height:1.55;">
        ${renderCitationsHtml(escapeHtml(brief.on_this_day.content), brief.citations, publicUrl)}
      </div>
    </div>`
    : '';

  const inboxHtml =
    brief.inbox_pending != null && brief.inbox_pending > 0
      ? `
    <div style="margin-top:20px;padding:10px 16px;background:#eef3ff;border-left:3px solid #5b8dee;border-radius:4px;font-size:12px;color:#3a5fa8;">
      Inbox: ${brief.inbox_pending} unprocessed capture${brief.inbox_pending === 1 ? '' : 's'} waiting.
    </div>`
      : '';

  const reviewHtml =
    brief.review_pending != null && brief.review_pending > 0
      ? `
    <div style="margin-top:20px;padding:10px 16px;background:#f0fdf4;border-left:3px solid #22c55e;border-radius:4px;font-size:12px;color:#166534;">
      Review: You have ${brief.review_pending} card${brief.review_pending === 1 ? '' : 's'} due today.
      <a href="${publicUrl}/review" style="color:#15803d;font-weight:600;margin-left:6px;">Open review →</a>
    </div>`
      : '';

  const citationsListHtml =
    brief.citations.length > 0
      ? `
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e8e8e8;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999;margin-bottom:8px;">Sources</div>
      ${brief.citations
        .map(
          (c) =>
            `<div style="font-size:11.5px;margin-bottom:5px;color:#555;">
          <span style="color:#5b8dee;font-weight:600;">[${c.n}]</span>
          <a href="${publicUrl}/article/${c.slug}" style="color:#333;text-decoration:none;font-weight:500;">${escapeHtml(c.title)}</a>
          ${c.one_liner ? `<span style="color:#999;"> — ${escapeHtml(c.one_liner)}</span>` : ''}
        </div>`,
        )
        .join('')}
    </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>MindBase Brief · ${brief.date}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 12px;">
    <!-- Header -->
    <div style="padding:20px 28px 16px;background:#111;border-radius:10px 10px 0 0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:6px;">MindBase</div>
      <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">Morning Brief</div>
      <div style="font-size:12px;color:#666;margin-top:4px;">${brief.date}</div>
    </div>

    <!-- Body -->
    <div style="background:#fff;padding:24px 28px;border-radius:0 0 10px 10px;border:1px solid #e8e8e8;border-top:none;">
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#222;">${summary}</p>

      ${sections}
      ${onThisDayHtml}
      ${inboxHtml}
      ${reviewHtml}
      ${citationsListHtml}

      <div style="margin-top:28px;font-size:11px;color:#bbb;text-align:center;">
        Generated by <a href="${publicUrl}" style="color:#5b8dee;text-decoration:none;">MindBase</a>
        &middot; <a href="${publicUrl}" style="color:#5b8dee;text-decoration:none;">Open your wiki</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── Plain Text Renderer ──────────────────────────────────────────────────────

export function renderBriefText(brief: BriefRecord, publicUrl: string): string {
  const lines: string[] = [];

  lines.push(`MindBase Morning Brief — ${brief.date}`);
  lines.push('='.repeat(40));
  lines.push('');

  lines.push(brief.summary);
  lines.push('');

  for (const section of brief.sections) {
    lines.push(`## ${section.heading}`);
    lines.push(section.content);
    lines.push('');
  }

  if (brief.on_this_day) {
    lines.push('## On This Day');
    lines.push(brief.on_this_day.content);
    lines.push('');
  }

  if (brief.inbox_pending != null && brief.inbox_pending > 0) {
    lines.push(
      `Inbox: ${brief.inbox_pending} unprocessed capture${brief.inbox_pending === 1 ? '' : 's'} pending.`,
    );
    lines.push('');
  }

  if (brief.review_pending != null && brief.review_pending > 0) {
    lines.push('## Review');
    lines.push('');
    lines.push(
      `You have ${brief.review_pending} card${brief.review_pending === 1 ? '' : 's'} due today. [Open review →](${publicUrl}/review)`,
    );
    lines.push('');
  }

  if (brief.citations.length > 0) {
    lines.push('Sources:');
    for (const c of brief.citations) {
      lines.push(`[${c.n}]: ${publicUrl}/article/${c.slug}  ${c.title}`);
    }
  }

  return lines.join('\n');
}

// ── SMTP Send ────────────────────────────────────────────────────────────────

export async function sendBrief(
  brief: BriefRecord,
  cfg: DailyBriefConfig,
): Promise<{ messageId: string }> {
  const publicUrl = cfg.publicUrl ?? 'http://localhost:4321';
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: {
      user: cfg.smtp.user,
      pass: cfg.smtp.pass,
    },
  });

  const from = cfg.smtp.from ?? cfg.smtp.user;
  const subject = `MindBase Brief · ${brief.date}`;

  const info = await transport.sendMail({
    from,
    to: cfg.email,
    subject,
    text: renderBriefText(brief, publicUrl),
    html: renderBriefHtml(brief, publicUrl),
  });

  return { messageId: info.messageId };
}

// ── Persistence ──────────────────────────────────────────────────────────────

function briefsDir(dataDir: string): string {
  return path.join(dataDir, 'briefs');
}

function briefPath(dataDir: string, date: string): string {
  return path.join(briefsDir(dataDir), `${date}.json`);
}

export async function persistBrief(dataDir: string, brief: BriefRecord): Promise<void> {
  await fs.mkdir(briefsDir(dataDir), { recursive: true });
  await fs.writeFile(briefPath(dataDir, brief.date), JSON.stringify(brief, null, 2), 'utf-8');
}

export async function readBrief(dataDir: string, date: string): Promise<BriefRecord | null> {
  try {
    const text = await fs.readFile(briefPath(dataDir, date), 'utf-8');
    return JSON.parse(text) as BriefRecord;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export async function listBriefs(dataDir: string): Promise<BriefRecord[]> {
  try {
    await fs.mkdir(briefsDir(dataDir), { recursive: true });
    const files = await fs.readdir(briefsDir(dataDir));
    const briefs: BriefRecord[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const text = await fs.readFile(path.join(briefsDir(dataDir), f), 'utf-8');
        briefs.push(JSON.parse(text) as BriefRecord);
      } catch { /* skip malformed */ }
    }
    return briefs.sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

// ── Context adapter ──────────────────────────────────────────────────────────

/**
 * Thin adapter so ServerContext satisfies BuildBriefContext.
 * Wraps ctx.inbox into the minimal inbox interface expected by coreBuildBrief.
 */
export async function buildBriefFromServer(
  ctx: ServerContext,
  opts: { sinceHours?: number; includeOnThisDay?: boolean; includeQuiz?: boolean } = {},
): Promise<BriefRecord> {
  const publicUrl = ctx.config.dailyBrief?.publicUrl ?? 'http://localhost:4321';
  return coreBuildBrief(
    {
      store: ctx.store,
      getAdapter: ctx.getAdapter,
      config: ctx.config,
      inbox: {
        list: () => ctx.inbox.list(),
      },
      cards: ctx.cards,
      publicUrl,
    },
    opts,
  );
}
