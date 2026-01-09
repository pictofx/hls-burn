require('dotenv').config();
const express = require('express');
const { randomUUID } = require('crypto');
const logger = require('./utils/logger');
const processPool = require('./utils/process-pool');
const streamRouter = require('./routes/stream');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  logger.info(`[${req.id}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/health', (req, res) =>
  res.json({ status: 'ok', requestId: req.id, pool: processPool.stats() })
);

app.use('/stream', streamRouter);

app.use((err, req, res, _next) => {
  logger.error(
    `[${req.id || 'unknown'}] ${err.message}`,
    err.stack ? { stack: err.stack } : undefined
  );
  if (res.headersSent) {
    return;
  }
  res
    .status(err.status || 500)
    .json({ error: err.message || 'Internal server error', requestId: req.id });
});

const server = app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});

const shutdown = (signal) => {
  logger.warn(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    processPool.cleanup();
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Force exiting after timeout');
    process.exit(1);
  }, 10000).unref();
};

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

module.exports = app;
