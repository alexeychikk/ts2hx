const trace: string[] = [];

function propagate(): void {
  try {
    trace.push('try');
    throw new Error('boom');
  } finally {
    trace.push('finally');
  }
}

try {
  propagate();
} catch (e) {
  trace.push(`outer ${(e as Error).message}`);
}
console.log(trace.join(' > '));

function overrideThrow(): string {
  try {
    throw new Error('lost');
  } finally {
    // eslint-disable-next-line no-unsafe-finally
    return 'finally wins';
  }
}
console.log(overrideThrow());

function overrideReturn(): number {
  try {
    return 1;
  } finally {
    // eslint-disable-next-line no-unsafe-finally
    return 2;
  }
}
console.log(overrideReturn());

function throwFromCatch(): string {
  const steps: string[] = [];
  try {
    try {
      throw new Error('first');
    } catch (e) {
      steps.push(`catch ${(e as Error).message}`);
      throw new Error('second');
    } finally {
      steps.push('inner finally');
    }
  } catch (e) {
    steps.push(`outer ${(e as Error).message}`);
  } finally {
    steps.push('outer finally');
  }
  return steps.join(', ');
}
console.log(throwFromCatch());

function nested(): string {
  const steps: string[] = [];
  try {
    try {
      steps.push('inner');
      return steps.join('+');
    } finally {
      steps.push('inner finally');
    }
  } finally {
    steps.push('outer finally');
    console.log('nested steps', steps.join(', '));
  }
}
console.log(nested());

function search(grid: number[][], target: number): string {
  let visits = 0;
  outer: for (let row = 0; row < grid.length; row++) {
    for (const cell of grid[row]) {
      try {
        if (cell === target) break outer;
        if (cell < 0) continue outer;
      } finally {
        visits++;
      }
    }
  }
  return `visits ${visits}`;
}
console.log(
  search(
    [
      [1, 2],
      [-1, 5],
      [3, 4],
    ],
    3,
  ),
);

let counter = 0;
while (true) {
  try {
    counter++;
    if (counter < 3) continue;
    break;
  } finally {
    trace.push(`loop ${counter}`);
  }
}
console.log(counter, trace.join(', '));

function voidReturn(flag: boolean): void {
  try {
    if (flag) return;
    console.log('no early return');
  } finally {
    console.log('void finally', flag);
  }
}
voidReturn(true);
voidReturn(false);

function generic<T>(value: T, fallback: T): T {
  try {
    if (value === null) throw new Error('null');
    return value;
  } catch {
    return fallback;
  } finally {
    console.log('generic finally');
  }
}
console.log(
  generic('value', 'fallback'),
  generic<string | null>(null, 'fallback'),
);

const labels = ['a', 'b', 'c'];
const seen: string[] = [];
for (const label of labels) {
  switch (label) {
    case 'b':
      try {
        break;
      } finally {
        seen.push(`finally ${label}`);
      }
    default:
      seen.push(label);
  }
}
console.log(seen.join(' '));
