enum Level {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
}

const enum Mode {
  Fast = 'FAST',
  Safe = 'SAFE',
}

enum Mixed {
  No = 0,
  Yes = 'YES',
}

function label(level: Level): string {
  switch (level) {
    case Level.Debug:
      return 'D';
    case Level.Info:
      return 'I';
    default:
      return 'W';
  }
}

const levels: Level[] = [Level.Debug, Level.Warn];
const current: Level = Level.Info;
console.log(Level.Debug, Level.Info, Level['Warn']);
console.log(levels.map((l) => label(l)).join(''), label(current));
console.log(current === Level.Info, String(current) === 'info');
console.log('level: ' + Level.Warn, `${Level.Debug}!`, Level.Info.length);
console.log(Mode.Fast, Mode.Safe === 'SAFE');
console.log(Mixed.No, Mixed.Yes, Mixed[0]);
console.log(Object.keys(Level), Object.values(Level));
console.log(Object.entries(Level));
const byLevel: Record<string, number> = {};
for (const level of Object.values(Level)) {
  byLevel[level] = level.length;
}
console.log(Object.keys(byLevel).join(','), byLevel['debug'], byLevel['warn']);
