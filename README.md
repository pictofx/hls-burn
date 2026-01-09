# hls-burn
Real-time Node.js service that extracts HLS streams (.ts segments), burns subtitles into video using FFmpeg, and delivers AirPlay-ready MP4 streams. Dockerized, production-ready—no downloads, pure streaming.

🔥 Burns subtitles directly into live HLS streams (30nama.com, Twitch VODs)
🎬 Dockerized: `docker-compose up` → instant streaming server  
📱 AirPlay/VLC compatible (Apple TV, Safari)
⚡ Zero disk usage—yt-dlp → FFmpeg → HTTP response piping
🍪 `--cookies-from-browser safari` for premium access
🎛️ Quality selection: 1080p, 720p, audio tracks
⚙️ Express.js API: /stream?url=...&subLang=en

