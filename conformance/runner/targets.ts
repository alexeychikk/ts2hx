import * as fs from 'node:fs';
import * as path from 'node:path';

import { attributeBuildErrors } from './build-errors';
import { exec, mapPool } from './process';
import type { ConformanceCase, ProgramOutput, Target } from './types';

export const MAX_REBUILDS = 2;

export interface TargetContext {
  repoRoot: string;
  /** Directory of the shared `ts2hx` runtime package, when it exists. */
  runtimeDir?: string;
  /** Converter output (Haxe class path root) of each case, by case id. */
  classPaths: Map<string, string>;
  targetDir: string;
  env: NodeJS.ProcessEnv;
  buildTimeoutMs: number;
  runTimeoutMs: number;
  concurrency: number;
}

export type TargetRun =
  | { kind: 'ran'; output: ProgramOutput }
  | { kind: 'build-failed'; reason: string };

export type TargetRunner = (
  cases: readonly ConformanceCase[],
  ctx: TargetContext,
) => Promise<Map<string, TargetRun>>;

interface BuildOutcome {
  ok: boolean;
  log: string;
}

function haxeArgs(
  ctx: TargetContext,
  cases: readonly ConformanceCase[],
): string[] {
  const runtime = ctx.runtimeDir ? ['-cp', ctx.runtimeDir] : [];
  return [
    ...runtime,
    ...cases.flatMap((c) => ['-cp', ctx.classPaths.get(c.id)!]),
  ];
}

async function haxe(ctx: TargetContext, args: string[]): Promise<BuildOutcome> {
  const result = await exec('haxe', args, {
    cwd: ctx.repoRoot,
    env: ctx.env,
    timeoutMs: ctx.buildTimeoutMs,
  });
  return { ok: result.exitCode === 0, log: describeFailure(result) };
}

function describeFailure(result: ProgramOutput): string {
  const timeout = result.timedOut ? '\n(timed out)' : '';
  return `${result.stdout}\n${result.stderr}`.trim() + timeout;
}

function tail(text: string, lines: number): string {
  return text.split('\n').slice(-lines).join('\n');
}

export const runJs: TargetRunner = async (cases, ctx) => {
  const runs = await mapPool(
    cases,
    ctx.concurrency,
    async (c): Promise<TargetRun> => {
      const script = path.join(ctx.targetDir, `${c.id}.js`);
      fs.mkdirSync(path.dirname(script), { recursive: true });
      const build = await haxe(ctx, [
        ...haxeArgs(ctx, [c]),
        '-main',
        `${c.rootPackage}.Main`,
        '--js',
        script,
      ]);
      if (!build.ok) {
        return {
          kind: 'build-failed',
          reason: `haxe --js failed:\n${tail(build.log, 30)}`,
        };
      }
      const output = await exec(process.execPath, [script], {
        cwd: ctx.targetDir,
        timeoutMs: ctx.runTimeoutMs,
      });
      return { kind: 'ran', output };
    },
  );
  return new Map(cases.map((c, i) => [c.id, runs[i]]));
};

export function dispatcherSource(cases: readonly ConformanceCase[]): string {
  const branches = cases.map(
    (c) =>
      `      case ${JSON.stringify(c.id)}:\n        ${c.rootPackage}.Main.main();`,
  );
  return [
    'class ConformanceMain {',
    '  static function main() {',
    '    var args = Sys.args();',
    '    switch (args.length > 0 ? args[0] : "") {',
    ...branches,
    '      default:',
    '        Sys.stderr().writeString("ConformanceMain: unknown case\\n");',
    '        Sys.exit(64);',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
}

interface BatchTarget {
  name: Target;
  build(
    ctx: TargetContext,
    cases: readonly ConformanceCase[],
    mainDir: string,
  ): Promise<BuildOutcome>;
  command(ctx: TargetContext): { file: string; args: string[] };
}

export const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <AssemblyName>App</AssemblyName>
    <StartupObject>ConformanceMain</StartupObject>
    <InvariantGlobalization>true</InvariantGlobalization>
    <Nullable>disable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <NoWarn>$(NoWarn);CS0108;CS0114;CS0162;CS0168;CS0219;CS0414;CS0649;CS0659;CS0661;CS8981;SYSLIB0050;SYSLIB0051</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="src/**/*.cs" />
  </ItemGroup>
</Project>
`;

const csTarget: BatchTarget = {
  name: 'cs',
  async build(ctx, cases, mainDir) {
    const outDir = path.join(ctx.targetDir, 'out');
    fs.rmSync(outDir, { recursive: true, force: true });
    const generated = await haxe(ctx, [
      '-cp',
      mainDir,
      ...haxeArgs(ctx, cases),
      '-main',
      'ConformanceMain',
      '-lib',
      'hxcs',
      '-D',
      'no-compilation',
      '--cs',
      outDir,
    ]);
    if (!generated.ok) {
      return generated;
    }
    fs.writeFileSync(path.join(outDir, 'App.csproj'), CSPROJ);
    const compiled = await exec(
      'dotnet',
      [
        'build',
        path.join(outDir, 'App.csproj'),
        '-c',
        'Release',
        '-o',
        path.join(ctx.targetDir, 'bin'),
        '-nologo',
        '-v',
        'q',
      ],
      { cwd: ctx.repoRoot, env: ctx.env, timeoutMs: ctx.buildTimeoutMs },
    );
    return { ok: compiled.exitCode === 0, log: describeFailure(compiled) };
  },
  command(ctx) {
    return {
      file: 'dotnet',
      args: [path.join(ctx.targetDir, 'bin', 'App.dll')],
    };
  },
};

const cppTarget: BatchTarget = {
  name: 'cpp',
  build(ctx, cases, mainDir) {
    const outDir = path.join(ctx.targetDir, 'out');
    fs.rmSync(outDir, { recursive: true, force: true });
    return haxe(ctx, [
      '-cp',
      mainDir,
      ...haxeArgs(ctx, cases),
      '-main',
      'ConformanceMain',
      '-lib',
      'hxcpp',
      '--cpp',
      outDir,
    ]);
  },
  command(ctx) {
    return {
      file: path.join(ctx.targetDir, 'out', 'ConformanceMain'),
      args: [],
    };
  },
};

/**
 * Builds one binary for all cases. When the build fails, the cases its errors name are
 * dropped and the rest rebuilt, at most MAX_REBUILDS times.
 */
function batchRunner(target: BatchTarget): TargetRunner {
  return async (cases, ctx) => {
    const runs = new Map<string, TargetRun>();
    const mainDir = path.join(ctx.targetDir, 'main');
    fs.mkdirSync(mainDir, { recursive: true });
    let remaining = [...cases];
    for (let attempt = 0; remaining.length > 0; attempt++) {
      fs.writeFileSync(
        path.join(mainDir, 'ConformanceMain.hx'),
        dispatcherSource(remaining),
      );
      const build = await target.build(ctx, remaining, mainDir);
      if (build.ok) {
        break;
      }
      const culprits = attributeBuildErrors(build.log, remaining);
      if (culprits.size === 0 || attempt === MAX_REBUILDS) {
        const reason = `batch ${target.name} build failed (attempt ${attempt + 1}) without errors attributable to a single case:\n${tail(build.log, 30)}`;
        remaining.forEach((c) =>
          runs.set(c.id, { kind: 'build-failed', reason }),
        );
        remaining = [];
        break;
      }
      for (const [id, lines] of culprits) {
        runs.set(id, {
          kind: 'build-failed',
          reason: `${target.name} compile error (batch attempt ${attempt + 1}):\n${lines.join('\n')}`,
        });
      }
      remaining = remaining.filter((c) => !culprits.has(c.id));
    }
    const { file, args } = target.command(ctx);
    const outputs = await mapPool(remaining, ctx.concurrency, (c) =>
      exec(file, [...args, c.id], {
        cwd: ctx.targetDir,
        env: ctx.env,
        timeoutMs: ctx.runTimeoutMs,
      }),
    );
    remaining.forEach((c, i) =>
      runs.set(c.id, { kind: 'ran', output: outputs[i] }),
    );
    return runs;
  };
}

export const TARGET_RUNNERS: Record<Target, TargetRunner> = {
  js: runJs,
  cs: batchRunner(csTarget),
  cpp: batchRunner(cppTarget),
};
