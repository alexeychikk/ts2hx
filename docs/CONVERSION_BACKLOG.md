# Conversion backlog — evolution core benchmark

This document is a self-contained work handoff. It lists the remaining known
issues found while converting a real-world TypeScript project (the game
`E:/repos/evolution`, config `libs/core/tsconfig.lib.json`, 444 generated
Haxe modules) with ts2hx, with enough context and technical detail for an
agent (or human) to pick any item and implement it independently.

State as of 2026-07-02 (after commits `02c6de4` and `ad1f512`):
**146 unique error lines across 38 of 444 files** on the per-file typecheck
(down from 118 unique errors + ~25 files with broken syntax at the start).
All output is syntactically valid Haxe (the formatter processes every file).

---

## Verification workflow (run after every change)

```bash
# 1. Build the converter, run its test suite and lint — all must stay green
npm run ts
npx jest --silent
npm run lint

# 2. Reconvert the benchmark project
node ./dist/src/cli.js ../evolution/libs/core/tsconfig.lib.json ../evo-haxe \
  --clean --createBuildHxml --includeComments --includeTodos --ignoreFormatError

# 3. Typecheck every generated module (js target) and collect unique errors
cd ../evo-haxe
find src -name "*.hx" ! -name "import.hx" \
  | sed 's|^src/||; s|\.hx$||; s|/|.|g' > modules.txt
check_one() {
  ../ts2hx/node_modules/.bin/haxe --class-path ts2hx --class-path src \
    --no-output --js tmp.js "$1" 2>&1
}
export -f check_one
xargs -a modules.txt -P 8 -I {} bash -c 'check_one "$@"' _ {} \
  | sort -u > errors.txt
wc -l errors.txt   # baseline: 146
cut -d: -f1 errors.txt | sort -u | wc -l   # baseline: 38
```

Haxe (4.3.3) is provided by lix through `ts2hx/node_modules/.bin/haxe`; run it
from inside `evo-haxe` (it reads the `.haxerc` there).

**Cascade caveat.** The per-file counts overcount: evolution has an import
cycle `common/game/Types.hx -> plugins/constants/Actions.hx -> (many files)
-> Types.hx`. One real (leaf) error inside the cycle makes dozens of files
report `Type not found : GeneralEventActions` / `Type not found : FoodType`.
To see leaf errors, compile the cycle entry directly:

```bash
cd ../evo-haxe
../ts2hx/node_modules/.bin/haxe --class-path ts2hx --class-path src \
  --no-output --js tmp.js libs.core.src.plugins.constants.Actions
```

A change is a regression if the error-line count or file count goes up, or if
any previously-clean generated file gains errors. Snapshot updates in jest are
acceptable only for intentional output changes (`npx jest -u`).

---

## Architecture crash course (what you need to know to change ts2hx)

- `src/transformers/Transpiler.ts` — drives two phases. TRANSFORMERS
  (AST-to-AST, `src/transformers/ts/*`) run first; the program is then
  _printed and re-parsed_ (`Converter.reloadProgram`), so transformer output
  must survive the TS printer and transformers that need checker info must
  run before nodes get detached (`pos === -1`). EMITTERS
  (AST-to-string, `src/transformers/lang/*`, `src/transformers/api/*`) run
  second; the first emitter in `EMITTERS` (see `src/transformers/index.ts`)
  that returns non-undefined wins, otherwise children are traversed and raw
  source text leaks through.
- `src/transformers/utils/*` — shared helpers. Notable: `commentOutNode` /
  `createComment` (TODO comments, nested-comment-safe),
  `getHaxeTypeString` (renders checker-resolved types; returns `undefined`
  for unrepresentable ones), `renameSymbolTo` (emit-phase identifier
  renames), `getRootSymbol` (alias-following symbol resolution).
- `lib/` — Haxe runtime support copied into converted projects
  (`--copyLibFiles`): `Ts2hx.hx`, `StaticExtensions.hx` (static extensions
  via `using` in `lib/import.hx`), and shims `Lodash.hx`, `Joi.hx`,
  `Nanoid.hx`, `SeedRandom.hx`.
- External npm imports: `EXTERNAL_MODULE_SHIMS` in
  `src/transformers/lang/basics.ts` redirects supported symbols to
  `ts2hx.*` shim modules; everything else is commented out with a TODO.
  Type references resolving into `node_modules` are rewritten to `Dynamic`
  by `transformExternalTypeReference` (`src/transformers/api/typescript.ts`)
  unless the name is in `KNOWN_EXTERNAL_TYPES`.
- Tests: snapshot-based, `tests/**/*.test.ts`, using the `ts2hx` template tag
  from `tests/framework.ts`. Add a test for every new transform.

---

## Work items

Ordered roughly by (error impact) x (feasibility). Items 1–5 are converter
changes, 6–7 are shims, 8–10 are investigations/bespoke, 11 is the real
milestone.

### 1. `array.push(...items)` and other rest-spreads into non-rest functions

- **Errors (2, plus it blocks the Actions cycle):**
  `Spread unary operator is only allowed for unpacking the last argument in a
call with rest arguments` at `ActionFeedAnimal.hx:38` and `:69`.
- **Cause:** TS `arr.push(...food)` — Haxe `Array.push` takes exactly one
  element, so even a trailing spread is invalid. (Non-trailing spreads into
  _rest_ functions are already folded to `...(a).concat([b])` by
  `transformCallExpression` in `src/transformers/lang/functions.ts`.)
- **Fix:** In an emitter (before `transformCallExpression`), special-case
  method calls with spread arguments whose callee resolves to Haxe
  fixed-arity array methods: `x.push(...a)` => emit `for (item in a)
x.push(item)` when the call is an expression statement, else
  `(x = x.concat(a))`-style or a `Ts2hx.pushAll(x, a)` helper in
  `lib/ts2hx/Ts2hx.hx` (recommended: helper `pushAll(array, items): Int`
  returning new length; also `unshiftAll` if needed). Detect via callee
  property name `push`/`unshift` + checker `isArrayLikeType` on the
  receiver.
- **Acceptance:** the two errors gone; a new jest test for `arr.push(...a)`
  and `arr.push(first, ...rest)`.

### 2. Index-signature-only object types should emit `Dynamic<V>`

- **Errors (~4):** `{ extraFood : Int, dices : Int } should be
haxe.extern.EitherType<...>` in `plugins/*/ContinentConfigs.hx`, and
  earlier `{ } should be libs...ContinentFoodConfig`.
- **Cause:** `ContinentConfig.foodConfig` in TS is (approximately)
  `{ [playersCount: string]: { dices: number; extraFood?: number } }`.
  Index signatures are currently commented out
  (`transformIndexSignature`, `src/transformers/lang/types.ts`), leaving an
  empty/partial structure, while object literals with quoted keys
  (`{"2": {...}}`) don't produce structure fields in Haxe — so nothing
  unifies.
- **Fix:** when a TypeLiteral or interface consists _only_ of index
  signatures (plus nothing else), emit `Dynamic<V>` (V = emitted index value
  type; multiple signatures -> `Dynamic<Any>`). Touch:
  `transformPropertySignature`/`transformIndexSignature` area and
  `transformStructuralInterface` in `src/transformers/lang/types.ts`.
  Mixed literals (fields + index signature) can keep current behavior.
- **Acceptance:** ContinentConfigs errors gone; jest test for
  `type T = { [k: string]: number }` => `typedef T = Dynamic<Float>;`.

### 3. Void-union collapse in checker-resolved types (`Null<Void> has no field then`)

- **Errors (3):** `TypedEventReplay.hx` and neighbors.
- **Cause:** `getHaxeTypeString` (`src/transformers/utils/types.ts`)
  collapses any union containing Void to `Void`. That is correct for return
  types but wrong for _value_ types resolved through the checker, e.g.
  `Map<Listener<T>, Promise<void> | void>` — the map value becomes `Void`,
  then `.then` fails. The annotation-node path (`transformUnionType` ->
  `toEitherType(..., isReturnPosition)`) is already position-aware; the
  checker path is not.
- **Fix:** in `getHaxeTypeString`'s union branch, replace the
  `parts.has('Void') -> 'Void'` shortcut with: drop `Void` parts and wrap the
  rest in `Null<...>` (mirroring `toEitherType`'s value-position behavior).
  Callers that render _return_ types (`getCallSignatureTypeString`) should
  keep collapsing — pass a flag.
- **Acceptance:** the three errors gone; no snapshot regressions.

### 4. Mutable redeclaration of a readonly base field

- **Errors (2):** `Action.hx:111 This expression cannot be accessed for
writing` + follow-up type error.
- **Cause:** TS pattern: base `ClientAction` declares `readonly type: T`;
  subclass `PublicEventAction` redeclares `type!: T` (mutable) and code
  assigns `action.type = ...`. ts2hx drops subclass field redeclarations
  (`transformFieldInitializersUsingThis`, `src/transformers/ts/classes.ts`),
  so the base's `final` wins and the write fails.
- **Fix:** program-wide scan (cache per `ts.Program`, like
  `getNominalInterfaceSymbols` in `src/transformers/lang/types.ts`): collect
  properties that any derived class redeclares without `readonly`. In
  `getDeclarationKeyword` (`src/transformers/utils/modifiers.ts`) or in
  `transformClassPropertyDeclaration`, emit `var` instead of `final` for
  those base fields.
- **Acceptance:** both Action.hx errors gone; add a jest test (base readonly
  - subclass mutable redeclaration + external write).

### 5. Module-level expression statements

- **Errors (1):** `PromiseChain_decorator.hx:97: Unexpected PromiseChain`
  (the only remaining _parse_ error in the whole output).
- **Cause:** TS allows top-level statements (`PromiseChain.clearKey = ...`);
  Haxe modules allow only declarations.
- **Fix (narrow!):** emitter for `ExpressionStatement` whose parent is the
  SourceFile **and** whose expression is an assignment (`BinaryExpression`
  with `=`): `commentOutNode(node, 'Module-level statement is not
supported')`. Do NOT comment out all top-level statements — many jest
  snippets (and real scripts) use top-level calls/ifs, and those snapshots
  must not change. Run the full jest suite to confirm.
- **Acceptance:** PromiseChain parse error gone; zero jest snapshot changes
  except any test you add.

### 6. class-validator / class-transformer no-op shims

- **Errors (~8):** `Unknown identifier : Transform / ValidateBy / IsArray /
IsObject` etc. in `libs/shared/utils/src/validation/*` and
  `... For function argument 'decorators'` in the `composeDecorators` users.
- **Approach:** decorators do nothing in Haxe, but the _value_ identifiers
  must exist. Create `lib/ts2hx/ClassValidator.hx` and
  `lib/ts2hx/ClassTransformer.hx` with static functions returning no-op
  decorator functions, e.g.
  `public static function Transform(?fn: Dynamic, ?options: Dynamic): Dynamic
return (?a: Dynamic, ?b: Dynamic, ?c: Dynamic) -> null;`
  Cover the names evolution imports (grep `from 'class-validator'` and
  `from 'class-transformer'` in `E:/repos/evolution/libs`): at least
  `ValidateBy`, `buildMessage`, `IsArray`, `IsObject`, `ValidateNested`,
  `IsOptional`, `Transform`, `Type`, `ClassConstructor` (type). Wire both
  packages in `EXTERNAL_MODULE_SHIMS` (`src/transformers/lang/basics.ts`)
  following the lodash entry (named symbols) and note that type-only names
  can stay unshimmed (they already become `Dynamic`).
- **Caveat:** decorator _call expressions_ compile but register nothing;
  document that in the shim's doc comment. The goal is compilation, not
  validation behavior (Joi covers runtime validation in this codebase).
- **Acceptance:** validation-folder unknown-identifier errors gone;
  no regressions.

### 7. reflect-metadata shim (optional, low value)

- **Errors (~4):** `Class<Reflect> has no field getMetadataKeys /
defineMetadata / getMetadata` in `CopyMetadata.hx`, plus
  `PromiseChain_decorator.hx` uses metadata maps.
- **Approach:** TS global `Reflect` (polyfilled by reflect-metadata)
  collides with Haxe's `Reflect`. Add `Ts2hx.defineMetadata/getMetadata/
getMetadataKeys` backed by a static `Map<{}, Dynamic>`-style registry
  (js target: use `js.lib.Map` keyed by object identity), and map
  `Reflect.getMetadataKeys` etc. in `transformJsApiAccess`
  (`src/transformers/api/common.ts`) — match by text
  `Reflect.defineMetadata` and check the property does NOT exist on Haxe's
  Reflect. Only worth doing if decorator metadata is ever exercised at
  runtime; otherwise leave.

### 8. Investigate `Missing super constructor call` (5) and `T<T> has no field ownerId/id` (4)

These have not been root-caused. The `Missing super constructor call`
occurrences (`ContinentConfigs.hx`, `ActionAddTraitUsages.hx`, `Action.hx`)
each _do_ contain a `super(...)` first statement — the error appears to be a
follow-on when typing of the super() argument fails (see the
`{ extraFood, dices }` unification error right next to it, item 2). Fix item
2 first, re-run, and re-diagnose what remains. For `has no field ownerId/id`,
compile the reporting module directly and read the surrounding generated
code; likely a lost generic instantiation on `Serialized<T>` or a
`Dynamic<T>` element access typed too narrowly.

### 9. Int/Float impedance (6 errors — may be better fixed in the TS source)

`RandomProvider.hx` (`var result = 0; result += this.range(...)`),
`CardService.hx`, `Animal.hx`: TS `number` maps to Haxe `Float`, but
integer-literal initializers infer `Int`, and Haxe won't assign Float to Int
(or index arrays with Float). A general converter fix is dangerous —
annotating `let result = 0` as Float breaks `arr[i]` indexing elsewhere.
Options, in order of preference: (a) leave, and annotate the handful of TS
variables in the evolution repo (`let result: number = 0`) — those flow
through as `Float` correctly; (b) converter heuristic: annotate `: Float`
only when the checker proves the variable is never used as an array index /
loop counter — requires a usage scan within the declaring scope.

### 10. Bespoke leftovers (one-offs, low priority)

- `ExactIteration.hx: Field isEqual overrides parent class with different or
incomplete type` — TS allows parameter-type narrowing in overrides, Haxe
  does not. Possible fix: when emitting an overriding method, take parameter
  types from the _base_ signature and add a TODO comment (checker:
  `baseType.getProperty(name)` -> declaration -> parameters).
- `Any should be Bool` (2), `... For function argument 'f'` (2) — inspect
  sites; likely `.or()`/`.and()` results (typed `Any`) used where Haxe wants
  `Bool` (e.g. inside native `array.filter`). A targeted fix: have
  `StaticExtensions.or/and` return `T` instead of `Any` where possible, or
  wrap condition-position or()/and() results with `== true`.
- `Unknown identifier : Function / Boolean` in `ComposeDecorators.hx` /
  `GetClassGetters.hx` — TS lib _value_ references (`Function`, `Boolean`)
  have no Haxe counterpart; could map `Function` -> `haxe.Constraints.Function`
  and `Boolean` (as a value/callee) -> a `Ts2hx` helper, or leave (these
  files are decorator/prototype-reflection utilities, marginal in Haxe).
- `GetOwnPropertyNames.hx` / `GetClassGetters.hx` / `ToJson.hx` — JS
  prototype reflection; partially working via `js.lib.Object`; the rest is
  inherently js-only. Leave unless needed at runtime.

### 11. Runtime smoke test (the real milestone)

Everything so far is typecheck-level. Next: actually run the converted game.

- Add a `Main.hx` to `evo-haxe` (or a `--main` hxml) that instantiates
  `libs.core.src.game.Game.Game` with a fixed seed, plays a few scripted
  actions through `game.state.selectors`/action classes, and traces the
  resulting state. Compile with `haxe build.hxml --js out.js -D js-es=6` and
  run under node.
- Known semantic divergences to watch (all flagged in lib doc comments):
  - `SeedRandom.hx` is a Lehmer PRNG, **not** the seedrandom algorithm —
    seeded sequences differ from the JS original (matters for replays /
    lockstep sync against the TS build; if that's required, port
    seedrandom's arc4 properly).
  - Haxe `StringTools.replace` replaces **all** occurrences; JS
    `String.replace(string, ...)` replaces the **first** (regex-based
    replaces are mapped correctly via EReg).
  - `Array.splice(start, deleteCount, ...items)` insertion form is not
    mapped (Haxe splice only deletes).
  - `Set`/`Symbol`/`Uint8Array`/`Promise` come from `js.lib` — the output
    currently only targets js.
  - Lodash shim's `debounce`/`memoize` are simplified; `noop` is 0-arity.

---

## House rules for whoever picks this up

- Never hand-edit files in `E:/repos/evo-haxe` — it is wiped by `--clean` on
  every conversion. Fix the converter or the `lib/` runtime instead.
- Every converter change needs a jest test; update snapshots only for
  intentional changes and eyeball each diff.
- Prefer emitting a `/* TODO(ts2hx) */` comment + degraded-but-valid code
  over emitting broken Haxe. `Dynamic` beats `Any` for anything that gets
  called or dereferenced.
- Keep `npm run lint` clean; run `npx prettier --write` on touched TS files.
- Commit in logical chunks with `feat:`/`fix:` prefixes.
