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
  Math.round(-0.4),
  Math.round(0.49999999999999994),
  Math.round(-0.5),
  Math.round(1.5),
);
console.log(
  Math.ceil(-0.5),
  Math.trunc(-0.5),
  Math.sign(-0),
  Math.sign(NaN),
  Math.floor(Infinity),
);
console.log(
  Math.max(1, NaN, 3),
  Math.min(0, -0),
  Math.max(-0, 0),
  Math.abs(-0),
);
const values = [4, -2, 9];
console.log(
  Math.max(...values),
  Math.min(...values),
  Math.hypot(),
  Math.hypot(1, NaN, Infinity),
);
console.log(
  Math.LN2,
  Math.LN10,
  Math.LOG2E,
  Math.LOG10E,
  Math.SQRT2,
  Math.SQRT1_2,
);
console.log(
  Math.log10(1000),
  Math.log2(8),
  Math.log(Math.E),
  Math.exp(0),
  Math.cbrt(-8),
);
console.log(
  Math.sin(0),
  Math.cos(0),
  Math.atan2(1, 1),
  Math.tanh(0),
  Math.sinh(0),
  Math.cosh(0),
);
console.log(
  Math.asinh(0),
  Math.acosh(1),
  Math.atanh(0),
  Math.log1p(0),
  Math.expm1(0),
);
console.log(
  Math.fround(5.5),
  Math.fround(5.05),
  Math.imul(3, 4),
  Math.imul(0xffffffff, 5),
  Math.clz32(1),
);
console.log(
  Math.clz32(0),
  Math.sqrt(-1),
  Math.pow(2, 0.5),
  Math.asin(1),
  Math.acos(1),
  Math.atan(0),
);
console.log(Math.floor(7 / 2), Math.round(-7.5), Math.trunc(1e21), Math.tan(0));
const r = Math.random();
console.log(r >= 0 && r < 1);
