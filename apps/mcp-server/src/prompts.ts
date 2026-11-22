import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './toolkit.js';
import { requireScope } from './toolkit.js';

function userMessage(text: string) {
  return {
    messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
  };
}

/**
 * Eleven prompt templates. Each returns an instruction the MCP client
 * (e.g. ChatGPT) should act on using the tools — nothing here executes edits.
 */
export function registerPrompts(server: McpServer, toolCtx: ToolContext): void {
  const scope = 'read:ai';

  const add = (
    name: string,
    description: string,
    argsSchema: Record<string, z.ZodTypeAny>,
    build: (args: any) => string,
  ) => {
    server.registerPrompt(
      name,
      { description, argsSchema },
      async (args: any) => {
        requireScope(toolCtx.ctx, scope);
        return { description: `Prompt: ${name}`, messages: userMessage(build(args)).messages };
      },
    );
  };

  add('cinematic_trailer', 'Plan a cinematic trailer from the timeline: pacing, text titles, music-driven pacing.', {
    projectId: z.string().uuid().optional(),
    durationSeconds: z.number().min(5).max(120).default(30),
  }, ({ projectId, durationSeconds }) => `You are a trailer director for FRAMEFORGE STUDIO.
Target: a ${durationSeconds}-second cinematic trailer${projectId ? ` for project ${projectId}` : ''}.
Steps:
1. Read the timeline (frameforge://timelines/{projectId}) and the media assets list.
2. Propose a plan: opening hook (0–3s), problem (3–8s), resolution (8–${Math.round(durationSeconds * 0.6)}s), call to action (final 3s).
3. Use "plan_edit" to validate each proposed action — show the plan and wait for confirmation before applying.
4. Split at markers, add text titles, set clips to 1.2x speed for the resolution section.
5. Add a marker at the final 3 seconds titled "CTA".
Never apply destructive actions (delete_clip, clear_timeline) without an explicit confirmation.`);

  add('talking_head_short', 'Build a 15–30s talking-head short from a studio-recorded clip.', {
    projectId: z.string().uuid().optional(),
    durationSeconds: z.number().min(10).max(60).default(30),
  }, ({ projectId, durationSeconds }) => `Create a ${durationSeconds}-second talking-head short${projectId ? ` for project ${projectId}` : ''}.
Steps:
1. List media assets and pick the best talking-head video.
2. Propose: trim to the strongest ${durationSeconds}s, add a text title ("${`feat`}" context), set volume to 1.0.
3. Mark the intro and CTA sections with markers.
4. Show the plan and wait for confirmation before applying.`);

  add('repurpose_for_reels', 'Repurpose a landscape video into a vertical Shorts/Reels/TikTok format.', {
    projectId: z.string().uuid(),
    aspectRatio: z.enum(['9:16', '1:1']).default('9:16'),
  }, ({ projectId, aspectRatio }) => `Repurpose project ${projectId} into ${aspectRatio} vertical video.
Steps:
1. Read the current project (frameforge://projects/${projectId}) — check width/height.
2. Propose: update aspect ratio, add a 9:16 canvas if needed (use re-cropping — never silently scale), place key shots centered.
3. Add captions (use the Subtitle Studio — Amharic: am, English: en).
4. Add a brand solid and a text title.
5. Show the plan and wait for explicit confirmation before applying.`);

  add('auto_subtitle_amharic', 'Generate an Amharic subtitle document for the current project.', {
    projectId: z.string().uuid(),
    sourceLanguage: z.string().default('en'),
  }, ({ projectId, sourceLanguage }) => `Create an Amharic subtitle document for project ${projectId}.
Steps:
1. Listen to the audio (you cannot: ask the user to enable speech-to-text, or paste transcribed text).
2. Use "create_subtitle_document" with language: "am" and the user-provided cues (or the paste text).
3. Verify every cue: start < end, non-empty text.
4. NEVER invent cue text or timestamps — mark the document as "needs review" until a provider transcribes.`);

  add('auto_subtitle_english', 'Generate an English subtitle document for the current project.', {
    projectId: z.string().uuid(),
  }, ({ projectId }) => `Create an English subtitle document for project ${projectId}.
Steps:
1. Ask the user for transcribed text or a provider key — speech-to-text requires provider keys.
2. Use "parse_subtitles"-equivalent: "create_subtitle_document" with language: "en" and user-provided cues or raw SRT/VTT text.
3. Verify all cues: start < end, non-empty text.
4. NEVER fabricate cues — show the plan and wait for confirmation.`);

  add('remove_silences', 'Find and remove silent sections from a project\'s audio timeline.', {
    projectId: z.string().uuid(),
    threshold: z.number().min(0.001).max(0.5).default(0.02),
  }, ({ projectId }) => `Remove silent sections from project ${projectId}.
Steps:
1. Read the timeline and locate audio clips.
2. Use the local silence analysis flow: compute RMS per window, find silent spans, split the clip around them ("split_clip" at each span boundary), remove the silent segments.
3. Every removal is undoable at the UI level — show the plan and wait for confirmation.
4. After applying, call "get_timeline_summary" to report the new duration.`);

  add('weekly_recap_video', 'Turn this week\'s work into a 30–60s recap video.', {
    projectId: z.string().uuid(),
    durationSeconds: z.number().min(15).max(120).default(30),
  }, ({ projectId, durationSeconds }) => `Plan a ${durationSeconds}-second recap of project ${projectId}.
Steps:
1. Read the timeline and recent markers.
2. Propose: text titles for each chapter (use "set_clip_text" or new text clips), marker at the top of each chapter, call-to-action at the end.
3. Show the plan and wait for confirmation.`);

  add('motion_title_intro', 'Plan a motion-graphics title sequence for a video start.', {
    compositionId: z.string().uuid().optional(),
    title: z.string().default('Your title'),
    durationSeconds: z.number().min(2).max(10).default(5),
  }, ({ compositionId, title, durationSeconds }) => `Plan a motion title "${title}" (~${durationSeconds}s)${compositionId ? ` for composition ${compositionId}` : ''}.
Steps:
1. Add or read a composition ("read:motion").
2. Create a text layer with the title ("add_layer").
3. Add keyframes: opacity 0→1, scale 0.8→1.0, position y +0.1→0 ("add_keyframe" with property paths transform.x/y, opacity).
4. Keep it simple: linear/easeOut easing, no infinite loops.
5. Render/preview guidance: the web app Motion Studio renders the preview — do not invent a renderer.`);

  add('render_batch', 'Queue and monitor render jobs for a project.', {
    projectId: z.string().uuid(),
    kind: z.enum(['export_video', 'export_audio', 'thumbnail', 'proxy']).default('export_video'),
  }, ({ projectId, kind }) => `Queue a ${kind} render for project ${projectId}.
Steps:
1. Check existing jobs with "list_render_jobs" (do not double-queue).
2. Queue the job with "create_render_job" (status: queued).
3. Save the job id — the user must poll "get_render_job" to check progress.
4. Do NOT tell the user the render is done until the job status is "completed" — never claim completion you cannot verify.`);

  add('audio_health_check', 'Run an honest audio-level review of the current timeline.', {
    projectId: z.string().uuid(),
  }, ({ projectId }) => `Check the audio levels of project ${projectId}.
Steps:
1. Read the timeline and locate audio clips.
2. Report: track count, clips, clip volumes, total duration.
3. Recommend: "set_clip_volume" only for very quiet or very hot clips (0.3–3.0 range recommended).
4. Do NOT fabricate RMS/loudness numbers — report what the timeline data shows.`);

  add('repurpose_for_youtube', 'Plan a YouTube-ready upload from the current project.', {
    projectId: z.string().uuid(),
    title: z.string().optional(),
  }, ({ projectId, title }) => `Plan a YouTube upload for project ${projectId}${title ? ` titled "${title}"` : ''}.
Steps:
1. Read the project and timeline.
2. Propose: 16:9 aspect, title + description in the project, a thumbnail render ("create_render_job" kind thumbnail).
3. Show the plan and wait for confirmation before creating jobs.
4. Do NOT claim the upload happened — the platform does not upload to YouTube.`);
}
