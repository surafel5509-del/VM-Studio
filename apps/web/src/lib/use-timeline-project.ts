'use client';

import { useAuth } from '@/lib/stores/auth.store';
import { useProjects } from '@/lib/stores/project.store';
import { useTimeline } from '@/lib/stores/timeline.store';
import { useMedia, type MediaState } from '@/lib/stores/media.store';
import { getSupabase } from '@/lib/supabase';
import { useEffect, useMemo, useState } from 'react';
import type { ProjectTimeline } from '@frameforge/shared';

/**
 * Loads the timeline for a project into the shared store.
 * Used by every studio page so they all operate on the same project state.
 */
export function useTimelineProject(projectId: string): {
  project: import('@frameforge/shared').Project | null;
  timeline: import('@frameforge/shared').ProjectTimeline;
  ready: boolean;
  media: MediaState;
} {
  const { user } = useAuth();
  const { projects, loadProjects } = useProjects();
  const media = useMedia();
  const { timeline, loadTimeline, loadDefault, projectId: activeProjectId } = useTimeline();
  const [ready, setReady] = useState(false);

  const project = useMemo(() => projects.find((p) => p.id === projectId) ?? null, [projects, projectId]);

  useEffect(() => {
    if (!user) return;
    void loadProjects();
  }, [user, loadProjects]);

  useEffect(() => {
    if (!user || !projectId) return;
    if (activeProjectId === projectId && timeline.clips.length > 0) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('timeline_states')
          .select('data, version')
          .eq('project_id', projectId)
          .maybeSingle();
        if (data?.data && typeof data.data === 'object' && data.data.tracks) {
          const tl = data.data as ProjectTimeline;
          if (tl.tracks.length > 0) loadTimeline(tl, projectId);
          else loadDefault(projectId);
        } else {
          loadDefault(projectId);
        }
        if (media.assets.length === 0) await media.load();
        setReady(true);
      } catch {
        loadDefault(projectId);
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId]);

  return { project, timeline, ready, media };
}
