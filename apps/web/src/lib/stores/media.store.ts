'use client';

import { create } from 'zustand';
import { getSupabase } from '@/lib/supabase';
import type { MediaAsset } from '@frameforge/shared';

const BUCKET = 'media';

export interface UploadResult {
  asset: MediaAsset;
  skipped?: boolean;
}

export interface MediaState {
  assets: MediaAsset[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  uploadFile: (file: File, projectId?: string | null) => Promise<MediaAsset | null>;
  deleteAsset: (asset: MediaAsset) => Promise<boolean>;
  attachToProject: (assetId: string, projectId: string | null) => Promise<boolean>;
  getSignedUrl: (storagePath: string) => Promise<string | null>;
}

async function probeVideo(file: File): Promise<{ duration: number | null; width: number | null; height: number | null }> {
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|mkv|webm|avi)$/i.test(file.name)) {
    return { duration: null, width: null, height: null };
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve({ duration: null, width: null, height: null });
    }, 15000);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve({
        duration: video.duration && Number.isFinite(video.duration) ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      });
    };
    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve({ duration: null, width: null, height: null });
    };
    video.src = url;
  });
}

async function probeAudio(file: File): Promise<{ duration: number | null }> {
  if (!file.type.startsWith('audio/') && !/\.(mp3|wav|aac|flac)$/i.test(file.name)) {
    return { duration: null };
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    const timeout = setTimeout(() => {
      clearTimeout(timeout);
      resolve({ duration: null });
    }, 15000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      clearTimeout(timeout);
      resolve({ duration: audio.duration && Number.isFinite(audio.duration) ? audio.duration : null });
    };
    audio.onerror = () => {
      clearTimeout(timeout);
      resolve({ duration: null });
    };
    audio.src = url;
  });
}

async function probeImage(file: File): Promise<{ width: number | null; height: number | null }> {
  if (!file.type.startsWith('image/')) return { width: null, height: null };
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = document.createElement('img');
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function kindFromMime(mimeType: string | null, name: string): 'video' | 'audio' | 'image' {
  if (mimeType) {
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
  }
  if (/\.(mp4|mov|mkv|webm|avi)$/i.test(name)) return 'video';
  if (/\.(mp3|wav|aac|flac|ogg|m4a)$/i.test(name)) return 'audio';
  return 'image';
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export const useMedia = create<MediaState>((set, get) => ({
  assets: [],
  loading: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.from('media_assets').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      set({ assets: (data ?? []) as MediaAsset[], loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load media' });
    }
  },

  async uploadFile(file, projectId = null) {
    set({ error: null });
    try {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error('Not signed in');

      const kind = kindFromMime(file.type, file.name);
      const ext = file.name.split('.').pop() ?? 'bin';
      const safeName = safeFileName(file.name);
      const storagePath = `${user.id}/${projectId ?? 'shared'}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
        contentType: file.type || undefined,
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // probe metadata
      let durationSeconds: number | null = null;
      let width: number | null = null;
      let height: number | null = null;
      if (kind === 'video') {
        const p = await probeVideo(file);
        durationSeconds = p.duration;
        width = p.width;
        height = p.height;
      } else if (kind === 'audio') {
        const p = await probeAudio(file);
        durationSeconds = p.duration;
      } else {
        const p = await probeImage(file);
        width = p.width;
        height = p.height;
      }

      const { data, error } = await supabase
        .from('media_assets')
        .insert({
          workspace_id: null,
          project_id: projectId,
          owner_id: user.id,
          name: file.name,
          storage_path: storagePath,
          kind,
          mime_type: file.type || null,
          size_bytes: file.size,
          duration_seconds: durationSeconds,
          width,
          height,
          metadata: { originalName: file.name, ext },
        })
        .select()
        .single();
      if (error) throw new Error(`Metadata save failed: ${error.message}`);

      const asset = data as MediaAsset;
      set({ assets: [asset, ...get().assets] });
      return asset;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      set({ error: msg });
      return null;
    }
  },

  async deleteAsset(asset) {
    try {
      const supabase = getSupabase();
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([asset.storage_path]);
      if (storageError) throw new Error(storageError.message);
      const { error } = await supabase.from('media_assets').delete().eq('id', asset.id);
      if (error) throw new Error(error.message);
      set({ assets: get().assets.filter((a) => a.id !== asset.id) });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Delete failed' });
      return false;
    }
  },

  async attachToProject(assetId, projectId) {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('media_assets').update({ project_id: projectId }).eq('id', assetId);
      if (error) throw new Error(error.message);
      set({
        assets: get().assets.map((a) => (a.id === assetId ? { ...a, project_id: projectId } : a)),
      });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Attach failed' });
      return false;
    }
  },

  async getSignedUrl(storagePath) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
      if (error) return null;
      return data?.signedUrl ?? null;
    } catch {
      return null;
    }
  },
}));
