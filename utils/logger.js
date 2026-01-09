const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || 'info';
const dateLabel = new Date().toISOString().slice(0, 10);
const logFile = path.join(logDir, `app-${dateLabel}.log`);

const logger = createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const metaString =
        meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaString}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({
      filename: logFile,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 7,
      tailable: true
    })
  ],
  exitOnError: false
});

module.exports = logger;
