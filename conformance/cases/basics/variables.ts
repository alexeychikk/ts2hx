console.log(typeof hoisted, hoisted);
var hoisted: number | undefined = 5;
console.log(hoisted);

let x = 1;
{
  let x = 2;
  console.log('inner', x);
}
console.log('outer', x);
x = x + 1;

const frozen = Object.freeze({ k: 1 });
console.log(frozen.k, Object.isFrozen(frozen));

let a = 1;
let b = 2;
[a, b] = [b, a];
console.log(a, b);

const { k, missing = 'default' } = {
  k: 'value',
  missing: undefined as string | undefined,
};
console.log(k, missing);
