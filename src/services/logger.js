function safeErrorMessage(err) {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

function log(level, msg, meta) {
  const lvl = String(process.env.LOG_LEVEL || 'info').toLowerCase();
  const allowed = {
    error: ['error'],
    warn: ['error', 'warn'],
    info: ['error', 'warn', 'info'],
    debug: ['error', 'warn', 'info', 'debug']
  };
  const ok = (allowed[lvl] || allowed.info).includes(level);
  if (!ok) return;

  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](`[${level.toUpperCase()}] ${msg}${payload}`);
}

module.exports = {
  safeErrorMessage,
  logError: (msg, meta) => log('error', msg, meta),
  logWarn: (msg, meta) => log('warn', msg, meta),
  logInfo: (msg, meta) => log('info', msg, meta),
  logDebug: (msg, meta) => log('debug', msg, meta)
};

