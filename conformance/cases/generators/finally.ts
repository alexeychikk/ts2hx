function* resource(name: string): Generator<string> {
  console.log('open', name);
  try {
    yield name + ':1';
    yield name + ':2';
    yield name + ':3';
  } finally {
    console.log('close', name);
  }
}

for (const v of resource('a')) {
  console.log(v);
}

for (const v of resource('b')) {
  console.log(v);
  if (v.endsWith('2')) break;
}

function firstOf(): string {
  for (const v of resource('c')) {
    return v;
  }
  return 'none';
}
console.log(firstOf());

try {
  for (const v of resource('d')) {
    console.log(v);
    throw new Error('stop at ' + v);
  }
} catch (e) {
  console.log('caught', (e as Error).message);
}

const early = resource('e');
console.log(early.return('unused'));
console.log(early.next());

const late = resource('f');
console.log(late.next());
console.log(late.return('done early'));
console.log(late.next());

function* recovering(): Generator<number, string> {
  let attempts = 0;
  while (true) {
    try {
      attempts++;
      yield attempts;
    } catch (e) {
      console.log('retry after', (e as Error).message);
      if (attempts >= 3) return 'gave up after ' + attempts;
    } finally {
      console.log('attempt', attempts, 'over');
    }
  }
}
const r = recovering();
console.log(r.next());
console.log(r.throw(new Error('x')));
console.log(r.throw(new Error('y')));
console.log(r.throw(new Error('z')));
console.log(r.next());

function* finallyYields(): Generator<string> {
  try {
    yield 'body';
  } finally {
    yield 'cleanup 1';
    yield 'cleanup 2';
  }
}
const f = finallyYields();
console.log(f.next());
console.log(f.return('final'));
console.log(f.next());
console.log(f.next());

function* uncaught(): Generator<number> {
  yield 1;
  throw new Error('generator failed');
}
const u = uncaught();
console.log(u.next());
try {
  u.next();
} catch (e) {
  console.log('outside caught', (e as Error).message);
}
console.log(u.next());

function* notStarted(): Generator<number> {
  try {
    yield 1;
  } finally {
    console.log('never printed');
  }
}
const n = notStarted();
try {
  n.throw(new Error('before start'));
} catch (e) {
  console.log('thrown back', (e as Error).message);
}
console.log(n.next());
