function attempt(format: () => string): string {
  try {
    return format();
  } catch (e) {
    return e instanceof RangeError ? 'RangeError' : 'other';
  }
}
console.log(
  attempt(() => (255).toString(1.9)),
  attempt(() => (255).toString(NaN)),
  attempt(() => (255).toString(37)),
  attempt(() => (1.5).toPrecision(NaN)),
  attempt(() => (1.5).toPrecision(0.5)),
  attempt(() => (1).toExponential(-1)),
  attempt(() => (1).toFixed(101)),
);
