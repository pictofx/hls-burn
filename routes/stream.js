const express = require('express');
const { randomUUID } = require('crypto');
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

const isValidLang = (lang) => /^[a-z0-9_-]+$/i.test(lang);

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
    await processPool.run(
      () =>
        new Promise((resolve, reject) => {
          burnSubtitles({
            url,
            subLang,
            quality,
            format,
            cookies,
            requestId
          })
            .then(({ stream, cleanup }) => {
              res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-store',
                'X-Request-Id': requestId
              });

              stream.on('error', (err) => {
                logger.error(
                  `[${requestId}] Streaming error: ${err.message}`,
                  { stack: err.stack }
                );
                cleanup();
                if (!res.headersSent) {
                  res.status(500).json({ error: 'Streaming error' });
                } else {
                  res.destroy(err);
                }
                reject(err);
              });

              res.on('close', () => {
                cleanup();
                logger.info(`[${requestId}] Response closed by client`);
                resolve();
              });

              stream.pipe(res);
            })
            .catch((err) => {
              logger.error(
                `[${requestId}] Failed to start streaming: ${err.message}`,
                { stack: err.stack }
              );
              reject(err);
            });
        })
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
