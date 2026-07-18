import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface MindbaseCliConfig {
  dataDir: string;
  adapter: 'anthropic' | 'openai' | 'lmstudio';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULTS: MindbaseCliConfig = {
  dataDir: process.cwd(),
  adapter: 'anthropic',
  model: 'claude-opus-4-7',
};

export async function loadConfig(opts: { configPath?: string; cwd?: string } = {}): Promise<MindbaseCliConfig> {
  const cwd = opts.cwd ?? process.cwd();
  let cfg: MindbaseCliConfig = { ...DEFAULTS, dataDir: cwd };

  // 1. mindbase.config.ts/js in cwd (or specified path)
  const configFile = opts.configPath ?? path.join(cwd, 'mindbase.config.ts');
  try {
    await fs.access(configFile);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const mod = await import(/* @vite-ignore */ configFile);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (mod.default) cfg = { ...cfg, ...mod.default };
  } catch {
    /* not present */
  }

  // 2. .mindbase.json
  try {
    const txt = await fs.readFile(path.join(cwd, '.mindbase.json'), 'utf8');
    cfg = { ...cfg, ...JSON.parse(txt) };
  } catch {
    /* not present */
  }

  // 3. Env vars override
  if (process.env['ANTHROPIC_API_KEY']) {
    cfg.adapter = cfg.adapter ?? 'anthropic';
    cfg.apiKey = process.env['ANTHROPIC_API_KEY'];
  }
  if (process.env['OPENAI_API_KEY']) {
    cfg.adapter = 'openai';
    cfg.apiKey = process.env['OPENAI_API_KEY'];
  }
  if (process.env['MINDBASE_MODEL']) cfg.model = process.env['MINDBASE_MODEL'];

  return cfg;
}
