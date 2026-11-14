import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function findOnPath(command: string): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, command);
    if (dir && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function nekoDir(repoRoot: string): string | undefined {
  try {
    return execFileSync('mise', ['where', 'neko'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    const neko = findOnPath('neko');
    return neko && path.dirname(neko);
  }
}

function prependPath(
  value: string | undefined,
  entry: string | undefined,
): string | undefined {
  if (!entry) {
    return value;
  }
  return value ? `${entry}${path.delimiter}${value}` : entry;
}

export function defaultHxcppCacheDir(): string {
  return path.join(os.homedir(), '.cache', 'ts2hx', 'hxcpp');
}

/**
 * Environment for haxe, haxelib, hxcpp and dotnet: the project-local haxelib repo,
 * libneko on the loader path, a shared hxcpp compile cache and invariant .NET globalization.
 */
export function toolEnv(repoRoot: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const haxelibRepo = path.join(repoRoot, '.haxelib');
  if (fs.existsSync(haxelibRepo)) {
    env.HAXELIB_PATH = haxelibRepo;
  }
  env.LD_LIBRARY_PATH = prependPath(env.LD_LIBRARY_PATH, nekoDir(repoRoot));
  env.HXCPP_COMPILE_CACHE ??= defaultHxcppCacheDir();
  env.HXCPP_COMPILE_THREADS ??= '2';
  env.DOTNET_SYSTEM_GLOBALIZATION_INVARIANT = '1';
  env.DOTNET_CLI_TELEMETRY_OPTOUT = '1';
  env.DOTNET_NOLOGO = '1';
  env.DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1';
  fs.mkdirSync(env.HXCPP_COMPILE_CACHE, { recursive: true });
  return env;
}
