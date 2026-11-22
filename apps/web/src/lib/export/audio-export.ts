/**
 * Audio export engine.
 *
 * Mixes all visible audio clips through an OfflineAudioContext and encodes
 * the result as a real 16-bit PCM WAV file. Audio-only export from the
 * timeline is a supported first-class operation.
 */
import type { ProjectTimeline, MediaAsset, TimelineClip } from '@frameforge/shared';

export interface ExportAudioOptions {
  timeline: ProjectTimeline;
  sampleRate?: number;
  /** mediaId -> decoded AudioBuffer source url */
  mediaUrls: Map<string, string>;
  onProgress?: (fraction: number) => void;
}

async function decodeAudio(url: string, ctx: OfflineAudioContext | AudioContext): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
  const data = await res.arrayBuffer();
  return ctx.decodeAudioData(data);
}

export async function exportTimelineAudio(options: ExportAudioOptions): Promise<Blob> {
  const duration = Math.max(
    0.5,
    options.timeline.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0),
  );
  const sampleRate = options.sampleRate ?? 44100;
  const off = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const master = off.createGain();
  master.gain.setValueAtTime(1, 0);
  master.connect(off.destination);

  const trackById = new Map(options.timeline.tracks.map((tr) => [tr.id, tr]));

  const audioClips = options.timeline.clips.filter((c) => {
    if (trackById.get(c.trackId)?.kind !== 'audio') return false;
    const tr = trackById.get(c.trackId);
    if (!tr || !tr.visible || tr.muted) return false;
    return c.mediaId !== null; // solid/text layers have no audio
  });

  let done = 0;
  for (const clip of audioClips) {
    const url = options.mediaUrls.get(clip.mediaId!);
    if (!url) continue;
    try {
      const buffer = await decodeAudio(url, off);
      const src = off.createBufferSource();
      src.buffer = buffer;
      const gain = off.createGain();
      gain.gain.setValueAtTime(clip.volume, clip.start);
      // simple fade in/out (60ms)
      gain.gain.linearRampToValueAtTime(Math.max(0.001, clip.volume), clip.start + 0.06);
      const endAt = clip.start + clip.duration;
      gain.gain.setValueAtTime(clip.volume, Math.max(clip.start + 0.07, endAt - 0.06));
      gain.gain.linearRampToValueAtTime(0.001, endAt);
      src.playbackRate.value = clip.speed;
      src.connect(gain).connect(master);
      src.start(clip.start, Math.max(0, clip.inPoint), clip.duration * clip.speed);
      done++;
      options.onProgress?.(done / Math.max(1, audioClips.length));
    } catch (e) {
      console.warn('Audio clip skipped:', e);
    }
  }

  const rendered = await off.startRendering();
  return audioBufferToWav(rendered);
}

/** Encode an AudioBuffer as a 16-bit PCM WAV. */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frameCount = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const ab = new ArrayBuffer(totalSize);
  const view = new DataView(ab);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = headerSize;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < frameCount; i++) {
    for (let c = 0; c < numChannels; c++) {
      const v = Math.max(-1, Math.min(1, channels[c]![i]!));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([ab], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}
