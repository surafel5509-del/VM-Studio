/**
 * Shared domain types for FRAMEFORGE STUDIO.
 * These types are the single source of truth used by the web app,
 * the MCP server and the test suite.
 */

export type TrackKind = 'video' | 'audio';

export type LayerKind =
  | 'video'
  | 'image'
  | 'solid'
  | 'text'
  | 'audio'
  | 'motion';

export interface Transform {
  x: number; // normalized offset (-1..1 relative to frame)
  y: number;
  scale: number; // 1 = 100%
  rotation: number; // degrees
}

export interface TimelineClip {
  id: string;
  trackId: string;
  /** null for solid/text/motion layers without a media source */
  mediaId: string | null;
  layerKind: LayerKind;
  name: string;
  start: number; // seconds on timeline
  duration: number; // seconds on timeline
  /** source in-point (media seconds) */
  inPoint: number;
  /** source out-point (media seconds) — null = media end */
  outPoint: number | null;
  /** playback speed multiplier, 1 = normal */
  speed: number;
  volume: number; // 0..1
  opacity: number; // 0..1
  transform: Transform;
  /** solid color for solid/text layers */
  solidColor?: string;
  /** text content for text layers */
  text?: string;
  createdAt: number;
}

export interface TimelineTrack {
  id: string;
  name: string;
  kind: TrackKind;
  locked: boolean;
  visible: boolean;
  muted: boolean;
  solo: boolean;
}

export interface TimelineMarker {
  id: string;
  time: number; // seconds
  label: string;
}

export interface ProjectTimeline {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
}

export interface Project {
  id: string;
  workspace_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  aspect_ratio: string;
  width: number;
  height: number;
  fps: number;
  status: 'draft' | 'rendering' | 'archived';
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MediaAsset {
  id: string;
  workspace_id: string | null;
  project_id: string | null;
  owner_id: string;
  name: string;
  storage_path: string;
  kind: 'video' | 'audio' | 'image';
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Keyframe {
  id: string;
  time: number; // seconds relative to composition
  value: number; // property value (position.x, scale, opacity, rotation...)
  easing: EasingType;
}

export type EasingType =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInOutBack'
  | 'easeInOutElastic'
  | 'cubicBezier';

export interface BezierEasing {
  type: 'cubicBezier';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MotionLayer {
  id: string;
  name: string;
  kind: 'text' | 'shape' | 'image' | 'gradient' | 'solid' | 'video' | 'null' | 'audio';
  visible: boolean;
  locked: boolean;
  lockedToParent: boolean;
  parentId: string | null;
  /** anchored composition-relative transform defaults */
  transform: Transform;
  anchor: { x: number; y: number }; // -1..1
  keyframes: Record<string, Keyframe[]>; // property path -> keyframes, e.g. "transform.x"
  text?: string;
  color?: string;
  shape?: 'rect' | 'ellipse' | 'triangle' | 'star' | 'line';
  gradient?: { from: string; to: string; angle: number };
  /** referenced media */
  mediaId?: string;
  solidColor?: string;
}

export interface Composition {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number; // seconds
  backgroundColor: string;
  layers: MotionLayer[];
  createdAt: string;
  updatedAt: string;
}

export type RenderJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RenderJob {
  id: string;
  project_id: string | null;
  owner_id: string;
  kind: 'export_video' | 'export_audio' | 'thumbnail' | 'proxy';
  status: RenderJobStatus;
  settings: Record<string, unknown>;
  progress: number; // 0..1
  output_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubtitleCue {
  index: number;
  start: number; // seconds
  end: number; // seconds
  text: string;
  style?: 'default' | 'karaoke' | 'animated';
}

export interface SubtitleDocument {
  id: string;
  projectId: string | null;
  name: string;
  language: string;
  cues: SubtitleCue[];
  createdAt: string;
  updatedAt: string;
}
