console.log(
  Math.floor(-1.5),
  Math.ceil(-1.5),
  Math.round(-1.5),
  Math.round(2.5),
  Math.round(-2.5),
);
console.log(Math.trunc(-4.7), Math.sign(-3), Math.abs(-7.25));
console.log(Math.max(1, 5, 3), Math.min(1, 5, 3), Math.max(), Math.min());
console.log(Math.sqrt(16), Math.pow(2, 10), Math.hypot(3, 4), Math.cbrt(27));
console.log(Math.PI, Math.E);
console.log(
  parseInt('42px'),
  parseInt('ff', 16),
  parseFloat('3.14abc'),
  Number('12'),
  Number(''),
  Number('x'),
);
console.log(
  (255).toString(16),
  (255).toString(2),
  (3.14159).toFixed(2),
  (0.000123).toPrecision(2),
);
console.log(
  Number.isInteger(5),
  Number.isInteger(5.5),
  Number.isNaN(NaN),
  isFinite(1 / 0),
);
console.log(Number.MAX_SAFE_INTEGER, Number.EPSILON > 0);
