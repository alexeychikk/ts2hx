function thrower(value: unknown): void {
  throw value;
}

const values: unknown[] = ['text', 42, 1.5, true, undefined];
for (const value of values) {
  try {
    thrower(value);
    console.log('not reached');
  } catch (e) {
    console.log(typeof e, e === value, String(e));
  }
}

try {
  thrower({ code: 7, reason: 'object' });
} catch (e) {
  const payload = e as { code: number; reason: string };
  console.log(payload.code, payload.reason);
}

try {
  thrower([1, 2, 3]);
} catch (e) {
  console.log(Array.isArray(e), (e as number[]).length);
}

let attempts = 0;
try {
  attempts++;
  throw 0;
} catch {
  console.log('caught without a binding', attempts);
}

function parse(text: string): number {
  const value = Number(text);
  if (Number.isNaN(value)) {
    throw `not a number: ${text}`;
  }
  return value;
}

for (const text of ['12', 'abc']) {
  try {
    console.log('parsed', parse(text));
  } catch (message) {
    console.log('error', message);
  }
}

try {
  try {
    throw 404;
  } catch (code) {
    if (code === 404) throw `rethrown ${String(code)}`;
  }
} catch (outer) {
  console.log(outer);
}
