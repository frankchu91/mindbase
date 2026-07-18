// apps/web/src/lib/wikiPaths.ts
// Mirror of packages/core's projectPaths — keep in sync.
// Web bundle can only `import type` from @mindbase/core, so we mirror runtime constants here.

export interface ProjectPaths {
  readme: string;
  context: string;
  indexYaml: string;
  soul: string;
  sourcesRoot: string;
  contributorsRoot: string;
  researchDir: string;
  rawDir: string;
  stateRoot: string;
  logsRoot: string;
  artifactsRoot: string;
}

export const projectPaths: ProjectPaths = {
  readme: 'README.md',
  context: 'context.md',
  indexYaml: 'index.yaml',
  soul: 'soul.md',
  sourcesRoot: 'sources',
  contributorsRoot: 'sources/contributors',
  researchDir: 'sources/research',
  rawDir: 'sources/raw',
  stateRoot: 'state',
  logsRoot: 'logs',
  artifactsRoot: 'artifacts',
};
