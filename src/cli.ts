import path from 'path';
import { Command, Option } from 'commander';
import { Converter } from './Converter';
import { logger, LogLevel } from './Logger';

void (async () => {
  try {
    const command = new Command();

    command
      .argument('<ts-config-path>', 'path to tsconfig.json of your project')
      .argument(
        '<output-dir-path>',
        'path to directory where to output final Haxe code',
      )
      .option(
        '-c, --includeComments',
        'whether to include comments generated during transformation',
      )
      .option(
        '-t, --includeTodos',
        'whether to include todos generated during transformation',
      )
      .option(
        '-f, --format',
        'whether to format final Haxe code using haxe-formatter',
        true,
      )
      .addOption(
        new Option('-l, --logLevel <level>', 'log level')
          .choices(['Log', 'Warn', 'Error', 'None'])
          .default('Log'),
      );

    command.showHelpAfterError();
    command.parse();

    const options = command.opts<{
      includeComments?: boolean;
      includeTodos?: boolean;
      format?: boolean;
      logLevel: keyof typeof LogLevel;
    }>();

    logger.logLevel = LogLevel[options.logLevel];

    const [tsConfigPathParam, outputDirPathParam] = command.args;
    const tsconfigPath = path.resolve(process.cwd(), tsConfigPathParam);
    const outputDirPath = path.resolve(process.cwd(), outputDirPathParam);

    const converter = new Converter({
      tsconfigPath,
      outputDirPath,
      includeComments: options.includeComments,
      includeTodos: options.includeTodos,
      format: options.format,
    });
    await converter.run();
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
