# 0005 — How TypeScript maps to Haxe (definition of "complete")

Status: accepted (2026-11-14)

The new engine is complete when every **Supported** row below has passing
conformance cases on JS, C# and C++. **Degraded** constructs compile and run
but differ in documented edge cases, and print a `TODO(ts2hx)` comment.
**Out of scope** constructs become an `Unsupported` placeholder (a TODO
comment plus `Ts2hx.unsupported("…")`, which throws at run time). They never
produce broken Haxe. "Runtime" means the `ts2hx` package
([0002](0002-targets-and-runtime.md)).

## Modules and names

| TS | Haxe | Notes |
| --- | --- | --- |
| file `a/b/my-file.ts` | module `<rootPackage>.a.b.My_file` | Packages are lower-cased and module names capitalised; module names that collide (case-insensitively) get `_2`, `_3`, …, and Haxe std type names (`Math`, `String`, …) get `_`. Module-level values are named by the ProjectModel's per-module table (`ModuleInfo.fields`): Haxe keywords (`cast`, `dynamic`, `untyped`, `inline`, `macro`, `operator`, `overload`, …) get `_`, and a name colliding with another value, the module, a typedef of the module, `__init` or a root package gets `_2`, … Values keep their case (`MAX`, `Square`). A local named like a root package the output references (`haxe`, `ts2hx`, the project's top package) gets `_`. |
| top-level function / const / let | module-level `function` / `static var` (Haxe 4.2 module fields) | Non-constant initialisers move into a generated `__init()`. |
| top-level statements and side effects | generated `__init()` per module | `Main` calls every module's `__init()` once, in Node's ESM evaluation order (post-order DFS over imports from the entry). That keeps cycles and side-effect order. Imports TS elides are not followed, as in tsc's output: an import none of whose bindings is read as a value (only types, only `typeof`), `export type`, and `export *` of a module without values. |
| `import {a as b}`, default, `import * as ns`, re-exports, `export default <expr>` | references resolved through the alias chain to the declaring module: `pack.Module.field` | Re-export-only files emit nothing. `ns.x` becomes a direct reference; a namespace object used as a value is `Unsupported`. `export default <expr>` is a `default_` module var assigned in `__init()`. `export =` is out of scope (TS rejects it in ESM). |
| import cycles | supported | Haxe resolves type cycles. Init order is explicit (above). |
| dynamic `import()` | Out of scope | |
| `namespace N {}` (non-merged) | class `N` with static members, nested namespaces as `N_M` | Merging with a class adds statics to that class. Other merges are out of scope. |
| `declare global`, ambient declarations in the project | JS: externs. C#/C++: `#error` | |
| npm packages | JS: externs generated from `.d.ts` (`@:jsRequire`). C#/C++: `#error` naming the package | The legacy shims (lodash, joi, nanoid, seedrandom) are ported to `ts2hx.npm.*` and work on all targets. |
| Node built-ins | `process.argv`, `process.exit` and `process.stdout.write` through the runtime | Everything else (fs, path, …) is out of scope. |

## Types

| TS | Haxe | Notes |
| --- | --- | --- |
| `number` / `string` / `boolean` | `Float` / `String` / `Bool` | `Int` only at index sites (0002). |
| `any` / `unknown` / `object` / `never` | `Dynamic` / `Any` / `Dynamic` / `Dynamic` (`Void` as a return type) | |
| `T \| null \| undefined`, optional `?` | `Null<T>`, `@:optional var` | null and undefined are merged (0002). |
| interface / object type alias | `typedef` anonymous structure | Methods become `function f():R;` and readonly fields `final`. When a class is used as a structure that has optional members it lacks (through `implements` or any assignment the ProjectModel finds), those members are added to the class as `Null<T> = null` fields. That is required on C# (0002), so it is never done with a bare `cast`. |
| index signature, `Record<string,V>` | `ts2hx.Dict<V>` | Insertion-ordered. `Record<'a'\|'b', V>` becomes a structure. |
| union of literals of one primitive | that primitive (`String`/`Float`) | String-literal unions used as discriminants keep `==` comparisons. |
| other unions | `Dynamic` | **Flow narrowing is reconstructed**: wherever the checker's narrowed type maps to a different Haxe type, the frontend emits `cast`. That covers discriminated unions, `typeof`/`instanceof`/`in` guards and user type guards. |
| intersection of object types | merged anonymous structure | Intersections involving a class or primitive become `Dynamic` (degraded). |
| generics, constraints, defaults | type parameters, `T:Constraint` | Default type args are filled from checker instantiations. |
| conditional, mapped, `keyof`, indexed access, `typeof`, template-literal types, utility types | resolved by the checker at each use site and mapped from the result | Declarations that stay generic over such types fall back to `Dynamic`. Degraded, but valid. |
| tuples | `Array<Dynamic>` with casts at element reads | Degraded typing. Runtime behaviour is exact. |
| function types, overloads | Haxe function types. The implementation signature is emitted | Callbacks with fewer parameters than the expected function type are padded or wrapped by the frontend. |
| `as`, `satisfies`, `!` | `cast` / dropped / dropped | |
| enums (numeric, string, const) | `enum abstract E(Float)` / `(String)` | Reverse mapping `E[v]` through a generated static `name()`. Heterogeneous enums become `Dynamic`-backed (degraded). |
| `symbol`, `unique symbol` | `ts2hx.Symbol` (identity object) | Only well-known `Symbol.iterator` and `Symbol.asyncIterator` have protocol meaning. |
| `bigint` | Out of scope | |
| `.d.ts` in the project | types used, no output | |

## Classes and functions

| TS | Haxe | Notes |
| --- | --- | --- |
| class, `extends`, `super(...)`, override | class | **Field initialisers move into the constructor after `super()`**, which is TS order. A missing constructor is generated with forwarding when the class has a base. |
| parameter properties, `readonly` | fields assigned in the constructor, `final` | A base `readonly` that a subclass redeclares as mutable becomes `var`. |
| static members, static blocks | statics. Static blocks join the module `__init()` | Statics inherited through a subclass are rewritten to the declaring class. |
| `private`, `protected`, `#private` | `private` (Haxe private behaves like protected). `#x` is renamed `__x` | |
| abstract classes and members | `abstract class` (Haxe 4.2+) | |
| accessors `get`/`set` | properties `(get, set)` plus `@:isVar` when backed | |
| object-literal accessors | Degraded: lowered to an anonymous class instance | |
| class expressions | hoisted to module-level classes. Captured locals are passed to the constructor | |
| mixins, `Object.setPrototypeOf`, prototype mutation | Out of scope | |
| `instanceof` | `Std.isOfType` | Primitives are handled by the runtime. Only `Array` is mapped so far; class targets stay `Unsupported` until classes land. |
| functions, arrows, closures | local functions and arrows | Haxe closures capture by reference and `this` lexically, which matches arrows. Function declarations stay in source order, because Haxe types a local function where it is declared. A function that is used before its declaration, called by such a function, or captures a `let`/`const` declared after it becomes a `var f:FnType = null` at the top of its block. It is assigned right after the last `let`/`const` it captures. If an earlier statement may reach it (directly or through another function of the block), it is assigned at the top instead, and the `let`/`const`s it captures are hoisted like `var`s (`Null<T>`, assigned at their declaration). A generic one is `Unsupported`. A `let`/`const` read by any closure (arrow, function expression, nested function) that appears before its declaration is hoisted the same way. A value-returning function whose end is reachable (the binder's `HasImplicitReturn`) ends with `return null`, and a bare `return;` in it returns `null`. When its Haxe return type is not nullable, TS guarantees the end is unreachable (e.g. after a `never` call), so it ends with `throw "unreachable"`. |
| `function` expressions using a dynamic `this`, `call`/`apply`/`bind` with a foreign `this`, `arguments` | Degraded (`bind` keeps the receiver) / out of scope | |
| default parameters | Haxe constant defaults, otherwise `if (p == null) p = …` | Explicit `null` triggers the default (degraded, see 0002). |
| rest parameters, spread arguments | `...rest:T` (`haxe.Rest`). Spread into a fixed-arity call goes through `Reflect.callMethod` or an inlined unpack | |
| decorators (legacy and TC39) | Out of scope: a TODO plus `@:ts.decorator("…")` metadata. The decorator call is not executed | |

## Statements and expressions

| TS | Haxe | Notes |
| --- | --- | --- |
| `var`/`let`/`const`, TDZ | `var`/`final`. The frontend hoists `var` to its function as `Null<T>`; C-style `for` is lowered by the `lowerCFor` pass | Per-iteration `let` bindings captured by closures in loops get a fresh copy. |
| `if`/`while`/`do`/`for`/`for…of`/`for…in` | lowered by a pass: C-style `for` becomes `while` with correct `continue`. `for…of` uses the iterator protocol (arrays fast-path to Haxe `for`) | |
| `switch` with fall-through, `break` inside a switch inside a loop, non-constant cases | the `lowerControlFlow` pass: the subject is read once into a `final`, each case is an `===` test. Without fall-through, an if-chain in clause order with `default` as the final `else`; with fall-through, a clause index (`c0 ? 0 : c1 ? 1 : default`) and `if (index <= i)` per body. A `break` left inside a body exits a `do {} while (false)` wrapper | No Haxe `switch` is emitted (its `break` would break the loop). A `default` sharing a body with a case whose test has side effects takes the clause-index form so tests run in JS order. A `let`/`const` used across clauses is `Unsupported`. A value function whose lowered body Haxe sees falling off its end gets `throw "unreachable"`. |
| labels, labelled `break`/`continue` | `lowerControlFlow`: a label on a loop or `switch` names it; a labelled block that is broken becomes `do {} while (false)`. A jump to the innermost Haxe loop stays a `break`/`continue`; one that crosses loops sets a `Bool` flag declared before its target and breaks, and each crossed loop is followed by `if (flag) break;`, or at the target by the jump itself | Runs before `lowerCFor`, so a flagged `continue` of a C-style `for` still runs its update. |
| `try`/`catch`/`finally` | `finally` lowered, including `return`/`break`/`throw` inside `try` | |
| destructuring (declaration, parameter, assignment, `for…of`, `catch`), defaults, rest | temporaries plus assignments | |
| spread in arrays and objects | `concat` / runtime `Obj.spread` with the static key order | |
| `?.`, `??`, `??=`, `\|\|=`, `&&=` | Haxe 4.3 `?.` and `??` where equivalent, otherwise lowered with temporaries | `a?.[i]` and `a?.()` are lowered. |
| truthiness, `!`, `\|\|`, `&&` | type-directed (0002) | A value whose type is only `null`/`undefined` (e.g. narrowed by assignment) is `false` only when it is a literal; any other expression goes through `Ts2hx.truthy`, because TS keeps that narrowing across closure calls that reassign the variable. `String`/template of such a value is `x == null ? "undefined" : Ts2hx.string(x)` for the same reason. |
| `==`/`!=` (loose) | `==` when both sides have the same primitive or class type, otherwise `Ts2hx.looseEq` | `===` becomes Haxe `==`. |
| arithmetic, `%`, `**`, bitwise, `++` on fields and indexes | Float arithmetic, `Num.pow` (JS `NaN`/`±1 ** ±Infinity` results), `Num.toInt32`, `Num.shl`/`shr`/`ushr` | `+` with a string operand converts the other side with `Num.toString` or `Ts2hx.string`. |
| `typeof x` | static constant when the type is known, otherwise `Ts2hx.typeOf` | |
| `in`, `delete` | `Reflect.hasField`/`Dict` / `Reflect.deleteField` | |
| comma, `void`, assignment as an expression | block expressions; Haxe assignments are expressions | A `void` call used as a value becomes `{ f(); null; }`; `return f();` in a `void` function becomes `f(); return;`. `void x` is `null`, or `{ x; null; }` when `x` has effects. A compound assignment to a module var whose value is used is spelled `m = m * v`: Haxe 4.3.7's JS generator references an elided `_Fields_` class for `m *= v` as a value. |
| template literals, tagged templates | `+` chains through `Num.toString` or `Ts2hx.string` (`null`/`undefined` literals print as constants) / a call with a strings array and the values | |
| regex literals and methods | `ts2hx.RegExp` | 0002. |
| generators, iterators, `yield*` | state-machine pass plus `ts2hx.Generator` | |
| `async`/`await`, `for await`, async generators | the same state machine driven by `ts2hx.Promise` | Microtask ordering matches Node (0002). |
| `eval`, `with`, `new Function`, `Proxy`, `Reflect.*` (ES), `WeakRef`, `FinalizationRegistry` | Out of scope (`WeakMap`/`WeakSet` are degraded to strong maps) | |

## Standard library (bound by checker symbol through `stdlib/bindings`)

| Area | Runtime | Notes |
| --- | --- | --- |
| `console` | `ts2hx.Console` | `util.inspect` subset. |
| `String.prototype.*`, `String.*` | `ts2hx.JsString` | All ES2022 methods except `localeCompare` options, `normalize` forms and `Intl`. |
| `Number`, `parseInt`, `parseFloat`, `isNaN`, `toFixed`, `toString(radix)`, `toPrecision` | `ts2hx.Num` | |
| `Math.*` | Haxe `Math` and `ts2hx.JsMath` | JS `Math.round` semantics, variadic `max`/`min`, `sign`, `trunc`, `hypot`, … |
| `Array.prototype.*`, `Array.from`/`of`/`isArray` | `ts2hx.JsArray` | Callbacks receive `(value, index, array)`. `sort` defaults to string comparison and is stable. `splice` supports insertion. `length` is writable. |
| `Map`, `Set`, `WeakMap`, `WeakSet` | `ts2hx.JsMap` / `ts2hx.JsSet` | |
| `Object.keys`/`values`/`entries`/`assign`/`fromEntries`/`freeze` (no-op) | `ts2hx.Obj` | |
| `JSON.parse`/`stringify` (indent, replacer array) | `ts2hx.Json` | The key order comes from the static type. Replacer functions and `toJSON` are supported. |
| `Promise.*`, `setTimeout`/`setInterval`/`queueMicrotask` | `ts2hx.Promise`, `ts2hx.EventLoop` | |
| `Error` family, `Date` (UTC only), `Intl`, typed arrays | `ts2hx.Error` family / `ts2hx.JsDate` degraded (no local time zones) / out of scope / `Uint8Array` family degraded to `Array<Float>` | |
| any other lib member | `Unsupported` with the member name | A warning lists them per run. |
