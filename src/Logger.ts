class Logger {
  log: typeof console.log = (...args) => {
    console.log('ts2hx |', ...args);
  };

  warn: typeof console.warn = (...args) => {
    console.warn('ts2hx(WARNING) |', ...args);
  };

  error: typeof console.error = (...args) => {
    console.error('ts2hx(ERROR) |', ...args);
  };
}

export const logger = new Logger();
