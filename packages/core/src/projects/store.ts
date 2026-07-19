import type { Store } from '../storage/store';
import { isValidProjectId, type ProjectMeta } from './types';
import { getTemplateSchema, PROJECT_TEMPLATES } from './templates';

function projectMetaPath(id: string): string {
  return `projects/${id}/meta.json`;
}

export async function listProjects(store: Store): Promise<ProjectMeta[]> {
  let entries;
  try {
    entries = await store.listDir('projects');
  } catch {
    return [];
  }
  const out: ProjectMeta[] = [];
  for (const e of entries) {
    if (e.kind !== 'directory') continue;
    try {
      const meta = await store.readJSON<ProjectMeta>(projectMetaPath(e.name));
      out.push(meta);
    } catch {
      // No meta.json. Plugin scaffolds (mindbase_init_project < 0.1.2) and
      // hand-copied project dirs land here — if the directory has the v2
      // layout's two root files, register it by writing the missing meta
      // (self-heal) instead of hiding the project from every list/switch.
      const healed = await healProjectMeta(store, e.name);
      if (healed) out.push(healed);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function healProjectMeta(store: Store, dirName: string): Promise<ProjectMeta | null> {
  if (!isValidProjectId(dirName)) return null;
  try {
    const looksV2 =
      (await store.exists(`projects/${dirName}/README.md`)) &&
      (await store.exists(`projects/${dirName}/context.md`));
    if (!looksV2) return null;
    const meta: ProjectMeta = {
      id: dirName,
      name: dirName,
      created: new Date().toISOString(),
      schemaVersion: 1,
    };
    await store.writeJSON(projectMetaPath(dirName), meta);
    return meta;
  } catch {
    return null;
  }
}

export async function getProject(store: Store, id: string): Promise<ProjectMeta | null> {
  try {
    return await store.readJSON<ProjectMeta>(projectMetaPath(id));
  } catch {
    return null;
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'project';
}

export async function createProject(
  store: Store,
  init: { name: string; template?: ProjectMeta['template']; idHint?: string },
): Promise<ProjectMeta> {
  const base = init.idHint && isValidProjectId(init.idHint) ? init.idHint : slugify(init.name);
  let id = base;
  let suffix = 2;
  while (await store.exists(projectMetaPath(id))) {
    id = `${base}-${suffix++}`;
    if (suffix > 100) throw new Error('could not allocate project id');
  }
  const meta: ProjectMeta = {
    id,
    name: init.name.trim(),
    created: new Date().toISOString(),
    schemaVersion: 1,
    ...(init.template ? { template: init.template } : {}),
  };
  await store.writeJSON(projectMetaPath(id), meta);
  // Scaffold the empty wiki layout so readers don't crash on missing dirs.
  await store.writeText(`projects/${id}/wiki/concepts/.gitkeep`, '');
  await store.writeText(`projects/${id}/wiki/notes/.gitkeep`, '');
  await store.writeText(`projects/${id}/wiki/sources/.gitkeep`, '');
  await store.writeText(`projects/${id}/raw/.gitkeep`, '');
  // Write template schema.md if template is provided
  if (init.template && init.template in PROJECT_TEMPLATES) {
    const schemaBody = getTemplateSchema(init.template as keyof typeof PROJECT_TEMPLATES);
    await store.writeText(`projects/${id}/wiki/schema.md`, schemaBody);
  }
  return meta;
}

export async function deleteProject(store: Store, id: string): Promise<void> {
  // Soft delete: remove only meta.json. The on-disk data stays in
  // projects/<id>/. Real trash-and-rollback can come later (Phase 4).
  if (!isValidProjectId(id)) throw new Error(`invalid project id: ${id}`);
  await store.remove(projectMetaPath(id));
}
