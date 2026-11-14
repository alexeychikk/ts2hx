const log: string[] = [];

function f(n: number): string {
  try {
    if (n === 0) return 'zero';
    if (n < 0) throw new Error('negative');
    log.push('body');
  } catch (e) {
    log.push('catch');
    return 'caught';
  } finally {
    log.push(`finally ${n}`);
  }
  return 'end';
}

console.log(f(0), f(-1), f(1));
console.log(log.join(', '));

function loop(): number {
  let i = 0;
  for (; i < 5; i++) {
    try {
      if (i === 1) continue;
      if (i === 3) break;
    } finally {
      log.push(`iteration ${i}`);
    }
  }
  return i;
}
log.length = 0;
console.log(loop(), log.join(', '));

function override(): string {
  try {
    return 'try';
  } finally {
    console.log('finally runs before return');
  }
}
console.log(override());
