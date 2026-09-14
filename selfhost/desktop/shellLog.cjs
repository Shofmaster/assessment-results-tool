/**
 * Main-process log for the packaged desktop shell.
 *
 * console.log goes nowhere useful once Electron is packaged (no terminal), so
 * every `[aerogap]` line and every uncaught error is also appended here. The
 * Help > Open logs folder surface already points at this directory.
 */
const fs = require('node:fs');
const path = require('node:path');

const LOG_NAME = 'shell.log';
const ROTATE_BYTES = 4 * 1024 * 1024;

/** @type {string|null} */
let logFile = null;
let installed = false;

function rotateIfNeeded(file) {
  try {
    const st = fs.statSync(file);
    if (st.size < ROTATE_BYTES) return;
    const rotated = file + '.1';
    try {
      fs.unlinkSync(rotated);
    } catch {
      /* none */
    }
    fs.renameSync(file, rotated);
  } catch {
    /* missing is fine */
  }
}

/**
 * @param {string} logDir  e.g. %LOCALAPPDATA%\\AeroGap\\logs
 */
function initShellLog(logDir) {
  fs.mkdirSync(logDir, { recursive: true });
  logFile = path.join(logDir, LOG_NAME);
  rotateIfNeeded(logFile);
  append('--- shell log opened ' + new Date().toISOString() + ' ---');
}

function append(line) {
  if (!logFile) return;
  try {
    fs.appendFileSync(logFile, line.endsWith('\n') ? line : line + '\n', 'utf8');
  } catch {
    // Logging must never take the app down.
  }
}

function formatArgs(args) {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

/**
 * Mirror console.log / console.error / console.warn into shell.log and install
 * process-wide handlers for uncaught exceptions. Idempotent.
 */
function installConsoleBridge() {
  if (installed) return;
  installed = true;

  for (const method of ['log', 'error', 'warn']) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(...args);
      const text = formatArgs(args);
      if (method === 'log' && !text.includes('[aerogap]')) return;
      append(new Date().toISOString() + ' [' + method + '] ' + text);
    };
  }

  process.on('uncaughtException', (err) => {
    append(new Date().toISOString() + ' [uncaughtException] ' + (err && err.stack ? err.stack : String(err)));
  });
  process.on('unhandledRejection', (reason) => {
    const text =
      reason instanceof Error ? reason.stack || reason.message : String(reason);
    append(new Date().toISOString() + ' [unhandledRejection] ' + text);
  });
}

module.exports = {
  initShellLog,
  installConsoleBridge,
  append,
  LOG_NAME,
  ROTATE_BYTES,
};
