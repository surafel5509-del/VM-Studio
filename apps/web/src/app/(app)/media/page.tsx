'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useMedia } from '@/lib/stores/media.store';
import { Button, Spinner, EmptyState, Badge } from '@/components/ui';
import { Upload, Trash2, Film, Music, Image as ImageIcon, FolderOpen } from 'lucide-react';
import clsx from 'clsx';
import type { MediaAsset } from '@frameforge/shared';

function kindIcon(kind: MediaAsset['kind']) {
  if (kind === 'video') return <Film className="h-4 w-4" />;
  if (kind === 'audio') return <Music className="h-4 w-4" />;
  return <ImageIcon className="h-4 w-4" />;
}

function formatBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(s: number | null): string {
  if (!s || !Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function MediaPage() {
  const { assets, loading, error, load, uploadFile, deleteAsset, getSignedUrl } = useMedia();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    void load();
  }, [load]);

  const handleFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      setUploading(file.name);
      await uploadFile(file);
    }
    setUploading(null);
  }, [uploadFile]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void handleFiles(files);
  };

  const preview = async (asset: MediaAsset) => {
    if (links[asset.id]) return;
    const url = await getSignedUrl(asset.storage_path);
    if (url) setLinks((prev) => ({ ...prev, [asset.id]: url }));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-4 border-b border-[--color-border-soft] px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">Media Library</h1>
          <p className="text-xs text-zinc-500">{assets.length} asset{assets.length === 1 ? '' : 's'}</p>
        </div>
        <Button variant="primary" onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4" /> Upload media
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
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={clsx(
            'mb-6 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-8 text-center transition-colors',
            dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-zinc-700 bg-zinc-900/40',
          )}
        >
          <Upload className={clsx('h-8 w-8', dragging ? 'text-indigo-300' : 'text-zinc-500')} />
          <div className="text-sm font-medium text-zinc-300">Drag and drop files here</div>
          <div className="text-xs text-zinc-500">MP4 · MOV · MKV · WebM · AVI · MP3 · WAV · AAC · FLAC · PNG · JPG · WebP</div>
          {uploading && <div className="mt-1 text-xs text-indigo-300 ff-pulse">Uploading {uploading}…</div>}
        </div>

        {error && <p className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : assets.length === 0 ? (
          <EmptyState icon={<FolderOpen />} title="No media yet" hint="Upload your first file to start building your library." />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {assets.map((asset) => (
              <div key={asset.id} className="panel-glass rounded-xl p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">{kindIcon(asset.kind)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-zinc-100" title={asset.name}>{asset.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                      <Badge tone="info">{asset.kind}</Badge>
                      <span>{formatBytes(asset.size_bytes)}</span>
                      <span>{formatDuration(asset.duration_seconds)}</span>
                    </div>
                  </div>
                  <button onClick={async () => { if (confirm('Delete this asset?')) await deleteAsset(asset); }} className="rounded p-1.5 text-zinc-600 hover:text-red-300 hover:bg-white/5" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {asset.kind === 'image' && links[asset.id] && (
                  <img src={links[asset.id]} alt={asset.name} className="mt-1 max-h-32 w-full rounded-lg object-cover" />
                )}
                {asset.kind === 'image' && !links[asset.id] && (
                  <button onClick={() => preview(asset)} className="mt-1 rounded-lg border border-dashed border-zinc-700 py-4 text-[10px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600">Load preview</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
