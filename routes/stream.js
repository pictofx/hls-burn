const express = require('express');
const { randomUUID } = require('crypto');
const { pipeline } = require('stream/promises');
const { burnSubtitles } = require('../services/ffmpeg');
const processPool = require('../utils/process-pool');
const logger = require('../utils/logger');

const router = express.Router();

const isValidUrl = (url) => {
  try {
    // eslint-disable-next-line no-new
    new URL(url);
    return true;
  } catch (err) {
    return false;
  }
};

const isValidLang = (lang) => /^[a-z]{2,3}(-[a-z]{2,3})?$/i.test(lang);

router.get('/stats', (req, res) => {
  res.json(processPool.stats());
});

router.get('/:videoId?', async (req, res, next) => {
  const requestId = req.id || randomUUID();
  const url = req.query.url;
  const subLang = req.query.subLang || 'en';
  const quality = req.query.quality || 'best';
  const format = req.query.format || 'mp4';
  const cookies = req.query.cookies;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid url parameter', requestId });
  }

  if (subLang && !isValidLang(subLang)) {
    return res
      .status(400)
      .json({ error: 'Invalid subLang parameter', requestId });
  }

  logger.info(
    `[${requestId}] Incoming stream request url=${url} quality=${quality} subLang=${subLang}`
  );

  try {
    await processPool.run(async () => {
      const { stream, cleanup } = await burnSubtitles({
        url,
        subLang,
        quality,
        format,
        cookies,
        requestId
      });

      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-store',
        'X-Request-Id': requestId
      });

      res.on('close', () =>
        logger.info(`[${requestId}] Response closed by client`)
      );

      try {
        await pipeline(stream, res);
      } catch (err) {
        logger.error(`[${requestId}] Streaming error: ${err.message}`, {
          stack: err.stack
        });
        throw err;
      } finally {
        cleanup();
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
