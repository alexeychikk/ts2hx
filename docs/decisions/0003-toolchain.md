# 0003 — Toolchain: latest stable, pinned with mise and a project-local haxelib repo

Status: accepted (2026-11-14). Versions were checked on that date.

## Versions

| Tool | Pin | Why this one |
| --- | --- | --- |
| Haxe | **4.3.7** | Latest stable. 5.0 is still `5.0.0-preview.1` and **removes the C# target** (#11551). A new C# target for 5 is only an open PR (#12575). Revisit once Haxe 5 is stable and ships C#. |
| Neko | 2.4.1 | Needed only by `haxelib` (`libneko.so`). |
| hxcpp | 4.3.184 (GitHub release zip) | The latest hxcpp release. Haxelib's `4.3.2` dates from 2023. |
| hxcs | 4.2.0 | The latest available. Needed only to generate C# code (`-D no-compilation`); the .NET SDK compiles it. |
| formatter | 1.18.0 | Latest. Optional, because the new printer owns formatting. |
| .NET SDK | 10.0.404 (`dotnet@10`) | The current LTS. .NET 11 is an STS release. Target framework `net10.0`. |
| C++ compiler | system g++ (Debian 14.2 in the sandbox, ubuntu-latest on CI) | Not managed by mise. |
| Node.js | **26.13.1** (LTS "Lithium") | The current LTS. `engines.node` becomes `>=26`. |
| TypeScript (compiler API) | **6.0.3** | TS 7.0.2 (the native Go port) exposes its API only as `typescript/unstable/*`, an IPC-based API that is not stable. It is also not supported by ts-jest (`typescript <7`). TS 6 has the same language and checker semantics with the classic in-process `ts.createProgram`/`TypeChecker` API that the compiler depends on. Revisit when TS 7's API is stable: the frontend reaches the checker only through `src/compiler/model`, so the swap stays local. |
| Jest / ts-jest | 30.5.x / 29.4.x | Latest. ts-jest 29.4 supports Jest 30 and TS <7. |
| ESLint / typescript-eslint | 10.x (flat config) / 8.72.x | Latest. Replace `.eslintrc.js` with `eslint.config.mjs`, and drop `eslint-config-standard-with-typescript` (unmaintained) for `typescript-eslint`'s recommended-type-checked preset plus `eslint-config-prettier`. |
| Prettier | 3.10.x | Latest. |
| commander / fs-extra / @types/node | 15.x / 11.4.x / 26.x | Latest. |

## How it is pinned

- **`mise.toml`** at the repo root pins `node`, `haxe`, `neko` (mise version
  `2-4-1`, from the GitHub tag `v2-4-1`) and `dotnet`. The platform and
  developers get the same tools from `mise install`. CI uses
  `jdx/mise-action`.
- **lix is dropped.** Its `postinstall` (`lix download`) fails on aarch64:
  it builds a malformed Neko download URL. It is also unmaintained, and
  nothing else in the ecosystem needs it. `.haxerc` and `haxe_libraries/`
  are removed from the repo and are no longer copied into converted output.
- **Haxe libraries** live in a project-local haxelib repo (`.haxelib/`,
  gitignored), populated by `scripts/setup-haxe.sh`. The script runs
  `haxelib newrepo`, then installs exact versions: hxcpp from its release zip
  URL, `hxcs 4.2.0` and `formatter 1.18.0`. It is idempotent and run by
  `npm run setup:haxe` and by CI. Converted output gets a generated
  `build-*.hxml` that names `-lib hxcpp` / `-lib hxcs` without a version.
- **npm** uses exact versions in `package.json` plus `package-lock.json`.
  `npm ci` no longer runs a postinstall.

## Migration notes

- TypeScript 6 deprecates `baseUrl` and `moduleResolution: node`, and
  `types` defaults to `[]`. `tsconfig.json` uses `NodeNext` with `./`-relative
  `paths`, and each tsconfig lists its `types`.
- ts-jest's `isolatedModules` option is deprecated: `tsconfig.spec.json` sets
  `isolatedModules` and ts-jest reads that file.
- commander 15 rejects multi-letter short flags, so the CLI aliases became
  long ones (`-cfj` → `--cfj`, `-ife` → `--ife`, …). `--copyHaxeLibraries`
  is gone with lix.
- ESLint keeps `standard`'s `no-unused-vars` policy (`args: 'none'`).

## Environment notes (recorded so nobody re-learns them)

- `haxelib` needs `LD_LIBRARY_PATH` to include the Neko install directory
  (`mise where neko`). The setup script exports it.
- C# on a host without libicu: `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1`.
- C++: let hxcpp detect the architecture. `-D HXCPP_M64` adds `-m64`, which
  g++ rejects on aarch64. Point `HXCPP_COMPILE_CACHE` at a persistent directory:
  rebuilds then drop from about 40 s to under 1 s.
