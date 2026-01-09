const logger = require('./logger');

const maxConcurrent =
  Number.parseInt(process.env.MAX_CONCURRENT_STREAMS, 10) || 5;
const childKillGraceMs =
  Number.parseInt(process.env.PROCESS_CLEANUP_GRACE_MS, 10) || 2000;
const isProcessAlive = (proc) =>
  !!proc && proc.exitCode === null && proc.signalCode === null && !proc.killed;

class ProcessPool {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
    this.children = new Set();
  }

  /**
   * Runs the provided async task when a slot is available.
   * @param {() => Promise<any>} taskFn
   * @returns {Promise<any>}
   */
  run(taskFn) {
    return new Promise((resolve, reject) => {
      const execute = () => {
        this.active += 1;
        logger.debug(
          `Acquired slot. Active: ${this.active}, Queued: ${this.queue.length}`
        );
        Promise.resolve()
          .then(taskFn)
          .then((result) => {
            this._release();
            resolve(result);
          })
          .catch((err) => {
            this._release();
            reject(err);
          });
      };

      if (this.active < this.max) {
        execute();
      } else {
        this.queue.push(execute);
        logger.warn(
          `Queueing request. Active: ${this.active}, Queued: ${this.queue.length}, Max: ${this.max}`
        );
      }
    });
  }

  /**
   * Track a child process for cleanup.
   * @param {import('child_process').ChildProcess} proc
   */
  registerProcess(proc) {
    if (!proc || !proc.pid) return;
    this.children.add(proc);
    proc.once('exit', () => {
      this.children.delete(proc);
    });
  }

  /**
   * Kill all tracked child processes.
   */
  cleanup() {
    for (const proc of this.children) {
      try {
        if (isProcessAlive(proc)) {
          proc.kill('SIGTERM');
          setTimeout(() => {
            if (isProcessAlive(proc)) {
              proc.kill('SIGKILL');
            }
          }, childKillGraceMs).unref();
        }
      } catch (err) {
        logger.error(`Failed to kill process ${proc.pid}`, { error: err });
      }
    }
    this.children.clear();
  }

  stats() {
    return {
      active: this.active,
      queued: this.queue.length,
      max: this.max
    };
  }

  _release() {
    this.active = Math.max(0, this.active - 1);
    if (this.queue.length > 0 && this.active < this.max) {
      const next = this.queue.shift();
      next();
    }
  }
}

const pool = new ProcessPool(maxConcurrent);
pool.isProcessAlive = isProcessAlive;

module.exports = pool;
