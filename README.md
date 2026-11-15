[![CI](https://github.com/alexeychikk/ts2hx/actions/workflows/ci.yml/badge.svg)](https://github.com/alexeychikk/ts2hx/actions/workflows/ci.yml)

# ts2hx

### Converts [TypeScript](https://www.typescriptlang.org/) into [Haxe](https://haxe.org/).

ts2hx compiles a TypeScript project into a Haxe project that builds and behaves
like the original on the JS, C# and C++ targets. It reads the program through the
TypeScript type checker, so types, narrowing and library calls are resolved from
the checker rather than from syntax. The output ships with the `ts2hx` runtime,
a cross-target Haxe library with JavaScript semantics (numbers, strings, arrays,
collections, `Promise`, `RegExp`, `JSON`, `console`, …).

A construct that cannot be mapped never produces broken Haxe: it becomes a
`TODO(ts2hx)` comment plus a `ts2hx.Ts2hx.unsupported("…")` placeholder that
throws at run time, and the CLI prints a warning with its position.

## Requirements

- [mise](https://mise.jdx.dev) (installs Node.js 26, Haxe 4.3.7, Neko and .NET 10 from `mise.toml`)

## Usage

1. `git clone https://github.com/alexeychikk/ts2hx.git`
2. `cd ./ts2hx`
3. `mise install && npm ci && npm run setup:haxe`
4. `npm start -- ./path/to/your/tsconfig.json ./out --entry ./path/to/your/main.ts`
5. Build and run the result on a target, from the output directory:

```bash
cd ./out
haxe build-js.hxml && node out/main.js
haxe build-cpp.hxml && ./out/cpp/Main
haxe build-cs.hxml && dotnet build out/cs -c Release -o out/cs/bin && dotnet out/cs/bin/App.dll
```

Target details and known
differences are in [ADR 0002](docs/decisions/0002-targets-and-runtime.md).

```console
$ npm start -- -h
Usage: cli [options] <ts-config-path> <output-dir-path>

Arguments:
  ts-config-path           path to tsconfig.json of your project
  output-dir-path          path to directory where to output final Haxe code

Options:
  --entry <path>           entry module of the program: generates Main.hx and
                           build-{js,cs,cpp}.hxml
  --rootPackage <package>  Haxe package prefix of every generated module
  -c, --clean [bool]       empty output directory before converting (choices:
                           "true", "false", "1", "0")
  -l, --logLevel <level>   log level (choices: "Log", "Warn", "Error", "None",
                           default: "Log")
  -h, --help               display help for command
```

## Features

Every area below is covered by the [conformance corpus](conformance/cases): TS
programs whose output on JS, C# and C++ must match Node's byte for byte. The
full mapping, including degraded and out-of-scope constructs, is
[ADR 0005](docs/decisions/0005-language-mapping.md).

- [x] basics: variables, operators, loops, template literals, JS truthiness
- [x] numbers: JS number formatting, `parseInt`/`parseFloat`, `toFixed`/`toPrecision`, `Math`
- [x] strings: all ES2022 methods with UTF-16 semantics
- [x] expressions: optional chaining, `??`, logical assignment, loose equality, `typeof`, `in`, `delete`
- [x] control flow: `switch` fall-through, labels, per-iteration `let`, comma and assignment expressions
- [x] exceptions: `try`/`catch`/`finally` with exact completion semantics, custom errors, throwing non-errors
- [x] functions: closures, default and rest parameters, local functions
- [x] destructuring: declarations, parameters, assignments, `for…of`, `catch`
- [x] classes: inheritance, accessors, statics, abstract classes, `#private`, parameter properties, class expressions and class values
- [x] generics: generic classes, functions and constraints
- [x] types: unions with flow narrowing, tuples, index signatures, `keyof`, utility types, optional fields
- [x] enums: numeric, string and reverse mapping
- [x] namespaces
- [x] modules: imports, re-exports, cycles and Node's evaluation order of side effects
- [x] arrays: `Array` methods with JS callbacks, holes and `length`, stable `sort`
- [x] objects: literals, spread, `this` in methods, JS key order, `for…in`
- [x] collections: `Map`, `Set`, `WeakMap`, `WeakSet`
- [x] iterators and generators: custom iterables, spread, `yield*`, `finally`
- [x] async: `async`/`await`, `for await`, async generators, Node's microtask order
- [x] promises and timers: `Promise` combinators, `setTimeout`/`setInterval`, `queueMicrotask`
- [x] regular expressions: `exec`/`test`, named groups, `matchAll`, `replace`, `split` on every target
- [x] JSON: `JSON.stringify` and `JSON.parse` with replacers, revivers and indentation
- [x] console: `console.log` formatting like Node's `util.inspect`
- [x] Node: `process.argv`, `process.exit`, `process.stdout.write`
- [x] npm packages: JS externs generated from `.d.ts`; lodash, joi, nanoid and seedrandom shims on every target
- [ ] decorators: kept as `@:ts.decorator` metadata, not executed
- [ ] out of scope: `eval`, `with`, `Proxy`, `bigint`, dynamic `import()`, `Intl` (see ADR 0005)

## Development

See [CLAUDE.md](CLAUDE.md) for the layout, commands and rules, and
[`docs/decisions/`](docs/decisions) for the architecture.
