interface User {
  name: string;
  age: number;
  tags: string[];
  address?: { city: string; zip: string };
}

const user: User = {
  name: 'Ann',
  age: 31,
  tags: ['a', 'b'],
  address: { zip: '0101', city: 'Oslo' },
};
console.log(JSON.stringify(user));
console.log(JSON.stringify(user, null, 2));
console.log(JSON.stringify(user, ['name', 'tags']));
console.log(JSON.stringify([1, 'two', true, null, { x: 1.5 }], null, '--'));
console.log(JSON.stringify({ empty: {}, list: [] }, null, 2));
console.log(
  JSON.stringify('quote " and \\ and \n'),
  JSON.stringify(-0),
  JSON.stringify(1e21),
);
console.log(JSON.stringify({ n: NaN, i: Infinity, f: () => 1 }));
console.log(JSON.stringify([undefined, () => 1]));

const replaced = JSON.stringify({ a: 1, b: 'x', c: [2, 3] }, (key, value) =>
  typeof value === 'number' ? value * 10 : value,
);
console.log(replaced);

class Money {
  constructor(
    public amount: number,
    public currency: string,
  ) {}
  toJSON(): string {
    return `${this.amount} ${this.currency}`;
  }
}
console.log(JSON.stringify({ price: new Money(5, 'EUR'), qty: 2 }));

class Plain {
  b = 2;
  a = 1;
}
console.log(JSON.stringify(new Plain()));

const parsed = JSON.parse(
  '{"z":1,"a":[true,false,0],"m":{"k":"v","n":-1.25e2},"s":"\\u0041\\n"}',
);
console.log(parsed);
console.log(Object.keys(parsed), parsed.m.n, parsed.s);
console.log(JSON.stringify(parsed));

const typed = JSON.parse('{"name":"Bo","age":4,"tags":[]}') as User;
console.log(typed.name, typed.age + 1, typed.tags.length);

const numbers = JSON.parse('[1, 2.5, -3]') as number[];
console.log(numbers.map((n) => n * 2));

const revived = JSON.parse('{"a":1,"b":{"c":2}}', (key, value) =>
  typeof value === 'number' ? value + 100 : value,
);
console.log(revived);

try {
  JSON.parse('{bad json');
} catch (e) {
  console.log(e instanceof SyntaxError);
}
