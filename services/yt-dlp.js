const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const logger = require('../utils/logger');

const DEFAULT_YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const DEFAULT_BROWSER = process.env.COOKIES_BROWSER || 'safari';
const SUBTITLE_TIMEOUT =
  Number.parseInt(process.env.SUBTITLE_TIMEOUT, 10) || 10000;

const createCookiesFile = (cookies) => {
  if (!cookies) return { file: null, cleanup: () => {} };
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookies-'));
  const file = path.join(tempDir, 'cookies.txt');
  fs.writeFileSync(file, cookies, 'utf8');
  return {
    file,
    cleanup: () => {
      fs.rm(file, { force: true }, () => {});
      fs.rm(tempDir, { force: true, recursive: true }, () => {});
    }
  };
};

/**
 * Spawn yt-dlp to stream video bytes.
 * @param {{url:string, quality?:string, format?:string, subLang?:string, cookies?:string, ytdlpPath?:string, requestId?:string}} options
 * @returns {{stream: import('stream').Readable, process: import('child_process').ChildProcess, stderr: import('stream').Readable, cleanup: () => void}}
 */
function extractStreams(options) {
  const {
    url,
    quality = 'best',
    format = 'mp4',
    subLang = 'en',
    cookies,
    ytdlpPath = DEFAULT_YTDLP,
    requestId
  } = options;

  if (!url) {
    throw new Error('url is required for extractStreams');
  }

  const { file: cookiesFile, cleanup: cookiesCleanup } =
    createCookiesFile(cookies);

  const args = [
    '--no-playlist',
    '-f',
    quality,
    '--write-subs',
    '--sub-lang',
    subLang,
    '--sub-format',
    'vtt',
    '-o',
    '-',
    url
  ];

  if (format) {
    args.unshift('-S', `ext:${format}`);
  }

  if (cookiesFile) {
    args.unshift('--cookies', cookiesFile);
  } else if (DEFAULT_BROWSER) {
    args.unshift('--cookies-from-browser', DEFAULT_BROWSER);
  }

  logger.info(
    `[${requestId || 'extract'}] Starting yt-dlp with args: ${args.join(' ')}`
  );

  const child = spawn(ytdlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const stderrChunks = [];

  child.stderr.on('data', (data) => stderrChunks.push(data));

  child.on('error', (err) => {
    logger.error(`[${requestId || 'extract'}] yt-dlp spawn error: ${err.message}`);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      logger.error(
        `[${requestId || 'extract'}] yt-dlp exited with code ${code}: ${Buffer.concat(
          stderrChunks
        ).toString()}`
      );
    } else {
      logger.info(`[${requestId || 'extract'}] yt-dlp completed successfully`);
    }
  });

  const cleanup = () => {
    cookiesCleanup();
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  };

  return {
    stream: child.stdout,
    process: child,
    stderr: child.stderr,
    cleanup
  };
}

/**
 * Download subtitles to a temporary file.
 * Resolves with { filePath: null } on errors to keep streaming functional.
 * @param {{url:string, subLang?:string, cookies?:string, ytdlpPath?:string, requestId?:string, timeout?:number}} options
 * @returns {Promise<{filePath: string|null, cleanup: () => void}>}
 */
function downloadSubtitle(options) {
  const {
    url,
    subLang = 'en',
    cookies,
    ytdlpPath = DEFAULT_YTDLP,
    requestId,
    timeout = SUBTITLE_TIMEOUT
  } = options;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subs-'));
  const subtitleBase = path.join(tempDir, 'subtitle');
  const { file: cookiesFile, cleanup: cookiesCleanup } =
    createCookiesFile(cookies);

  const args = [
    '--no-playlist',
    '--skip-download',
    '--write-subs',
    '--sub-lang',
    subLang,
    '--sub-format',
    'vtt',
    '-o',
    subtitleBase,
    url
  ];

  if (cookiesFile) {
    args.unshift('--cookies', cookiesFile);
  } else if (DEFAULT_BROWSER) {
    args.unshift('--cookies-from-browser', DEFAULT_BROWSER);
  }

  logger.info(
    `[${requestId || 'subtitle'}] Downloading subtitles with yt-dlp: ${args.join(
      ' '
    )}`
  );

  return new Promise((resolve) => {
    const child = spawn(ytdlpPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const timer = setTimeout(() => {
      logger.warn(
        `[${requestId || 'subtitle'}] Subtitle download timed out after ${timeout}ms`
      );
      child.kill('SIGKILL');
    }, timeout);

    child.on('exit', (code) => {
      clearTimeout(timer);
      cookiesCleanup();
      if (code !== 0) {
        logger.warn(
          `[${requestId || 'subtitle'}] yt-dlp exited with code ${code}; continuing without subtitles`
        );
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
        resolve({ filePath: null, cleanup: () => {} });
        return;
      }

      const files = fs
        .readdirSync(tempDir, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.startsWith('subtitle'));

      if (!files.length) {
        logger.warn(
          `[${requestId || 'subtitle'}] No subtitle files found; continuing without subtitles`
        );
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
        resolve({ filePath: null, cleanup: () => {} });
        return;
      }

      const subtitleFile = path.join(tempDir, files[0].name);
      const cleanup = () => {
        fs.rm(subtitleFile, { force: true }, () => {});
        fs.rm(tempDir, { force: true, recursive: true }, () => {});
      };

      resolve({ filePath: subtitleFile, cleanup });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      logger.error(
        `[${requestId || 'subtitle'}] Failed to spawn yt-dlp for subtitles: ${err.message}`
      );
      cookiesCleanup();
      fs.rm(tempDir, { recursive: true, force: true }, () => {});
      resolve({ filePath: null, cleanup: () => {} });
    });
  });
}

module.exports = {
  extractStreams,
  downloadSubtitle
};
