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
  implementation where it matches exactly: on JS, `js.lib.Map`, the native
  Promise, `RegExp` and `Number.prototype.toString`. Otherwise it uses a pure
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
  anonymous structures, and C# and C++ do not keep key order for those.
  Enumeration sites (`Object.keys/values/entries`, `for…in`, `JSON.stringify`,
  object spread) therefore pass the key order of the static type to the
  runtime (`Obj.keys(o, ["b", "a"])`), with any extra runtime fields after
  it. Dictionaries (index signatures, `Record<string, T>`, objects used as
  maps) become `ts2hx.Dict<T>`, an insertion-ordered map abstract with
  field-like access. Enumerating a value typed `any` follows the target's
  `Reflect.fields` order (documented as degraded).
- **Collections.** `Map` and `Set` become `ts2hx.JsMap` and `ts2hx.JsSet`.
  They keep insertion order and use SameValueZero keys: primitives by value,
  objects by identity, `NaN` equal to itself. On JS they wrap `js.lib.Map`
  and `js.lib.Set`.
- **Async.** `ts2hx.Promise<T>` and `ts2hx.EventLoop` use native Promise and
  timers on JS. On C# and C++ they are pure Haxe, with a microtask queue and a
  timer queue ordered by time and then by insertion. `Main` runs module
  initialisation, then `EventLoop.run()` until both queues are empty. This
  keeps the observable `then`/`await`/`setTimeout` ordering identical to
  Node's. It is single-threaded and does no real I/O.
- **Exceptions.** `Error` and its subclasses become `ts2hx.Error`, which
  extends `haxe.Exception`. `throw` works for any value. `catch (e)` binds
  `Dynamic`. `finally` is lowered by a pass because Haxe 4 has no `finally`.
- **Regex.** `ts2hx.RegExp` keeps JS state (`lastIndex`, `g` and `y` flags,
  groups) on top of `EReg`, which is native RegExp on JS, .NET Regex on C#
  and PCRE2 on C++. Lookbehind works on all three. **.NET numbers named
  groups after all unnamed ones**: `(?<y>\d{4})-(\d\d)` gives `matched(1)` =
  the month on C#, but the year on JS and C++. The runtime therefore rewrites
  named groups into plain groups plus a name→index table before building the
  `EReg`. Unicode property escapes and the `v` flag are out of scope.
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
  arrays, plain objects, Map and Set (the subset the corpus uses), and
  `Sys.println` on C# and C++.

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
