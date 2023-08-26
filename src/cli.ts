import path from 'path';
import { Command, Option } from 'commander';
import { Converter, type ConverterFlags } from './Converter';
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
        new BooleanOption(
          '-c, --clean [bool]',
          `empty output directory before converting`,
        ),
      )
      .addOption(
        new BooleanOption(
          '-cfj, --copyFormatJson [bool]',
          `copy hxformat.json file into output directory` +
            ` (contains Prettier-like settings for Haxe formatter https://github.com/HaxeCheckstyle/haxe-formatter)`,
        ).default(true),
      )
      .addOption(
        new BooleanOption(
          '-chl, --copyHaxeLibraries [bool]',
          `copy haxe_libraries and .haxerc files into output directory` +
            ` (see lix package manager https://github.com/lix-pm/lix.client)`,
        ).default(true),
      )
      .addOption(
        new BooleanOption(
          '-clf, --copyLibFiles [bool]',
          `copy ts2hx lib files into output directory` +
            ` (contains helper functions and static extensions which improve compatibility with TS)`,
        ).default(true),
      )
      .addOption(
        new BooleanOption(
          '-cbh, --createBuildHxml [bool]',
          `create build.hxml file`,
        ),
      )
      .addOption(
        new BooleanOption(
          '-f, --format [bool]',
          'format final Haxe code using haxe-formatter',
        ).default(true),
      )
      .addOption(
        new BooleanOption(
          '-ife, --ignoreFormatError [bool]',
          `prevents exit code 1 when Haxe formatter fails`,
        ),
      )
      .addOption(
        new BooleanOption(
          '-ie, --ignoreErrors [bool]',
          `prevents exit code 1 when internal ts2hx error happens`,
        ),
      )
      .addOption(
        new BooleanOption(
          '-ic, --includeComments [bool]',
          'include comments generated during transformation',
        ),
      )
      .addOption(
        new BooleanOption(
          '-it, --includeTodos [bool]',
          'include todos generated during transformation',
        ),
      )
      .addOption(
        new Option('-l, --logLevel <level>', 'log level')
          .choices(['Log', 'Warn', 'Error', 'None'])
          .default('Log'),
      );

    command.showHelpAfterError();
    command.parse();

    const options = command.opts<
      ConverterFlags & {
        logLevel: keyof typeof LogLevel;
      }
    >();

    logger.logLevel = LogLevel[options.logLevel];

    const [tsConfigPathParam, outputDirPathParam] = command.args;
    const tsconfigPath = path.resolve(process.cwd(), tsConfigPathParam);
    const outputDirPath = path.resolve(process.cwd(), outputDirPathParam);

    const converter = new Converter({
      tsconfigPath,
      outputDirPath,
      flags: {
        clean: options.clean,
        copyFormatJson: options.copyFormatJson,
        copyHaxeLibraries: options.copyHaxeLibraries,
        copyLibFiles: options.copyLibFiles,
        createBuildHxml: options.createBuildHxml,
        format: options.format,
        ignoreFormatError: options.ignoreFormatError,
        ignoreErrors: options.ignoreErrors,
        includeComments: options.includeComments,
        includeTodos: options.includeTodos,
      },
    });
    await converter.run();
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
