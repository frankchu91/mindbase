// Per-project file-path resolver for the wiki v2 layout.
// All paths are RELATIVE to <dataDir>/projects/<projectId>/.

export interface ProjectPaths {
  readme: string;
  context: string;
  indexYaml: string;
  soul: string;
  sourcesRoot: string;
  contributorsRoot: string;
  contributorDir: (user: string) => string;
  contributorDay: (user: string, isoDate: string) => string;
  researchDir: string;
  researchFile: (slug: string) => string;
  rawDir: string;
  rawDay: (isoDate: string) => string;
  stateRoot: string;
  stateDir: (agentName: string) => string;
  logsRoot: string;
  logsDay: (isoDate: string) => string;
  artifactsRoot: string;
}

export function projectPaths(): ProjectPaths {
  return {
    readme: 'README.md',
    context: 'context.md',
    indexYaml: 'index.yaml',
    soul: 'soul.md',
    sourcesRoot: 'sources',
    contributorsRoot: 'sources/contributors',
    contributorDir: (user) => `sources/contributors/${user}`,
    contributorDay: (user, isoDate) => `sources/contributors/${user}/${isoDate}.md`,
    researchDir: 'sources/research',
    researchFile: (slug) => `sources/research/${slug}.md`,
    rawDir: 'sources/raw',
    rawDay: (isoDate) => `sources/raw/${isoDate}`,
    stateRoot: 'state',
    stateDir: (agentName) => `state/${agentName}`,
    logsRoot: 'logs',
    logsDay: (isoDate) => `logs/${isoDate}.md`,
    artifactsRoot: 'artifacts',
  };
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
