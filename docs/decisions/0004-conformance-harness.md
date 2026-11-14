# 0004 — Correctness is measured by executing programs on every target

Status: accepted (2026-11-14)

## Decision

There are two test layers. CI runs both.

1. **Unit tests (Jest, fast).** They live under `tests/compiler/` and cover IR
   printing, type mapping, name resolution and the individual passes.
   Snapshots are allowed for printer output of small inputs. The legacy
   suites (`tests/<area>/`) stay until the legacy engine is removed.
2. **Conformance corpus (end to end).** These are TS programs run under
   Node, then converted, compiled and run on JS, C# and C++. A case passes on
   a target when its stdout is byte-identical to Node's (line endings and a
   trailing newline normalised) and the exit code matches.

## Layout and contract

```
conformance/
  cases/<area>/<name>.ts            single-file case (its own entry)
  cases/<area>/<name>/main.ts       multi-file case, entry is main.ts
  tsconfig.base.json                strict, target ES2022, module ESNext, lib ES2022
  expectations.json                 { "<area>/<name>": { "js": "fail", "cs": "fail", "cpp": "fail" } }
  run.ts                            runner (npm run conformance)
```

- Cases are deterministic and print with `console.log`. They use no
  `Date.now`, no `Math.random` and no unseeded randomness. A case may start
  with a `// @targets: js` header to restrict it.
- **Node baseline:** the runner compiles the corpus with `tsc` into a temp
  directory (CommonJS) and runs each entry with `node`. Expected output is
  computed fresh each run, never committed.
- **Conversion:** the runner calls the new engine through its API, once per
  case, with `rootPackage = cases.<area>.<name>`. All cases therefore coexist
  in one Haxe class path and can be built into a single binary.
- **Builds:** JS compiles one `--js` file per case, cheap and isolating.
  **C++ and C# compile one binary each for the whole corpus.** A generated
  `ConformanceMain` dispatches on `Sys.args()[0]` to the case's generated
  `main`. If that batch build fails, the runner maps the Haxe and C#/C++
  compiler errors back to case packages by file path, marks those cases
  failed for that target, and rebuilds without them, at most twice.
  `HXCPP_COMPILE_CACHE` is shared across runs.
- **Expectations:** `expectations.json` lists known failures per target. The
  run **fails** when a case not listed as failing fails, *and* when a listed
  case passes (an "unexpected pass", so the manifest is updated in the same
  change that fixed it). Implementation tickets are accepted by naming the
  cases they remove from this manifest.
- **Runner self-test:** the converter is pluggable
  (`({ caseId, caseDir, entry, files, outDir, rootPackage }) => Promise<void>`).
  It writes a Haxe class path to `<outDir>/src` with
  `<rootPackage>.Main.main()` as the entry, and throws when the case can't be
  converted. The runner adds `runtime/` (the `ts2hx` package) to every build.
  A Jest test (`tests/conformance/`) runs the runner on fixture cases, using a
  fake converter that copies hand-written `.hx` files: one case matches Node,
  one deliberately does not, and one does not compile (on C# and C++ it fails
  in the native compiler, so the batch build drops it and rebuilds). This
  proves the Node baseline, the three target builds, the batch fallback and
  the expectation logic, independently of the compiler.
  `TS2HX_SELFTEST_TARGETS` (default `js`) selects the targets it builds.
- **CLI:** `npm run conformance -- [--targets js,cs,cpp] [--filter <glob>] [--update-expectations] [--keep]`.
  The report prints one line per case and target, and a diff of
  expected/actual stdout for failures. `--keep` leaves the generated Haxe
  and build output under `.conformance/` (gitignored) for debugging.

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`,
with `jdx/mise-action` for the toolchain and `npm ci`. Jobs:

- `lint`: `npm run lint`, `prettier --check`.
- `unit`: `npm test`.
- `conformance`: a matrix over `js`, `cs` and `cpp`, each running
  `npm run setup:haxe`, the self-test for `<t>` and
  `npm run conformance -- --targets <t>`. Caches: `.haxelib/`, the hxcpp
  compile cache (`~/.cache/ts2hx/hxcpp` unless `HXCPP_COMPILE_CACHE` is set)
  and `~/.nuget/packages`.

The coverage job that force-pushes a `coverage` branch on every push to `main`
is replaced by uploading the coverage summary as an artifact. Rewriting a
branch from CI is not something the new pipeline needs.

## Consequences

- "Supported" means a corpus case passes on all three targets. The README
  feature list is derived from the corpus areas.
- Each new feature ticket adds or un-expects corpus cases. Bugs found in real
  projects become minimal corpus cases first.
