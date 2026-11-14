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
console.log(
  parseInt('  -0x1A'),
  parseInt('0x1A', 10),
  parseInt('z', 36),
  parseInt('12', 1),
  parseInt(''),
);
console.log(
  parseInt('-0'),
  parseInt('123.9'),
  parseInt('1e3'),
  parseInt('  +7  '),
  parseInt('9007199254740993'),
);
console.log(
  parseFloat('  -.5e2xyz'),
  parseFloat('Infinityx'),
  parseFloat('-Infinity'),
  parseFloat('e5'),
  parseFloat('1e'),
);
console.log(
  parseFloat('0x10'),
  parseFloat('.'),
  parseFloat('5.'),
  parseFloat('-0'),
  parseFloat('1e400'),
);
console.log(
  Number.parseInt('11', 2),
  Number.parseFloat('2.5'),
  isNaN(NaN),
  isNaN(1),
  Number.isFinite(5),
);
console.log(
  (1.005).toFixed(2),
  (2.5).toFixed(0),
  (-2.5).toFixed(0),
  (1.45).toFixed(1),
  (0).toFixed(2),
);
console.log(
  (-0.0001).toFixed(2),
  (1e21).toFixed(2),
  (123.456).toFixed(),
  (0.5).toFixed(0),
  (1.5).toFixed(0),
);
console.log(
  (1234.5678).toFixed(10),
  (0.1).toFixed(20),
  (-1.5e-7).toFixed(3),
  NaN.toFixed(2),
);
console.log(
  (123.456).toPrecision(4),
  (0.00001).toPrecision(1),
  (1e21).toPrecision(3),
  (123456).toPrecision(2),
);
console.log(
  (99.99).toPrecision(3),
  (0).toPrecision(3),
  (-1.25).toPrecision(2),
  (1.5).toPrecision(),
  (5).toPrecision(1),
);
console.log(
  (123.456).toExponential(2),
  (0).toExponential(),
  (12345).toExponential(),
  (-0.00015).toExponential(1),
);
console.log(
  (0.5).toString(2),
  (0.1).toString(3),
  (-255.5).toString(16),
  (1e21).toString(36),
  (3.75).toString(8),
);
console.log(
  Math.PI.toString(7),
  (1 / 3).toString(2),
  (2 ** 60).toString(2),
  NaN.toString(16),
  (-Infinity).toString(2),
);
console.log(
  (0).toString(16),
  (-0).toString(2),
  (1e-7).toString(2).slice(0, 20),
  (255).toString(),
  (35).toString(36),
);
console.log(
  Number.isSafeInteger(2 ** 53),
  Number.isSafeInteger(2 ** 53 - 1),
  Number.MIN_SAFE_INTEGER,
);
console.log(
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  Number.EPSILON,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
);
const n = 42.125;
console.log(
  n.toFixed(1),
  n.toString(),
  `${n.toPrecision(3)}`,
  String(n.toFixed(2)).length,
);
console.log(
  (255).toString(16.5),
  (255).toString(2.9),
  (255).toString(36.9),
  (1.25).toPrecision(2.9),
  (12.5).toExponential(1.9),
);
console.log(
  NaN.toPrecision(0),
  Infinity.toExponential(200),
  (-Infinity).toPrecision(500),
  NaN.toExponential(-1),
);
