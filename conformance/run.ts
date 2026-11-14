import { Command } from 'commander';

import { parseTargets, runConformance } from './runner';

const program = new Command()
  .name('conformance')
  .description(
    'Run the conformance corpus under Node and on the Haxe targets (ADR 0004).',
  )
  .option('--targets <list>', 'comma-separated targets', 'js,cs,cpp')
  .option(
    '--filter <glob>',
    'case id glob(s), comma-separated, e.g. "classes/*"',
  )
  .option(
    '--update-expectations',
    'record the observed failures in expectations.json',
  )
  .option('--keep', 'keep generated Haxe and build output under .conformance/')
  .parse();

const options = program.opts<{
  targets: string;
  filter?: string;
  updateExpectations?: boolean;
  keep?: boolean;
}>();

runConformance({
  targets: parseTargets(options.targets),
  filter: options.filter,
  updateExpectations: options.updateExpectations,
  keep: options.keep,
}).then(
  (report) => {
    process.exitCode = report.ok ? 0 : 1;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  },
);
