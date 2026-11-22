# Rendering & export

FRAMEFORGE STUDIO ships the first two formats **in your browser** — no server render required — and clearly labels everything else as a server-worker requirement.

## Format honesty matrix

| Format | Status | How |
| ------ | ------ | --- |
| **WebM (VP9/Opus)** | ✅ Available | Canvas + MediaRecorder, real playable output |
| **WAV (16-bit PCM)** | ✅ Available | OfflineAudioContext render, real playable audio |
| MP4 / H.264 | ❌ Requires server worker | See below |
| MOV / ProRes | ❌ Requires server worker | See below |
| WebM with audio | ❌ Coming via server worker | Browser path renders picture only |
| Thumbnails | ❌ Server worker | See below |

If the browser cannot produce a file, it says so — never "rendered" without a file.

## How the browser export works

### WebM video (Video Studio → Export)

1. The timeline is stepped frame by frame on a hidden canvas at the project FPS.
2. Each frame draws: the topmost visible in-window clip (video/image) or its solid/gradient, then text clips on top.
3. The canvas is captured via `MediaRecorder` (`video/webm`) → a `Blob` → downloaded.

### WAV audio (Audio Studio)

1. Audio clips on the timeline are mixed in-browser.
2. An `OfflineAudioContext` renders the full timeline (or the analysed region).
3. A 16-bit PCM WAV file is serialized in-browser → downloaded as `.wav`.

## Server-worker export (MP4/MOV)

MP4 and MOV require an ffmpeg-backed render worker — this is the production path and is **not** part of this repository today. The honest contract:

- `render_jobs` rows exist with real states (`queued`, `running`, `completed`, `failed`, `cancelled`).
- A future worker picks up rows with `status = 'queued'`, runs ffmpeg (`-c:v libx264` / `-c:v prores_ks`), records `progress`, and writes the output path on completion.
- The Render Queue page shows real job states; it never marks a job done until the output exists.

## What is NOT faked

- No "Rendering…" is shown without actual work.
- No export is claimed until the blob exists and is downloadable.
- No MP4 file is downloaded without a real ffmpeg pipeline.
