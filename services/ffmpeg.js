const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const logger = require('../utils/logger');
const processPool = require('../utils/process-pool');
const { extractStreams, downloadSubtitle } = require('./yt-dlp');

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const STREAM_TIMEOUT =
  Number.parseInt(process.env.STREAM_TIMEOUT, 10) || 3600000;

const escapeSubtitlePath = (subtitlePath) =>
  subtitlePath
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,');

/**
 * Burn subtitles into the stream and return ffmpeg stdout as readable stream.
 * @param {{url: string, subLang?: string, quality?: string, format?: string, cookies?: string, requestId?: string}} options
 * @returns {Promise<{stream: import('stream').Readable, cleanup: () => void}>}
 */
async function burnSubtitles(options) {
  const requestId = options.requestId || randomUUID();
  const subLang = options.subLang || 'en';

  logger.info(`[${requestId}] Preparing burnSubtitles for ${options.url}`);

  const { stream: sourceStream, process: ytdlpProc, cleanup: ytdlpCleanup } =
    extractStreams({
      ...options,
      subLang,
      requestId
    });

  processPool.registerProcess(ytdlpProc);

  const { filePath: subtitlePath, cleanup: subtitleCleanup } =
    await downloadSubtitle({
      url: options.url,
      subLang,
      cookies: options.cookies,
      requestId
    });

  const ffmpegArgs = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0'
  ];

  if (subtitlePath) {
    ffmpegArgs.push('-vf', `subtitles='${escapeSubtitlePath(subtitlePath)}'`);
  }

  ffmpegArgs.push(
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    'frag_keyframe+empty_moov',
    '-f',
    options.format || 'mp4',
    'pipe:1'
  );

  logger.info(
    `[${requestId}] Spawning ffmpeg with args: ${ffmpegArgs.join(' ')}`
  );

  const ffmpegProc = spawn(FFMPEG_PATH, ffmpegArgs, {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  processPool.registerProcess(ffmpegProc);

  const stderrChunks = [];
  ffmpegProc.stderr.on('data', (data) => stderrChunks.push(data));

  const cleanup = () => {
    subtitleCleanup();
    ytdlpCleanup();
    if (!ffmpegProc.killed) {
      ffmpegProc.kill('SIGKILL');
    }
  };

  const timeout = setTimeout(() => {
    logger.error(`[${requestId}] Stream timed out after ${STREAM_TIMEOUT}ms`);
    cleanup();
  }, STREAM_TIMEOUT);

  return new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const safeReject = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      } else {
        logger.error(`[${requestId}] Late error after settle: ${err.message}`);
      }
    };

    sourceStream.on('error', (err) => {
      clearTimeout(timeout);
      logger.error(`[${requestId}] Source stream error: ${err.message}`);
      cleanup();
      safeReject(err);
    });

    ffmpegProc.on('error', (err) => {
      clearTimeout(timeout);
      logger.error(`[${requestId}] ffmpeg spawn error: ${err.message}`);
      cleanup();
      safeReject(err);
    });

    ffmpegProc.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString();
        logger.error(
          `[${requestId}] ffmpeg exited with code ${code}: ${stderr}`
        );
        cleanup();
        const exitError = new Error(
          `ffmpeg exited with code ${code}${stderr ? `: ${stderr}` : ''}`
        );
        ffmpegProc.stdout.destroy(exitError);
        safeReject(exitError);
      }
    });

    ffmpegProc.stdout.on('close', () => {
      clearTimeout(timeout);
      cleanup();
      logger.info(`[${requestId}] Stream closed`);
    });

    ffmpegProc.stdout.on('error', (err) => {
      clearTimeout(timeout);
      logger.error(`[${requestId}] ffmpeg stdout error: ${err.message}`);
      cleanup();
      safeReject(err);
    });

    sourceStream.pipe(ffmpegProc.stdin);
    safeResolve({ stream: ffmpegProc.stdout, cleanup });
  });
}

module.exports = {
  burnSubtitles
};
