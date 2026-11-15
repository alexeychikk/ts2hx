# 0002 — Targets JS, C#, C++; one cross-target runtime with JS semantics

Status: accepted (2026-11-14)

## Decision

- **Primary targets: JS (run with Node), C# (.NET) and C++ (hxcpp).** The same
  generated Haxe must compile on all three and print the same stdout as the
  original program run under Node. `--interp` (eval) is an extra fast check
  for development only. It is not in CI and not a conformance gate.
- **Generated code is target-agnostic.** It has no `#if` and no `js.*`,
  `cs.*` or `cpp.*` references. Everything target-specific lives in the
  runtime lib, behind conditional compilation.
- **The runtime lib is `runtime/ts2hx/`**, a Haxe package `ts2hx`. It is
  copied into the output's `ts2hx/` directory and replaces today's `lib/`.
  Its API implements **JS semantics**. Each target uses its native
  implementation where it matches exactly: on JS, `RegExp`,
  `Number.prototype.toString` and `JSON.parse`. Otherwise it uses a pure
  Haxe implementation. The `js.lib` imports in `lib/import.hx` go away.

## Measured target differences (Haxe 4.3.7, all on the same program)

| Probe | JS | C# | C++ |
| --- | --- | --- | --- |
| `Std.string(0.1+0.2)` | `0.30000000000000004` | `0.30000000000000004` | `0.3` |
| `Std.string(100/3)` | `33.333333333333336` | `33.333333333333336` | `33.3333333333333` |
| `Std.string(1e21)` / `Std.string(-0.0)` | `1e+21` / `0` | `1E+21` / `-0` | `1e+21` / `0` |
| `Reflect.fields({b,a,c,zz,d})` | insertion order | alphabetical | alphabetical |
| `"héllo😀".length` | 7 (UTF-16) | 7 | 7 (smart strings) |
| field initialiser vs `super()` | before super | before super | before super |
| class → typedef with an optional field the class lacks | compile error | compile error | compile error |
| `Dynamic` read of a missing field on a class instance | `null` | **throws** | `null` |
| `(?<y>\d{4})-(\d\d)` on `x2024-05`, `matched(1)/matched(2)` | `2024/05` | **`05/2024`** | `2024/05` |
| `arr=[3.0]; arr[5]=1; arr[2]` | `undefined` | `0` | `0` |
| `"abc".charCodeAt(5)` | `undefined` | `null` | `null` |
| method read through `Dynamic`, then called | unbound (as in TS) | bound | bound |

(eval gives 6 for that string length and prints 17 significant digits; another
reason it is not a gate.)

## Semantics the runtime and frontend guarantee on all three targets

- **Numbers.** TS `number` is Haxe `Float` everywhere. `Int` appears only
  where Haxe requires it: the frontend converts with `ts2hx.Num.toIndex(x)` at
  array, string and `Int`-parameter sites. A later optimisation pass may
  demote provably small integer locals to `Int`. Bitwise operators go through
  `Num.toInt32`/`toUint32` and give a Float back. Number→string conversion
  always uses `Num.toString`, a JS `Number::toString` (shortest round-trip)
  implementation, on C# and C++. This covers string concatenation, template
  literals, `String(x)` and `console.log`. On JS it is native.
- **Strings** are Haxe `String`, which is UTF-16 on all three targets.
  `String.prototype` methods are bound to `ts2hx.JsString` with JS semantics:
  `replace` replaces the first match, `slice` takes negative indices, and so
  on.
- **null and undefined** both become Haxe `null`. Code that distinguishes
  them (`x === undefined` when `x` may be `null`, or a default parameter
  receiving an explicit `null`) is degraded and flagged with a TODO wherever
  the checker shows both are possible.
- **Truthiness** is made explicit from the static type: number
  `x != 0 && !isNaN`, string `x != null && x != ""`, object `x != null`.
  `any`, unions and generics fall back to `ts2hx.Ts2hx.truthy(x)`. `a || b`
  and `a && b` keep the operand type, and are lowered with a temporary when
  the operand is not a plain local.
- **Objects and key order.** Object literals with a static shape become
  anonymous structures, and C# and C++ do not keep key order for those
  (`Reflect.fields` is sorted by length, then code unit, even for fields set
  later). Class instances are not in JS order on any target, Haxe JS
  included. So the order is recorded where objects are made, not passed at
  enumeration sites:
  - A literal with two or more fields is printed as
    `ts2hx.Obj.literal({b: 1, a: 2}, ["b", "a"])`. Off JS, that records the
    keys in a weak side table (`ConditionalWeakTable` on C#,
    `haxe.ds.WeakMap` on C++). `Obj.set`, `Obj.assign` and `Json.parse`
    append to it.
  - Every project class has a `@:keep private static final __ts2hx_class`
    initialised by `Obj.declareClass(Cls, "JsName", ["param", "field"])`:
    its JS name and own data fields in JS definition order (parameter
    properties, then field declarations). Base-class fields come first.
  - Every enumeration (`Object.keys/values/entries/assign`, `for…in`,
    `JSON.stringify`, `console.log`) goes through `Obj.keys`. Fields the
    record does not list follow in `Reflect.fields` order (degraded).
  Dictionaries (index signatures, `Record<string, T>`, objects used as
  maps) become `ts2hx.Dict<T>`, an insertion-ordered map class. The
  frontend lowers `d.k`, `d[k]`, `in`, `delete` and `for…in` on it to
  `get`/`set`/`exists`/`remove`/`keys()`, and its keys follow JS order
  (array-index keys ascending, then insertion order). A plain object cast to
  a dictionary type (`JSON.parse(s) as Record<string, T>`) is copied into
  one by `Dict.from`. Enumerating a value from outside the project (an
  extern, `any` built by reflection) follows the target's `Reflect.fields`
  order (documented as degraded).
- **Collections.** `Map` and `Set` become `ts2hx.JsMap` and `ts2hx.JsSet`.
  They keep insertion order and use SameValueZero keys: primitives by value,
  objects by identity, `NaN` equal to itself, `-0` equal to `0`. They are
  the same pure Haxe on every target, abstracts over the untyped `MapCore`
  (like `Promise<T>`, so casts between instantiations keep identity on C#).
  Iterators see entries added while they run. `WeakMap` and `WeakSet` are
  the same strong collections (degraded). `for…of` and spreads walk
  `toArray()` of their iterators.
- **Generators and the iteration protocol.** `ts2hx.Generator<T>` is an
  abstract over the untyped `GeneratorCore`, which runs the step function
  that the `lowerGenerators` pass builds. It forwards `yield*` to the
  delegate's `next`/`throw`/`return`. `return()` throws a `GeneratorReturn`
  signal where the generator is suspended: lowered `finally` blocks catch it
  and `catch` clauses let it through. `ts2hx.Iter` is the protocol over any
  value: arrays, strings, collections, generators, objects with a `next`
  method, and project classes with a `__ts2hx_iterator` method (their
  `[Symbol.iterator]()`). Iterator results are `{ value, done }` in JS key
  order. A local that shares the name of a static function of its class is
  avoided in the runtime: hxcpp emits `var f = f(x)` unqualified, so the
  call reads the uninitialised local.
- **JSON and console.** `ts2hx.Json` uses native `JSON.parse` on JS and a
  pure Haxe parser elsewhere; `stringify` is pure Haxe everywhere so that
  key order and number formatting match. `null` and `undefined` are one
  value in Haxe, so a field holding `undefined` is printed as `null` by
  `stringify` and as `undefined` by `console.log`. `console.log` prints
  class instances as `Name { … }` from the `declareClass` record and
  `Map(n) {…}`/`Set(n) {…}` like Node. A `-0` stored in a `Dynamic`
  becomes `0` on C++ (hxcpp boxes integral doubles as ints).
- **Async.** `ts2hx.Promise<T>` and `ts2hx.EventLoop` are the same pure Haxe
  on every target: native promises would interleave with the pure Haxe
  timers in a different order. `Promise<T>` is an abstract over the untyped
  `PromiseCore`, so casts between instantiations keep identity (C# would copy
  a generic class). `PromiseCore` follows the ECMAScript algorithms step by
  step (including the extra ticks of adopting a promise or thenable), which
  is what makes the `then`/`await` ordering identical to Node's. The loop
  has a microtask queue and a timer queue ordered by due time and then by
  creation; it drains the microtasks after every timer, like Node. Time is
  virtual: a timer runs at `now + delay` (delays outside 1 ms…2^31−1 become
  1 ms), however long the callbacks took, and the loop waits for real until
  then (`Sys.sleep`; a native `setTimeout` on JS). `Main` runs module
  initialisation, then `EventLoop.run()` until both queues are empty. A
  rejection without handlers once the microtasks drain is reported like an
  uncaught error. It is single-threaded and does no real I/O. Node itself
  orders timers created in callbacks against a cached loop time, so cases
  keep such timers well apart from others. Async functions and generators
  (`ts2hx.Async`) drive a `GeneratorCore` step on these promises, so `await`
  costs the spec's ticks. A self-resolution check compares typed
  references: hxcpp's `Dynamic == object` holds for `0`.
- **Exceptions.** `Error` and its subclasses (`TypeError`, `RangeError`, …)
  become `ts2hx.Error` and its subclasses. That is a **plain class, not a
  `haxe.Exception`**: the members of `haxe.Exception` (`message`, `stack`,
  `details`, `previous`) would collide with the JS fields and with fields of
  user subclasses. `name` and `message` are plain fields, `stack` holds just
  `toString()`, and `instanceof` is `Std.isOfType`. `throw` works for any
  value on all targets (Haxe wraps non-exceptions in `ValueException`, and
  `catch (e:Dynamic)` unwraps them). `catch (e)` binds
  `ts2hx.Error.caught(e)`, which maps native runtime errors to JS errors. On
  JS, a native `TypeError`/`RangeError`/… keeps its kind. On C#,
  `NullReferenceException` and `InvalidCastException` become `TypeError`, and
  any other exception becomes `Error`. On C++, a null dereference only
  throws with `HXCPP_CHECK_POINTER`, which builds don't set, so it crashes
  instead (degraded). `finally` is lowered by the `lowerFinally` pass, because
  Haxe 4 has no `finally` (ADR 0005).
- **Regex.** `ts2hx.RegExp` keeps JS state (`lastIndex`, `g` and `y` flags,
  groups) on top of `EReg`, which is native RegExp on JS, .NET Regex on C#
  and PCRE2 on C++. Lookbehind works on all three. **.NET numbers named
  groups after all unnamed ones**: `(?<y>\d{4})-(\d\d)` gives `matched(1)` =
  the month on C#, but the year on JS and C++. The runtime therefore rewrites
  named groups into plain groups plus a name→index table before building the
  `EReg`. Unicode property escapes and the `v` flag are out of scope.
  - JS uses the native RegExp. Off JS, `RegExpPattern` translates the JS
    source so .NET and PCRE2 agree with it. `.`, `^`/`$` (with or without `m`),
    `\d`/`\w`/`\s`/`\b` (ASCII, JS whitespace), `[]`/`[^]`, `\cX`/`\u{…}`
    and legacy octal escapes become explicit classes or lookarounds. A
    backreference to a group that did not take part matches empty, as in JS.
    Only `i` reaches `EReg` as an option, and non-ASCII pattern characters
    are escaped, because hxcpp passes the pattern length in characters to
    PCRE2.
  - Match results are plain `Array<String>`. Their `index`, `input` and
    `groups` sit in a weak side table (`ConditionalWeakTable` on C#,
    `WeakMap` on C++), read by `RegExp.matchIndex`/`matchInput`/`matchGroups`.
    Look them up from the value as `Dynamic`. On C++, typing an
    `Array<String>` as `Array<Dynamic>` copies it, so the copy is not found in
    the table. Casting an `Array<Dynamic>` to `Array<String>` converts its
    elements in place.
  - `y` is exact. `u` only affects how an empty match advances. Off JS
    under `i`, case-insensitive matching follows the target engine for
    non-ASCII letters (degraded).
- **Reflection and dynamic access.** Reading a missing field through
  `Dynamic` gives `null` on anonymous structures on all three targets. On a
  **class instance it throws on C#** (`MemberAccessException: Field not
  found`), but gives `null` on JS and C++. Rules that follow from this:
  - Never let a class instance flow into a structure type whose optional
    fields the class lacks. The ProjectModel scans for those assignments and
    adds the missing optional fields to the class (`Null<T> = null`).
  - Truly dynamic reads (`any`, `obj[key]` on non-dictionaries) go through
    `Reflect.field`, which gives `null` on all three.

  JS prototype manipulation, `Object.defineProperty` getters and `Proxy` are
  out of scope.
- **Array holes.** Writing past the end grows the array on all targets.
  Holes read as `undefined` on JS but `0` on C# and C++ for `Array<Float>`.
  Degraded: holes are documented, not emulated.
- **Output.** `console.log`, `console.error` and `process.stdout.write` go
  to `ts2hx.Console`. It uses Node `util.inspect` formatting for primitives,
  arrays, plain objects, Map and Set (the subset the corpus uses), with
  Node's string quoting and escapes (lone surrogates as `\ud83d`), and
  `Sys.println` on C# and C++. C++ drops a lone surrogate when it writes
  UTF-8, so its output first replaces them with U+FFFD like Node.

## Build and test per target

All three run in the sandbox (Debian aarch64) and on CI (`ubuntu-latest`).
Toolchain versions are in [0003](0003-toolchain.md).

| Target | Build | Run | Notes |
| --- | --- | --- | --- |
| JS | `haxe build-js.hxml` (`--js out/main.js`) | `node out/main.js` | Seconds. |
| C++ | `haxe build-cpp.hxml` (`--cpp out/cpp`) | `out/cpp/Main` | Needs g++. About 40–50 s cold for hello world, under 1 s rebuild when `HXCPP_COMPILE_CACHE` points to a shared directory. Set `HXCPP_COMPILE_THREADS=2` to save memory. hxcpp detects the architecture by itself: never pass `-D HXCPP_M64`, because `-m64` breaks g++ on aarch64. |
| C# | `haxe build-cs.hxml` (`--cs out/cs -D no-compilation`), then `dotnet build out/cs/App.csproj -c Release` | `dotnet out/cs/bin/App.dll` | hxcs only calls mono `mcs`/`csc`, so we compile with the .NET SDK and a generated `App.csproj` (`net10.0`, `StartupObject` `EntryPoint__Main`, `InvariantGlobalization`). Export `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1`: the sandbox has no libicu, and it also makes formatting deterministic. Haxe still needs the `hxcs` haxelib to generate code. |

The C++ and C# builds are slow per program, so the conformance harness builds
**one binary per target for the whole corpus**: each case lives in its own
package and a generated dispatcher selects it by argv. See
[0004](0004-conformance-harness.md).

## Consequences

- Converted projects need no JS host. Anything that only exists on JS (npm
  packages without a shim, DOM, Node APIs) gets a `#if js` extern on the JS
  target. On C# and C++ it becomes a compile-time `#error` naming the missing
  module.
- Haxe 5 removes the C# target, which pins us to Haxe 4.3.x (see 0003).
