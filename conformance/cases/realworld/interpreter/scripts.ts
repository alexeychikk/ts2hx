export interface Script {
  name: string;
  source: string;
}

export const SCRIPTS: Script[] = [
  {
    name: 'basics',
    source: `
# arithmetic, strings and conditionals
let x = 7;
let y = 3;
print("sum", x + y, "diff", x - y, "prod", x * y);
print("div", x / y, "mod", x % y, "neg", -x);
print("concat: " .. x .. "/" .. y);
let label = if x > y { "bigger" } else { "smaller" };
print(label, x == 7, x != 7, not (x < y));
print(0.1 + 0.2, 1 / 3, 2 * 1000000 * 1000000 * 1000000 * 1000);
print(fixed(PI, 4), floor(9.99), sqrt(2));
if x % 2 == 0 {
  print("even");
} else if x % 3 == 0 {
  print("multiple of three");
} else {
  print("odd");
}
x += 10;
y -= 1;
x * y;
`,
  },
  {
    name: 'recursion',
    source: `
fn fib(n) {
  if n < 2 { return n; }
  return fib(n - 1) + fib(n - 2);
}
fn fact(n) {
  let acc = 1;
  let i = 1;
  while i <= n {
    acc = acc * i;
    i += 1;
  }
  return acc;
}
let fibs = map(range(15), fib);
print("fib", join(fibs, ","));
print("fact(10) =", fact(10), "fact(20) =", fact(20));
fn gcd(a, b) {
  if b == 0 { return a; }
  return gcd(b, a % b);
}
print("gcd", gcd(1071, 462), gcd(17, 5));
fn hanoi(n, from, to, via, moves) {
  if n == 0 { return moves; }
  hanoi(n - 1, from, via, to, moves);
  push(moves, from .. to);
  return hanoi(n - 1, via, to, from, moves);
}
let moves = hanoi(4, "A", "C", "B", []);
print(len(moves), "moves:", join(moves, " "));
fib(16);
`,
  },
  {
    name: 'closures',
    source: `
fn counter(start) {
  let count = start;
  return {
    inc: fn() { count += 1; return count; },
    get: fn() => count,
  };
}
let a = counter(0);
let b = counter(100);
a.inc(); a.inc(); b.inc();
print("a", a.get(), "b", b.get());
fn compose(f, g) { return fn(x) => f(g(x)); }
let inc = fn(x) => x + 1;
let double = fn(x) => x * 2;
print(compose(inc, double)(5), compose(double, inc)(5));
let adders = [];
for i in range(4) {
  push(adders, fn(x) => x + i);
}
print(join(map(adders, fn(f) => f(10)), " "));
fn memo(f) {
  let cache = {};
  return fn(n) {
    let key = str(n);
    if has(cache, key) { return cache[key]; }
    let value = f(n);
    cache[key] = value;
    return value;
  };
}
let calls = 0;
let slowSquare = memo(fn(n) { calls += 1; return n * n; });
print(slowSquare(9), slowSquare(9), slowSquare(4), "calls", calls);
counter;
`,
  },
  {
    name: 'collections',
    source: `
let words = split("the quick brown fox jumps over the lazy dog", " ");
print(len(words), "words");
let lengths = map(words, fn(w) => len(w));
print("lengths", lengths);
let long = filter(words, fn(w) => len(w) > 3);
print("long", long);
let total = reduce(lengths, fn(acc, n) => acc + n, 0);
print("total", total, "avg", fixed(total / len(words), 2));
print("sorted", sort(words));
print("by length", sort(words, fn(w) => -len(w)));
let freq = {};
for w in words {
  if has(freq, w) { freq[w] += 1; } else { freq[w] = 1; }
}
print("freq", freq);
let letters = 0;
for ch in "hello world" {
  if ch != " " { letters += 1; }
}
print("letters", letters, upper("shout"), "abc"[1], words[-1]);
let matrix = map(range(1, 4), fn(r) => map(range(1, 4), fn(c) => r * c));
for row in matrix { print(join(row, "\t")); }
let stack = [1, 2, 3];
let popped = pop(stack);
print("popped", popped, "left", stack, "evens", range(0, 10, 2), "down", range(5, 0, -2));
[words[0], len(freq), matrix[2][2]];
`,
  },
  {
    name: 'records-json',
    source: `
let inventory = [
  { name: "apple", price: 0.5, qty: 10, tags: ["fruit", "red"] },
  { name: "bread", price: 2.25, qty: 2, tags: [] },
  { name: "cheese", price: 7.8, qty: 1, tags: ["dairy"], meta: { aged: true, months: 12 } },
];
let value = 0;
for item in inventory {
  value += item.price * item.qty;
}
print("inventory value", fixed(value, 2));
let names = map(inventory, fn(i) => i.name);
print(json(names));
print(json(inventory[2]));
print(json({ empty: {}, list: [], nested: [[1], [2, [3]]], nothing: nil, text: "q\\"uote" }, 2));
let decoded = parse_json("{\\"z\\": 1, \\"a\\": [true, false, null], \\"m\\": {\\"k\\": \\"v\\"}, \\"n\\": -2.5e3}");
print("keys", keys(decoded), "type of a", type(decoded.a), decoded.n);
decoded.extra = "added";
decoded["z"] = decoded.z + 41;
print(json(decoded));
let roundtrip = parse_json(json(inventory));
print("roundtrip equal", roundtrip == inventory, roundtrip[0] == inventory[1]);
try {
  parse_json("{broken");
} catch (e) {
  print("caught", e.kind, e.message);
}
print(type(1), type("s"), type(nil), type(true), type([]), type({}), type(print), print);
inventory[0];
`,
  },
  {
    name: 'errors',
    source: `
fn safeDiv(a, b) {
  try {
    return a / b;
  } catch (e) {
    print("recovered:", e.message);
    return nil;
  }
}
print(safeDiv(10, 4), safeDiv(1, 0));
fn validate(user) {
  if not has(user, "name") { throw { code: 400, reason: "missing name" }; }
  if len(user.name) < 3 { throw "name too short: " .. user.name; }
  return "ok:" .. user.name;
}
for candidate in [{ name: "alice" }, { age: 3 }, { name: "al" }] {
  try {
    print(validate(candidate));
  } catch (err) {
    print("invalid", err);
  }
}
let attempts = 0;
while true {
  attempts += 1;
  try {
    if attempts < 3 { throw attempts; }
    break;
  } catch (n) {
    print("retry after", n);
    continue;
  }
}
print("attempts", attempts);
try { undefinedThing(); } catch (e) { print(e.kind, e.line, e.message); }
try { [1, 2][5]; } catch (e) { print(e.message); }
try { "a" - 1; } catch (e) { print(e.message); }
try { assert(1 > 2, "math is broken"); } catch (e) { print(e.message); }
try { fib(); } catch (e) { print(e.message); }
fn deep(n) { return deep(n + 1); }
try { deep(0); } catch (e) { print(e.message); }
fn outer() { return inner(); }
fn inner() { return {}.missing.field; }
outer();
`,
  },
  {
    name: 'deferred',
    source: `
let log = [];
defer(30, fn() { push(log, "late"); print("late runs, log =", log); });
defer(0, fn() { push(log, "first"); print("first runs"); });
defer(10, fn() { push(log, "middle"); print("middle runs"); });
print("scheduled", len(log));
"sync done";
`,
  },
  {
    name: 'bank',
    source: `
fn account(owner, balance) {
  let history = [];
  let self = { owner: owner };
  self.deposit = fn(amount) {
    if amount <= 0 { throw "deposit must be positive"; }
    balance += amount;
    push(history, "+" .. amount);
    return balance;
  };
  self.withdraw = fn(amount) {
    if amount > balance { throw { code: "NSF", need: amount - balance }; }
    balance -= amount;
    push(history, "-" .. amount);
    return balance;
  };
  self.balance = fn() => balance;
  self.history = fn() => history;
  return self;
}
fn transfer(from, to, amount) {
  try {
    from.withdraw(amount);
    to.deposit(amount);
    return true;
  } catch (e) {
    print("transfer failed:", from.owner, "->", to.owner, e);
    return false;
  }
}
let ann = account("ann", 100);
let bob = account("bob", 20);
print(transfer(ann, bob, 30), transfer(bob, ann, 80), transfer(bob, ann, 50));
print(ann.owner, ann.balance(), ann.history());
print(bob.owner, bob.balance(), bob.history());
let accounts = sort([ann, bob], fn(account) => account.balance());
map(accounts, fn(acc) => acc.owner);
`,
  },
  {
    name: 'bad-syntax',
    source: `
let ok = 1;
fn broken(a, a) { return a; }
`,
  },
  {
    name: 'bad-token',
    source: `let x = 3 @ 4;`,
  },
  {
    name: 'uncaught',
    source: `
fn check(n) {
  if n > 2 { throw { failed: n }; }
  return n;
}
print(check(1), check(2));
check(3);
`,
  },
  {
    name: 'runaway',
    source: `
let n = 0;
while true { n += 1; }
`,
  },
];
