# Conformance corpus

The design is in [ADR 0004](../docs/decisions/0004-conformance-harness.md).

- `run.ts` is the CLI; the runner lives in `runner/` (`index.ts` orchestrates:
  Node baseline → conversion → per-target build and run → expectations).
- Its self-test is `tests/conformance/`. It uses hand-written `.hx` fixtures and runs on
  `TS2HX_SELFTEST_TARGETS` (default `js`), e.g.
  `TS2HX_SELFTEST_TARGETS=js,cs,cpp npx jest tests/conformance`.

## Adding a case

- Add `cases/<area>/<name>.ts`, or `cases/<area>/<name>/main.ts` plus its modules. Ids
  are kebab-case; the Haxe package is `cases.<area>.<name>` with `-` → `_`.
- Every file is a module (`moduleDetection: force`) and must type-check under
  `tsconfig.base.json`; the run aborts otherwise. Use no top-level await (the Node
  baseline is CommonJS) and nothing nondeterministic or out of scope in ADR 0005
  (`Intl`, `Date.now`, `Math.random`).
- `// @targets: js` in the first lines restricts a case to some targets.
- A case importing an npm package needs it (and its types) in `devDependencies`: the
  Node baseline resolves it from the repository root.
- A case that does not pass yet is listed in `expectations.json`:
  `npm run conformance -- --filter '<area>/<name>' --update-expectations` records it.
  A ticket that makes a case pass removes its entries in the same change; an unexpected
  pass fails the run.

## Debugging

`--keep` leaves everything under `.conformance/`: `node/` (tsc output), `hx/<id>/src`
(converter output), `js/<id>.js`, and `cs/` and `cpp/` (the batch `ConformanceMain`,
generated sources and binary: `dotnet .conformance/cs/bin/App.dll <id>`,
`.conformance/cpp/out/ConformanceMain <id>`).
