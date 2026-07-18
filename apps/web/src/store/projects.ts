// apps/web/src/store/projects.ts
import { create } from 'zustand';
import type { ProjectMeta } from '@mindbase/core';

interface ProjectsState {
  projects: ProjectMeta[];
  currentProjectId: string;
  loading: boolean;
  load(): Promise<void>;
  switchTo(id: string): Promise<void>;
  create(name: string, template?: ProjectMeta['template']): Promise<ProjectMeta>;
}

export const useProjects = create<ProjectsState>((set, get) => ({
  projects: [],
  currentProjectId: 'default',
  loading: false,
  async load() {
    set({ loading: true });
    try {
      const r = await fetch('/api/projects');
      const data = (await r.json()) as { projects: ProjectMeta[]; currentProjectId: string };
      set({ projects: data.projects, currentProjectId: data.currentProjectId, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  async switchTo(id) {
    await fetch('/api/projects/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    set({ currentProjectId: id });
    // Hard reload — simplest path; resets all client state to the new project's data.
    window.location.reload();
  },
  async create(name, template) {
    const r = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, template }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? `HTTP ${r.status}`);
    }
    const meta = (await r.json()) as ProjectMeta;
    set({ projects: [...get().projects, meta].sort((a, b) => a.name.localeCompare(b.name)) });
    return meta;
  },
}));
