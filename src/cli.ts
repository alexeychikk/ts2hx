import path from 'path';
import { Command, Option } from 'commander';
import { Converter, type ConverterFlags } from './Converter';
import { convertProject, formatDiagnostic } from './compiler/project';
import { logger, LogLevel } from './Logger';
import { type TranspilerFlags } from './transformers';

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
          '--cfj, --copyFormatJson [bool]',
          `copy hxformat.json file into output directory` +
            ` (contains Prettier-like settings for Haxe formatter https://github.com/HaxeCheckstyle/haxe-formatter)`,
        ).default(true),
      )
      .addOption(
        new BooleanOption(
          '--clf, --copyLibFiles [bool]',
          `copy ts2hx lib files into output directory` +
            ` (contains helper functions and static extensions which improve compatibility with TS)`,
        ).default(true),
      )
      .addOption(
        new BooleanOption(
          '--cih, --copyImportHx [bool]',
          `copy import.hx file into root folders of output`,
        ).default(true),
      )
      .addOption(
        new BooleanOption(
          '--cbh, --createBuildHxml [bool]',
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
          '--ife, --ignoreFormatError [bool]',
          `prevents exit code 1 when Haxe formatter fails`,
        ),
      )
      .addOption(
        new BooleanOption(
          '--ie, --ignoreErrors [bool]',
          `prevents exit code 1 when internal ts2hx error happens`,
        ),
      )
      .addOption(
        new BooleanOption(
          '--ic, --includeComments [bool]',
          'include comments generated during transformation',
        ),
      )
      .addOption(
        new BooleanOption(
          '--it, --includeTodos [bool]',
          'include todos generated during transformation',
        ),
      )
      .addOption(
        new Option('-l, --logLevel <level>', 'log level')
          .choices(['Log', 'Warn', 'Error', 'None'])
          .default('Log'),
      )
      .addOption(
        new BooleanOption(
          '--transformAsyncAwait [bool]',
          'converts async-await syntax to Promise-s',
        ).default(true),
      )
      .addOption(
        new BooleanOption(
          '--transformTemplateExpression [bool]',
          'converts (`foo ${expression} bar`) to ("foo " + expression + " bar")',
        ).default(true),
      )
      .addOption(
        new Option('--engine <engine>', 'conversion engine')
          .choices(['legacy', 'next'])
          .default('legacy'),
      )
      .addOption(
        new Option(
          '--entry <path>',
          'entry module of the program (engine next): generates Main.hx and build-{js,cs,cpp}.hxml',
        ),
      )
      .addOption(
        new Option(
          '--rootPackage <package>',
          'Haxe package prefix of every generated module (engine next)',
        ),
      );

    command.showHelpAfterError();
    command.parse();

    const options = command.opts<
      ConverterFlags &
        TranspilerFlags & {
          logLevel: keyof typeof LogLevel;
          engine: 'legacy' | 'next';
          entry?: string;
          rootPackage?: string;
        }
    >();

    logger.logLevel = LogLevel[options.logLevel];

    const [tsConfigPathParam, outputDirPathParam] = command.args;
    const tsconfigPath = path.resolve(process.cwd(), tsConfigPathParam);
    const outputDirPath = path.resolve(process.cwd(), outputDirPathParam);

    if (options.engine === 'next') {
      const diagnostics = await convertProject({
        tsconfigPath,
        outDir: outputDirPath,
        entry: options.entry,
        rootPackage: options.rootPackage,
        clean: options.clean,
      });
      for (const diagnostic of diagnostics) {
        const log =
          diagnostic.severity === 'error' ? logger.error : logger.warn;
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
      return;
    }

    const converter = new Converter({
      tsconfigPath,
      outputDirPath,
      flags: {
        clean: options.clean,
        copyFormatJson: options.copyFormatJson,
        copyLibFiles: options.copyLibFiles,
        copyImportHx: options.copyImportHx,
        createBuildHxml: options.createBuildHxml,
        format: options.format,
        ignoreFormatError: options.ignoreFormatError,
      },
      transpilerFlags: {
        ignoreErrors: options.ignoreErrors,
        includeComments: options.includeComments,
        includeTodos: options.includeTodos,
        transformAsyncAwait: options.transformAsyncAwait,
        transformTemplateExpression: options.transformTemplateExpression,
      },
    });
    await converter.run();
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
