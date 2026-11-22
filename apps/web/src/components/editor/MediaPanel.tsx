'use client';

import { useRef } from 'react';
import { useMedia } from '@/lib/stores/media.store';
import { Button, Spinner, EmptyState, Badge } from '@/components/ui';
import { Upload, Film, Music, Image as ImageIcon, FolderOpen } from 'lucide-react';

function formatDuration(s: number | null): string {
  if (!s || !Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function MediaPanel({ projectId }: { projectId: string }) {
  const { assets, loading, error, uploadFile } = useMedia();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: File[]) => {
    for (const f of files) await uploadFile(f, projectId);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-[--color-border-soft] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Media</span>
        <Button variant="ghost" className="px-2 py-1 text-[11px]" onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*,.mp4,.mov,.mkv,.webm,.avi,.mp3,.wav,.aac,.flac,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void handleFiles(files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {error && <p className="mb-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-300">{error}</p>}
        {loading && <div className="flex justify-center py-10"><Spinner /></div>}
        {!loading && assets.length === 0 && (
          <EmptyState icon={<FolderOpen className="h-6 w-6" />} title="No media yet" hint="Upload files or drag from Media Library." />
        )}
        <div className="flex flex-col gap-2">
          {assets.map((asset) => (
            <button
              key={asset.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-frameforge-asset', asset.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-transparent bg-white/[0.03] px-2 py-1.5 text-left hover:border-indigo-500/40 hover:bg-indigo-500/10 transition-colors"
              title="Drag onto a timeline track"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-indigo-500/15 text-indigo-300">
                {asset.kind === 'video' ? <Film className="h-4 w-4" /> : asset.kind === 'audio' ? <Music className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-zinc-200">{asset.name}</span>
                <span className="flex items-center gap-1.5 text-[9px] text-zinc-500">
                  <Badge tone="info">{asset.kind}</Badge>
                  {formatDuration(asset.duration_seconds)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
