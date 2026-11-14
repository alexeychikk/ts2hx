const a: number = 7;
const b: number = 3;
console.log(a + b, a - b, a * b, a / b, a % b, a ** b);
console.log(-a % b, a % -b, 2 ** 0.5);
console.log(a & b, a | b, a ^ b, ~a, a << 2, -a >> 1, -a >>> 28);
console.log(a > b, a >= b, a < b, a <= b, a === b, a !== b);
console.log('1' + 2, 1 + 2 + '3', Number('4') * 1, +'5');
let c = 10;
c += 5;
c -= 3;
c *= 2;
c /= 4;
c %= 4;
console.log(c, c++, ++c, c--, --c);
console.log(
  typeof a,
  typeof 'x',
  typeof true,
  typeof undefined,
  typeof {},
  typeof (() => 1),
);
console.log(1 ** NaN, (-1) ** Infinity, 1 ** Infinity, NaN ** 0, 2 ** -1);
