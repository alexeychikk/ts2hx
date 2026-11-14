# CLAUDE.md

ts2hx converts a TypeScript project into Haxe that **compiles and behaves
like the original** on the JS, C# and C++ targets (`--interp` is an optional
fast check). Decisions live in `docs/decisions/`. Read them before changing
architecture, runtime semantics or tooling:

| ADR | Topic |
| --- | --- |
| [0001](docs/decisions/0001-rewrite-as-typed-ir-compiler.md) | New engine: typed IR compiler in `src/compiler/`. The legacy engine is frozen |
| [0002](docs/decisions/0002-targets-and-runtime.md) | JS/C#/C++ targets, measured target differences, `ts2hx` runtime semantics, per-target build and run |
| [0003](docs/decisions/0003-toolchain.md) | Pinned toolchain versions and environment gotchas |
| [0004](docs/decisions/0004-conformance-harness.md) | Unit tests plus the conformance corpus run on all targets |
| [0005](docs/decisions/0005-language-mapping.md) | TS → Haxe coverage matrix (the definition of "complete") |

## Layout

- `src/compiler/`: the **new engine**. Its pipeline is ProjectModel → Frontend → typed IR → Passes → Printer:
  - `ir/` holds the IR types.
  - `model/` holds the module graph, init order and symbol → Haxe name table.
  - `frontend/` maps TS AST + checker to IR.
  - `passes/` holds the IR lowerings.
  - `stdlib/` holds lib bindings by checker symbol.
  - `printer/` prints the IR.
  - `emit/` writes the project files around the modules: `Main.hx`, the `build-*.hxml` files, the csproj and the runtime copy.
  - The public API is `compileProject` in `src/compiler/index.ts`.
- `runtime/ts2hx/`: the Haxe runtime with JS semantics, copied into the output. It is cross-target: no `js.lib`, and target-specific code goes behind `#if js`/`#if cs`/`#if cpp`.
- `conformance/`: the end-to-end corpus and its runner (ADR 0004). See `conformance/CLAUDE.md` for adding cases.
- `src/transformers/`, `lib/`, `tests/<area>/`: the **legacy engine** (string emitters). It is frozen: only critical fixes, no new features. It is deleted when the new engine becomes the default.
- `src/cli.ts`, `src/Converter.ts`: the CLI and the legacy orchestration.

## Commands

```bash
mise install                 # node, haxe, neko, dotnet (pinned in mise.toml)
npm ci
npm run setup:haxe           # project-local haxelib repo .haxelib/ (hxcpp, hxcs, formatter)
npm run ts                   # build
npm run lint                 # eslint
npm run prettify             # prettier
npm test                     # jest unit tests
npm run conformance -- --targets js,cs,cpp --filter 'classes/*' --keep
npm start -- ./path/to/tsconfig.json ./out
npm start -- ./path/to/tsconfig.json ./out --engine next --entry src/main.ts [--rootPackage app]
```

Building a converted project by hand (each target's details are in ADR 0002):

```bash
haxe build-js.hxml && node out/main.js
haxe build-cpp.hxml && ./out/cpp/Main
haxe build-cs.hxml && dotnet build out/cs -c Release -o out/cs/bin && dotnet out/cs/bin/App.dll
```

Environment gotchas:
- haxelib needs `LD_LIBRARY_PATH="$(mise where neko)"`.
- C# needs `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` on hosts without libicu.
- Never pass `-D HXCPP_M64`: it breaks on aarch64.
- Set `HXCPP_COMPILE_CACHE` to a persistent directory: C++ rebuilds drop from about 40 s to under 1 s.

## Rules

- **Never emit broken Haxe.** A construct the engine can't map becomes an
  `Unsupported` IR node: a `TODO(ts2hx)` comment plus
  `ts2hx.Ts2hx.unsupported("…")`. Its row in ADR 0005 says whether that is
  allowed.
- Semantics come from the type checker, not from syntax. Number formatting,
  key order, truthiness and equality follow ADR 0002. Call the runtime with
  explicit static calls (`JsArray.push(a, x)`), never `using`.
- Every behaviour change adds or un-expects conformance cases
  (`conformance/expectations.json`), checked on all three targets.
  Compiler-internal logic also gets Jest unit tests under `tests/compiler/`.
- Toolchain versions change only together with ADR 0003 and `mise.toml`.
