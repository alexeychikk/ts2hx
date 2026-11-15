import path from 'path';
import { Command, Option } from 'commander';
import { convertProject, formatDiagnostic } from './compiler/project';
import { logger, LogLevel } from './Logger';

class BooleanOption extends Option {
  constructor(flags: string, description?: string) {
    super(flags, description);

    this.choices(['true', 'false', '1', '0']);
    this.argParser((value) => !![undefined, '', 'true', '1'].includes(value));
  }
}

void (async () => {
  try {
    const command = new Command();

    command
      .argument('<ts-config-path>', 'path to tsconfig.json of your project')
      .argument(
        '<output-dir-path>',
        'path to directory where to output final Haxe code',
      )
      .addOption(
        new Option(
          '--entry <path>',
          'entry module of the program: generates Main.hx and build-{js,cs,cpp}.hxml',
        ),
      )
      .addOption(
        new Option(
          '--rootPackage <package>',
          'Haxe package prefix of every generated module',
        ),
      )
      .addOption(
        new BooleanOption(
          '-c, --clean [bool]',
          `empty output directory before converting`,
        ),
      )
      .addOption(
        new Option('-l, --logLevel <level>', 'log level')
          .choices(['Log', 'Warn', 'Error', 'None'])
          .default('Log'),
      );

    command.showHelpAfterError();
    command.parse();

    const options = command.opts<{
      clean?: boolean;
      logLevel: keyof typeof LogLevel;
      entry?: string;
      rootPackage?: string;
    }>();

    logger.logLevel = LogLevel[options.logLevel];

    const [tsConfigPathParam, outputDirPathParam] = command.args;
    const diagnostics = await convertProject({
      tsconfigPath: path.resolve(process.cwd(), tsConfigPathParam),
      outDir: path.resolve(process.cwd(), outputDirPathParam),
      entry: options.entry,
      rootPackage: options.rootPackage,
      clean: options.clean,
    });
    for (const diagnostic of diagnostics) {
      const log = diagnostic.severity === 'error' ? logger.error : logger.warn;
      log(formatDiagnostic(diagnostic));
    }
    if (!options.entry) {
      logger.warn(
        'No --entry given: Main.hx and build files were not generated',
      );
    }
    if (diagnostics.some((d) => d.severity === 'error')) {
      process.exit(1);
    }
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
