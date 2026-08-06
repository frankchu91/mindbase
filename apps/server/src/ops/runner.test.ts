import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runContributePlan, applyContributePlan, runBuild, type OpEvent, type OpsCtx } from './runner';
import type { ChatChunk, ChatMessage } from '@mindbase/core';

let root: string;

function scriptedCtx(outputs: string[]): OpsCtx {
  let call = 0;
  return {
    projectRoot: root,
    projectId: 'test-proj',
    config: { model: 'fake-model' },
    getAdapter: () => ({
      chat: (_req: { model: string; messages: ChatMessage[] }): AsyncIterable<ChatChunk> => {
        const text = outputs[Math.min(call++, outputs.length - 1)]!;
        return (async function* () {
          yield { kind: 'delta', text } as ChatChunk;
        })();
      },
    }),
    findRelated: async () => [],
  };
}

function collect(): { events: OpEvent[]; emit: (e: OpEvent) => void } {
  const events: OpEvent[] = [];
  return { events, emit: (e) => events.push(e) };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mb-runner-'));
  await mkdir(join(root, 'sources', 'contributors', 'u'), { recursive: true });
  await mkdir(join(root, 'sources', 'research'), { recursive: true });
  await writeFile(join(root, 'context.md'), '# T — Context\n\n## Learnings\n\n- old\n', 'utf-8');
});

describe('contribute plan → apply', () => {
  const planJson = JSON.stringify({
    takeaways: ['t1', 't2'],
    plan: [
      { kind: 'create_research_page', slug: 'new-idea', markdown: '# New Idea\n\nbody' },
      { kind: 'append_context_section', section: 'Learnings', markdown: '- fresh learning' },
    ],
  });

  it('emits plan, applies selected actions, logs', async () => {
    const c1 = collect();
    await runContributePlan(scriptedCtx([planJson]), 'my new thought', c1.emit);
    const plan = c1.events.find((e) => e.kind === 'plan');
    expect(plan && plan.kind === 'plan' && plan.plan).toHaveLength(2);
    const planId = plan!.kind === 'plan' ? plan!.planId : '';

    const c2 = collect();
    await applyContributePlan(planId, [0, 1], c2.emit);
    const applied = c2.events.find((e) => e.kind === 'applied');
    expect(applied && applied.kind === 'applied' && applied.applied).toEqual(['sources/research/new-idea.md', 'context.md']);
    const log = await readFile(join(root, 'logs', `${new Date().toISOString().slice(0, 10)}.md`), 'utf-8');
    expect(log).toMatch(/contribute \| applied 2/);
  });

  it('deselecting an action skips it', async () => {
    const c1 = collect();
    await runContributePlan(scriptedCtx([planJson]), 'thought', c1.emit);
    const plan = c1.events.find((e) => e.kind === 'plan')!;
    const planId = plan.kind === 'plan' ? plan.planId : '';
    const c2 = collect();
    await applyContributePlan(planId, [1], c2.emit);
    const applied = c2.events.find((e) => e.kind === 'applied');
    expect(applied && applied.kind === 'applied' && applied.applied).toEqual(['context.md']);
    const pages = await readdir(join(root, 'sources', 'research'));
    expect(pages).toHaveLength(0);
  });

  it('unknown planId errors cleanly', async () => {
    const c = collect();
    await applyContributePlan('nope-id', [0], c.emit);
    expect(c.events.some((e) => e.kind === 'error')).toBe(true);
  });
});

describe('build', () => {
  it('rewrites context with snapshot + log', async () => {
    await writeFile(join(root, 'sources', 'contributors', 'u', '2099-01-01.md'), '## 10:00\n\nnew stuff', 'utf-8');
    const out = JSON.stringify({ actions: [{ kind: 'update_context', markdown: '# T — Context\n\n## Learnings\n\n- rebuilt\n' }] });
    const c = collect();
    await runBuild(scriptedCtx([out]), c.emit);
    expect(c.events.some((e) => e.kind === 'done')).toBe(true);
    expect(await readFile(join(root, 'context.md'), 'utf-8')).toContain('rebuilt');
    expect((await readdir(join(root, 'state', 'builder', 'snapshots'))).length).toBe(1);
    const log = await readFile(join(root, 'logs', `${new Date().toISOString().slice(0, 10)}.md`), 'utf-8');
    expect(log).toMatch(/build \| applied 1/);
  });

  it('rejects a concurrent build for the same project', async () => {
    // First build's adapter never finishes until we let it; start it and
    // immediately try a second one.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slowCtx: OpsCtx = {
      ...scriptedCtx(['{}']),
      getAdapter: () => ({
        chat: (): AsyncIterable<ChatChunk> =>
          (async function* () {
            await gate;
            yield { kind: 'delta', text: JSON.stringify({ actions: [{ kind: 'update_context', markdown: 'x' }] }) } as ChatChunk;
          })(),
      }),
    };
    const c1 = collect();
    const first = runBuild(slowCtx, c1.emit);
    await new Promise((r) => setTimeout(r, 20));
    const c2 = collect();
    await runBuild(scriptedCtx(['{}']), c2.emit);
    expect(c2.events.some((e) => e.kind === 'error' && /already running/.test(e.error))).toBe(true);
    release();
    await first;
  });
});
