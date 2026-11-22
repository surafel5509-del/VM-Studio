'use client';

import { create } from 'zustand';
import { getSupabase } from '@/lib/supabase';
import type { Project } from '@frameforge/shared';

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  loading: boolean;
  error: string | null;

  workspaceId: string | null;

  loadProjects: () => Promise<void>;
  ensureWorkspace: () => Promise<string | null>;
  createProject: (name: string, aspectRatio?: string) => Promise<Project | null>;
  updateProject: (projectId: string, patch: Partial<Project>) => Promise<boolean>;
  deleteProject: (projectId: string) => Promise<boolean>;
  archiveProject: (projectId: string) => Promise<boolean>;
  setActiveProject: (id: string | null) => void;
}

export const useProjects = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  loading: false,
  error: null,
  workspaceId: null,

  async ensureWorkspace() {
    const existing = get().workspaceId;
    if (existing) return existing;
    try {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;

      // find or create the user's personal workspace
      const { data: workspaces, error: listError } = await supabase.from('workspaces').select('*').eq('owner_id', user.id).limit(1);
      if (listError) throw listError;
      if (workspaces && workspaces.length > 0) {
        const w = workspaces[0]!;
        set({ workspaceId: w.id });
        return w.id as string;
      }
      const { data: created, error: createError } = await supabase
        .from('workspaces')
        .insert({ name: 'My Studio', owner_id: user.id, plan: 'free' })
        .select()
        .single();
      if (createError) throw createError;
      set({ workspaceId: created.id });
      return created.id as string;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to ensure workspace' });
      return null;
    }
  },

  async loadProjects() {
    set({ loading: true, error: null });
    try {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        set({ projects: [], loading: false });
        return;
      }
      const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      set({ projects: (data ?? []) as Project[], loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load projects' });
    }
  },

  async createProject(name, aspectRatio = '16:9') {
    try {
      const workspaceId = await get().ensureWorkspace();
      if (!workspaceId) throw new Error('Workspace could not be created');
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error('Not signed in');
      const res = aspectDimensions(aspectRatio);
      const { data, error } = await supabase
        .from('projects')
        .insert({
          workspace_id: workspaceId,
          owner_id: user.id,
          name,
          aspect_ratio: aspectRatio,
          width: res.width,
          height: res.height,
          status: 'draft',
        })
        .select()
        .single();
      if (error) throw error;
      const project = data as Project;
      // seed an empty timeline row so the editor has something to load
      const { createDefaultTimeline } = await import('@frameforge/shared');
      await supabase.from('timeline_states').insert({ project_id: project.id, data: createDefaultTimeline(), version: 1 });
      set({ projects: [project, ...get().projects], activeProjectId: project.id });
      return project;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create project';
      set({ error: msg });
      return null;
    }
  },

  async updateProject(projectId, patch) {
    try {
      const supabase = getSupabase();
      const payload: Record<string, unknown> = {};
      if (patch.name !== undefined) payload.name = patch.name;
      if (patch.description !== undefined) payload.description = patch.description;
      if (patch.status !== undefined) payload.status = patch.status;
      if (patch.aspect_ratio !== undefined) payload.aspect_ratio = patch.aspect_ratio;
      if (patch.width !== undefined) payload.width = patch.width;
      if (patch.height !== undefined) payload.height = patch.height;
      if (patch.fps !== undefined) payload.fps = patch.fps;
      const { error } = await supabase.from('projects').update(payload).eq('id', projectId);
      if (error) throw error;
      set({ projects: get().projects.map((p) => (p.id === projectId ? { ...p, ...patch } : p)) });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to update project' });
      return false;
    }
  },

  async deleteProject(projectId) {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw error;
      set({ projects: get().projects.filter((p) => p.id !== projectId), activeProjectId: get().activeProjectId === projectId ? null : get().activeProjectId });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete project' });
      return false;
    }
  },

  async archiveProject(projectId) {
    return get().updateProject(projectId, { status: 'archived' });
  },

  setActiveProject: (id) => set({ activeProjectId: id }),
}));

function aspectDimensions(aspectRatio: string): { width: number; height: number } {
  const map: Record<string, [number, number]> = {
    '16:9': [1920, 1080],
    '9:16': [1080, 1920],
    '1:1': [1080, 1080],
    '4:5': [1080, 1350],
    '4:3': [1440, 1080],
    '21:9': [2560, 1080],
  };
  const [w, h] = map[aspectRatio] ?? [1920, 1080];
  return { width: w, height: h };
}
