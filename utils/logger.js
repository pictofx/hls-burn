const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || 'info';
const ROTATION_CHECK_INTERVAL_MS = 60 * 60 * 1000;
let currentDate = new Date().toISOString().slice(0, 10);
const createFileTransport = (date) =>
  new transports.File({
    filename: path.join(logDir, `app-${date}.log`),
    maxsize: 10 * 1024 * 1024,
    maxFiles: 7,
    tailable: true
  });

let fileTransport = createFileTransport(currentDate);

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
    fileTransport
  ],
  exitOnError: false
});

const rotateDaily = () => {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== currentDate) {
    currentDate = today;
    const newTransport = createFileTransport(today);
    logger.add(newTransport);
    logger.remove(fileTransport);
    fileTransport = newTransport;
  }
};

setInterval(rotateDaily, ROTATION_CHECK_INTERVAL_MS).unref();

module.exports = logger;
