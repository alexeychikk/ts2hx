import * as fs from 'node:fs';
import * as path from 'node:path';

import type { HxTypePath } from '../ir/types';
import { MODULE_INIT, printTypePath } from '../printer/printer';
import { MAIN_CLASS } from '../model/project-model';

export interface EmittedFile {
  /** Path relative to the output directory. */
  path: string;
  content: string;
}

/**
 * `Main.hx` of the root package: module initialisers in ESM order, then the event loop.
 * An uncaught error is reported like Node does (stderr, exit code 1).
 */
export function mainSource(
  rootPackage: string[],
  initOrder: HxTypePath[],
): string {
  const pack =
    rootPackage.length > 0 ? `package ${rootPackage.join('.')};\n\n` : '';
  const inits = initOrder.map(
    (module) => `\t\t\t${printTypePath(module)}.${MODULE_INIT}();`,
  );
  return `${pack}class ${MAIN_CLASS} {
\tpublic static function main():Void {
\t\ttry {
${[...inits, '\t\t\tts2hx.EventLoop.run();'].join('\n')}
\t\t} catch (error:Dynamic) {
\t\t\tts2hx.Ts2hx.uncaught(error);
\t\t}
\t}
}
`;
}

/** .NET project compiling hxcs output (`-D no-compilation`) with the SDK (ADR 0002). */
export function csproj(startupObject: string): string {
  return `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <AssemblyName>App</AssemblyName>
    <StartupObject>${startupObject}</StartupObject>
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
}

/** `build-{js,cs,cpp}.hxml` plus the csproj hxcs output is compiled with. */
export function buildFiles(rootPackage: string[]): EmittedFile[] {
  const mainClass = [...rootPackage, MAIN_CLASS].join('.');
  const common = `-cp src\n-main ${mainClass}\n`;
  return [
    { path: 'build-js.hxml', content: `${common}--js out/main.js\n` },
    {
      path: 'build-cpp.hxml',
      content: `${common}-lib hxcpp\n--cpp out/cpp\n`,
    },
    {
      path: 'build-cs.hxml',
      content: `${common}-lib hxcs\n-D no-compilation\n--cs out/cs\n`,
    },
    {
      path: 'out/cs/App.csproj',
      content: csproj([...rootPackage, 'EntryPoint__Main'].join('.')),
    },
  ];
}

/** `runtime/` of this repository, holding the `ts2hx` Haxe package. */
export function runtimeRoot(): string {
  for (let dir = __dirname; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'runtime', 'ts2hx');
    if (fs.existsSync(candidate)) {
      return path.dirname(candidate);
    }
    if (path.dirname(dir) === dir) {
      throw new Error('ts2hx runtime directory (runtime/ts2hx) not found');
    }
  }
}

export function writeFiles(outDir: string, files: EmittedFile[]): void {
  for (const file of files) {
    const target = path.join(outDir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
}

export function copyRuntime(srcDir: string): void {
  fs.cpSync(path.join(runtimeRoot(), 'ts2hx'), path.join(srcDir, 'ts2hx'), {
    recursive: true,
  });
}
