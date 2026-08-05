// apps/server/src/routes/ollama.ts
//
// Local-model onboarding endpoints: hardware profile, Ollama status probe,
// and a pull proxy that streams download progress as SSE. The wizard's
// connectivity verify reuses the existing POST /api/config/test.
import { Router } from 'express';
import { execFile } from 'node:child_process';
import { systemProfile } from '../lib/system-info';
import { recommendModels, allowedModels } from '../lib/model-recommend';

const OLLAMA = 'http://localhost:11434';

function binaryInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = execFile('ollama', ['--version'], { timeout: 1500 }, (err) => resolve(!err));
    child.on('error', () => resolve(false));
  });
}

async function probeRunning(): Promise<boolean> {
  try {
    const r = await fetch(`${OLLAMA}/api/version`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch {
    return false;
  }
}

export function ollamaRoutes(): Router {
  const router = Router();

  // GET /api/system — hardware profile + model recommendations for it.
  router.get('/system', (_req, res) => {
    const profile = systemProfile();
    res.json({ profile, recommendations: recommendModels(profile) });
  });

  // GET /api/ollama/status → { state, version?, models }
  router.get('/ollama/status', async (_req, res) => {
    if (await probeRunning()) {
      let version: string | undefined;
      let models: string[] = [];
      try {
        const v = (await (await fetch(`${OLLAMA}/api/version`)).json()) as { version?: string };
        version = v.version;
        const tags = (await (await fetch(`${OLLAMA}/api/tags`)).json()) as { models?: Array<{ name: string }> };
        models = (tags.models ?? []).map((m) => m.name);
      } catch { /* partial info is fine */ }
      return res.json({ state: 'running', version, models });
    }
    const installed = await binaryInstalled();
    return res.json({ state: installed ? 'stopped' : 'not-installed', models: [] });
  });

  // POST /api/ollama/pull { model } — proxy Ollama's streaming pull as SSE.
  router.post('/ollama/pull', async (req, res) => {
    const model = req.body?.model as string | undefined;
    if (!model || !allowedModels().has(model)) {
      return res.status(400).json({ error: `Model not in the recommended set: ${model ?? '(missing)'}` });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    const upstream = new AbortController();
    // NB: req 'close' fires as soon as the request body is consumed on
    // modern Node — it is NOT a client-disconnect signal. res 'close' is.
    res.on('close', () => upstream.abort());

    try {
      const r = await fetch(`${OLLAMA}/api/pull`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, stream: true }),
        signal: upstream.signal,
      });
      if (!r.ok || !r.body) {
        send({ kind: 'error', error: `Ollama responded HTTP ${r.status}` });
        return res.end();
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const p = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string };
            if (p.error) send({ kind: 'error', error: p.error });
            else send({ kind: 'progress', status: p.status, completed: p.completed, total: p.total });
          } catch { /* skip malformed line */ }
        }
      }
      send({ kind: 'done' });
    } catch (e) {
      if (!upstream.signal.aborted) send({ kind: 'error', error: (e as Error).message });
    }
    return res.end();
  });

  return router;
}
