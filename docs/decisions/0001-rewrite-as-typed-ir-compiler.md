# 0001 — Rewrite ts2hx as a checker-driven compiler with a typed Haxe IR

Status: accepted (2026-11-14)

## Context

The goal changed from "help transition a codebase by hand" to "convert arbitrary
TypeScript into Haxe that compiles and behaves the same on JS, C# and C++".
The existing engine (`src/transformers/`) has these traits:

- **Two phases with a print/re-parse step.** TS→TS transformers run first. The
  program is then printed and re-parsed (`Converter.reloadProgram`). Any
  checker information attached to synthesized nodes is lost, so transformers
  must be ordered around `pos === -1` detachment.
- **String emitters, first match wins.** About 80 `EmitFn`s are tried in
  order on every node, and their order matters. When none matches, children
  are traversed and **raw TS source text leaks into the output**. Leading
  trivia is sliced out of the original file text. The output is only valid
  once `haxe-formatter` has normalised it.
- **Types come mostly from syntax.** Annotation nodes are emitted textually,
  `number` is always `Float`, and the checker is consulted ad hoc. Inferred
  types, narrowing, contextual types and generic instantiations are therefore
  mostly invisible.
- **The semantics are approximations.** `||`/`&&` become `.or()`/`.and()`
  returning `Any`. `String.replace` replaces all matches. Field initialisers
  run before `super()`. Async becomes `.then` chains with a list of
  unsupported shapes. There is no entry point or module-initialisation order.
  The runtime relies on `js.lib`.
- **Nothing was ever executed.** The only quality signal is snapshot tests of
  emitted text plus an external typecheck-only benchmark
  (`docs/CONVERSION_BACKLOG.md`, now retired).

Most of these are structural rather than local bugs. Preserving semantics
needs the checker's type at every expression, explicit lowering of control
flow Haxe lacks (fall-through switch, labels, `finally`, generators, async),
and a printer that cannot emit invalid syntax. None of that fits a
first-match string emitter that falls back to source text.

## Decision

Write a **new compiler next to the legacy engine** (strangler pattern), then
delete the legacy engine once the new one supersedes it:

```
tsconfig ─▶ ts.Program + TypeChecker
        ─▶ ProjectModel   (module graph, entry, init order, symbol → Haxe path/name table)
        ─▶ Frontend       (per module: TS AST + checker ─▶ typed Haxe IR; expression-level desugaring)
        ─▶ Passes         (IR ─▶ IR lowering: control flow, finally, hoisting, generators/async, init order)
        ─▶ Printer        (IR ─▶ Haxe text: precedence-aware, deterministic, always syntactically valid)
        ─▶ Project emit   (src/**.hx, runtime lib copy, Main.hx, build-{js,cs,cpp}.hxml)
```

- **Code lives in `src/compiler/`**: `ir/`, `model/`, `frontend/`, `passes/`,
  `stdlib/` (the TS-lib binding table) and `printer/`. The IR types in
  `src/compiler/ir/` are the contract between the stages.
- **One read of the TS AST, with no re-parse.** The frontend reads the
  original, attached TS nodes. It therefore always has the checker: resolved
  types, flow-narrowed types, signatures, symbols and aliases.
- **Types are mapped in exactly one place** (`frontend/types`, TS `Type` →
  `HxType`). The frontend inserts explicit `Cast` nodes wherever the
  checker's narrowed type maps to a different Haxe type than the declared one,
  and where structural assignability would not unify in Haxe.
- **The TS standard library is bound by checker symbol, never by name.** A
  call whose declaration lives in `lib.*.d.ts` is looked up in
  `stdlib/bindings` (`Array.prototype.push` → `ts2hx.JsArray.push`). The
  generated code calls the runtime explicitly and never relies on `using`
  static extensions, because a native Haxe method of the same name would
  silently win.
- **Unsupported input becomes valid Haxe, never broken Haxe.** The frontend
  emits an `Unsupported` IR node carrying a `TODO(ts2hx)` message. It prints
  as a comment followed by a typed placeholder
  (`ts2hx.Ts2hx.unsupported("…")`, which throws at run time). It never
  leaks source text. The CLI reports each such node as a warning with its
  position.
- **The printer owns formatting.** Its output is stable and readable without
  `haxe-formatter`, so the formatter is optional.
- **The legacy engine stays reachable, frozen.** It is selectable with
  `--engine legacy` until the cleanup ticket removes `src/transformers/`,
  `lib/` (once its shims are ported), the legacy snapshot tests and the
  engine flag. Reused as is: the CLI shell, `Converter` program creation, the
  in-memory compiler host (`src/utils`), `Logger` and the formatter call.

## Alternatives considered

- **Evolve in place.** Every remaining semantic gap would have to be fixed
  against the print/re-parse and raw-text fallback, with no checker types on
  synthesized nodes. The cost per feature stays high and correctness cannot
  be guaranteed.
- **Incremental refactor**, for example replacing emitters one by one. The
  two core flaws, losing the checker after re-parse and the string-based
  fallback, are in the spine. Replacing the spine is a rewrite anyway, but
  with legacy constraints attached.
- **Reuse TypeScript's own downlevel transforms** (ES5 `__generator`) for
  generators and async. They are internal (non-public API) and erase types.
  We write our own state-machine pass on the IR instead.

## Consequences

- Features are re-implemented on the new engine, prioritised by the
  conformance corpus ([0004](0004-conformance-harness.md)). Progress is
  measured as executed programs that match Node's output.
- Legacy snapshot tests stay green and unmodified until the cleanup ticket.
  New-engine unit tests live under `tests/compiler/`.
- The legacy known-issues list (`docs/CONVERSION_BACKLOG.md`) is retired.
  Its items are folded into the new engine's tickets: spread into fixed-arity
  calls → arrays, index signatures → `ts2hx.Dict`, void unions → the type
  mapper, readonly redeclaration and field-initialiser order → classes,
  module-level statements → module init, Int/Float → ADR 0002, npm shims →
  external modules.
