function makeValues(count: number): number[] {
  const values: number[] = [];
  let seed = 17;
  for (let i = 0; i < count; i++) {
    seed = (seed * 31 + 7) % 1009;
    values.push(seed - 500);
  }
  return values;
}

function bubbleSort(values: number[]): number[] {
  const sorted = values.slice();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = 0; j < sorted.length - 1 - i; j++) {
      if (sorted[j] > sorted[j + 1]) {
        const t = sorted[j];
        sorted[j] = sorted[j + 1];
        sorted[j + 1] = t;
      }
    }
  }
  return sorted;
}

function matrixProduct(): number {
  const n = 140;
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < n * n; i++) {
    a.push((i % 7) - 3);
    b.push((i % 5) + 0.5);
  }
  const c: number[] = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const aik = a[i * n + k];
      for (let j = 0; j < n; j++) {
        c[i * n + j] += aik * b[k * n + j];
      }
    }
  }
  let trace = 0;
  for (let i = 0; i < n; i++) {
    trace += c[i * n + i];
  }
  return trace;
}

function pairCount(values: number[], target: number): number {
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      if (values[i] + values[j] === target) {
        count++;
      }
    }
  }
  return count;
}

function prefixSums(values: number[]): number[] {
  const sums: number[] = [0];
  for (let i = 0; i < values.length; i++) {
    sums.push(sums[i] + values[i]);
  }
  return sums;
}

function reverseInPlace(values: number[]): void {
  for (let lo = 0, hi = values.length - 1; lo < hi; lo++, hi--) {
    const t = values[lo];
    values[lo] = values[hi];
    values[hi] = t;
  }
}

function strided(values: number[]): number {
  let total = 0;
  for (let step = 1; step <= 4; step++) {
    for (let i = 0; i < values.length; i += step) {
      total += values[i];
    }
  }
  return total;
}

function countDown(n: number): number {
  let steps = 0;
  for (let i = n; i > 0; i--) {
    steps += i % 3;
  }
  return steps;
}

function squaresOverflowInt(): number {
  let total = 0;
  for (let i = 0; i < 100000; i++) {
    total += i * i;
  }
  return total;
}

function negativeZero(): string {
  const out: number[] = [];
  for (let i = 0; i > -3; i--) {
    out.push(1 / (i * 0));
  }
  const zero = 0;
  out.push(1 / -zero);
  return out.join(',');
}

function widenedReads(): string {
  const parts: string[] = [];
  const pairs: number[][] = [];
  const boxed: unknown[] = [];
  const byKey = new Map<number, string>();
  for (let i = 0; i < 4; i++) {
    parts.push('k' + i + `:${i / 2}`);
    pairs.push([i, i * 10]);
    boxed.push(i);
    byKey.set(i, String(i % 0));
  }
  const total = boxed.reduce<number>((sum, x) => sum + (x as number), 0);
  return [
    parts.join(' '),
    JSON.stringify(pairs),
    total,
    byKey.get(2),
    typeof boxed[1],
  ].join(' | ');
}

function capturedCounters(): number {
  const getters: Array<() => number> = [];
  for (let i = 0; i < 3; i++) {
    getters.push(() => i * 2);
  }
  return getters.reduce((sum, get) => sum + get(), 0);
}

function shadowed(values: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const label = (i: number) => (i / 4).toFixed(2);
    out.push(label(values[i]));
  }
  return out.join(',');
}

function halving(n: number): string {
  const seen: number[] = [];
  for (let x = n; x > 0.1; x = x / 2) {
    seen.push(x);
  }
  return seen.join(',');
}

function fractionalStep(): string {
  const seen: number[] = [];
  for (let x = 0; x < 2; x += 0.25) {
    seen.push(x);
  }
  return seen.join(',');
}

function bigCounter(): number {
  let total = 0;
  for (let i = 2147483640; i < 2147483650; i++) {
    total += i;
  }
  return total;
}

function counterEscapes(): number[] {
  const out: number[] = [];
  let i = 0;
  for (; i < 3; i++) {
    out.push(i);
  }
  out.push(i / 2);
  return out;
}

function whileIndex(values: number[]): number {
  let i = 0;
  let total = 0;
  while (i < values.length) {
    total += values[i] * i;
    i++;
  }
  return total;
}

const values = makeValues(4000);
const sorted = bubbleSort(values);
console.log('sorted', sorted[0], sorted[1999], sorted[3999]);
console.log('trace', matrixProduct());
console.log('pairs', pairCount(values, 17));
const sums = prefixSums([1, 2, 3, 4, 5]);
console.log('sums', sums.join(','));
reverseInPlace(sums);
console.log('reversed', sums.join(','));
console.log('strided', strided(values));
console.log('countDown', countDown(100000));
console.log('squares', squaresOverflowInt());
console.log('negativeZero', negativeZero());
console.log('widened', widenedReads());
console.log('captured', capturedCounters());
console.log('shadowed', shadowed([1, 2, 3]));
console.log('halving', halving(5));
console.log('fractional', fractionalStep());
console.log('big', bigCounter());
console.log('escapes', counterEscapes().join(','));
console.log('while', whileIndex([3, 1, 4, 1, 5, 9, 2, 6]));
