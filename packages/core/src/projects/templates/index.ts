import { literatureReview } from './literature-review';
import { marketResearch } from './market-research';
import { investigation } from './investigation';
import { readingCompanion } from './reading-companion';
import { topicTracker } from './topic-tracker';

export const PROJECT_TEMPLATES = {
  'literature-review': literatureReview,
  'market-research': marketResearch,
  'investigation': investigation,
  'reading-companion': readingCompanion,
  'topic-tracker': topicTracker,
} as const;

export type ProjectTemplateId = keyof typeof PROJECT_TEMPLATES;

export function listTemplates(): Array<{ id: ProjectTemplateId; name: string; description: string }> {
  return Object.values(PROJECT_TEMPLATES).map(({ id, name, description }) => ({ id, name, description }));
}

export function getTemplateSchema(id: ProjectTemplateId): string {
  return PROJECT_TEMPLATES[id].schemaBody;
}
