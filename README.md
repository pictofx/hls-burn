# hls-burn

Production-grade Node.js service for real-time HLS streaming with hardcoded subtitles. The server pulls HLS video sources via `yt-dlp`, burns subtitles with `ffmpeg`, and streams AirPlay/VLC-compatible MP4 output with no intermediate files.

## Features
- 🔥 Burn subtitles directly into the video stream (VLC/AirPlay ready)
- ⚡ Zero disk usage for video data (yt-dlp → ffmpeg → HTTP response piping)
- 🎯 Query-based quality, format, and subtitle language selection
- 🍪 Browser cookies or custom cookies for premium sources
- 🧰 Docker & Docker Compose ready
- 📊 Concurrency control with a lightweight process pool
- 🪵 Structured logging to console and rotating log files

## Quick Start
1. Clone the repository.
2. Copy `.env` (already provided) and adjust values if needed.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Stream a video:
   ```bash
   curl -L "http://localhost:3000/stream?url=https://example.com/video&subLang=en" --output stream.mp4
   ```

## Docker
Build and run with Docker Compose:
```bash
docker-compose up --build
```
Logs are persisted to `./logs` on the host.

## API
### GET `/stream/:videoId?`
Stream an HLS source with burned-in subtitles.

**Query Parameters**
- `url` (required): Source video URL (HLS or supported by `yt-dlp`)
- `subLang` (optional, default `en`): Subtitle language code
- `quality` (optional, default `best`): yt-dlp format selector (e.g., `best`, `bestvideo[height<=1080]+bestaudio/best`)
- `format` (optional, default `mp4`): Output container
- `cookies` (optional): Raw cookie string for authenticated sources

**Example**
```bash
curl -L "http://localhost:3000/stream?url=https://30nama.com/video&subLang=en&quality=best" --output movie.mp4
```

### GET `/stream/stats`
Returns the current process pool stats: active, queued, max.

### GET `/health`
Simple health check with pool stats.

## Configuration
Environment variables (see `.env`):
- `PORT` (default 3000)
- `NODE_ENV` (development|production)
- `LOG_LEVEL` (info|debug|warn|error)
- `FFMPEG_PATH` (default `ffmpeg`)
- `YTDLP_PATH` (default `yt-dlp`)
- `MAX_CONCURRENT_STREAMS` (default 5)
- `SUBTITLE_TIMEOUT` (ms, default 10000)
- `STREAM_TIMEOUT` (ms, default 3600000)
- `COOKIES_BROWSER` (default `safari`, used with `--cookies-from-browser`)
- `FFMPEG_KILL_TIMEOUT_MS` (graceful shutdown before SIGKILL, default 2000)
- `PROCESS_CLEANUP_GRACE_MS` (grace period before killing tracked children, default 2000)

## Troubleshooting
- **No subtitles burned**: Ensure `subLang` exists; server continues without subs if none are found.
- **Authentication required**: Pass `cookies` query param; browser cookies are used by default when available.
- **Quality issues**: Adjust `quality` to a supported yt-dlp format string.
- **Timeouts**: Increase `STREAM_TIMEOUT` for long streams.

## Architecture
```
Client --> /stream --> yt-dlp (stdout) --> ffmpeg (burn subtitles) --> HTTP response
                                \--> subtitle download (vtt) ----^
```

## Notes
- Works with VLC and AirPlay (Apple TV).
- Streams are chunked MP4 with `frag_keyframe+empty_moov` flags for fast start.
