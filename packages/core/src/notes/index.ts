export { TemplateStore } from './template-store';
export type { TemplateInfo } from './template-store';
export {
  createNote,
  createOrOpenDaily,
  slugify,
  todayIsoDate,
  shiftDays,
  buildStandardVars,
  SlugConflictError,
  dayNameOf,
  TEMPLATE_TO_KIND,
} from './create-note';
export type {
  CreateNoteParams,
  CreateNoteResult,
} from './create-note';
