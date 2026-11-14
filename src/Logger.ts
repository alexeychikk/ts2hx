export enum LogLevel {
  Log,
  Warn,
  Error,
  None,
}

class Logger {
  logLevel = LogLevel.Log;

  log = (...args: unknown[]): void => {
    if (this.logLevel > LogLevel.Log) return;
    console.log('ts2hx |', ...args);
  };

  warn = (...args: unknown[]): void => {
    if (this.logLevel > LogLevel.Warn) return;
    console.warn('ts2hx(WARNING) |', ...args);
  };

  error = (...args: unknown[]): void => {
    if (this.logLevel > LogLevel.Error) return;
    console.error('ts2hx(ERROR) |', ...args);
  };
}

export const logger = new Logger();
