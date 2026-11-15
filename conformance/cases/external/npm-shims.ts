import Joi from 'joi';
import _, { chunk, groupBy } from 'lodash';
import { customAlphabet, nanoid, urlAlphabet } from 'nanoid';
import seedrandom from 'seedrandom';

interface User {
  name: string;
  age: number;
}

const users: User[] = [
  { name: 'ann', age: 31 },
  { name: 'bob', age: 25 },
  { name: 'cid', age: 31 },
];

console.log(chunk([1, 2, 3, 4, 5], 2));
console.log(_.uniq([3, 1, 3, 2, 1]));
console.log(_.compact([0, 1, 2, 0, 3]));
console.log(_.sum([1, 2, 3.5]));
console.log(_.sumBy(users, (u) => u.age));
console.log(_.sortBy(users, (u) => u.age).map((u) => u.name));
console.log(_.maxBy(users, (u) => u.age)?.name);
console.log(_.first([7, 8]), _.last([7, 8]), _.head<number>([]));
console.log(_.difference([1, 2, 3, 4], [2, 4]));
console.log(_.without([1, 2, 1, 3], 1));
console.log(_.times(4, (i) => i * i));
console.log(_.clamp(15, 0, 10), _.clamp(-3, 0, 10));
const byAge = groupBy(users, (u) => String(u.age));
console.log(Object.keys(byAge), byAge['31'].length);
const byName = _.keyBy(users, (u) => u.name);
console.log(byName['bob'].age);
console.log(_.isEmpty([]), _.isEmpty([1]), _.isEqual([1, [2]], [1, [2]]));
const copy = _.cloneDeep(users);
copy[0].age = 99;
console.log(users[0].age, copy[0].age);
console.log(_.escapeRegExp('a.b*c'));
const square = _.memoize((n: number) => {
  console.log('computing', n);
  return n * n;
});
console.log(square(4), square(4));

const schema = Joi.object({
  name: Joi.string().min(2).required(),
  age: Joi.number().integer().min(0),
});
console.log(schema.validate({ name: 'ann', age: 4 }).error === undefined);
console.log(schema.validate({ age: 4 }).error?.message);
console.log(schema.validate({ name: 'a' }).error?.message);
console.log(schema.validate({ name: 'ann', age: -1 }).error?.message);
console.log(schema.validate({ name: 'ann', age: 1.5 }).error?.message);
console.log(schema.validate({ name: 'ann', age: 'x' }).error?.message);
console.log(Joi.array().items(Joi.number()).validate([1, 'a']).error?.message);
console.log(Joi.string().valid('a', 'b').validate('c').error?.message);

const id = nanoid();
console.log(
  id.length,
  id.split('').every((c) => urlAlphabet.includes(c)),
);
console.log(nanoid(8).length);
const hex = customAlphabet('0123456789abcdef', 6);
const h = hex();
console.log(
  h.length,
  h.split('').every((c) => '0123456789abcdef'.includes(c)),
);

const rng = seedrandom('hello.');
console.log(rng(), rng());
const other = seedrandom('ts2hx');
console.log(other(), other());
