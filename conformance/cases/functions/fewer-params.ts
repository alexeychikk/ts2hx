type Impl = (args: number[], pos: string, extra?: boolean) => number;

const f: Impl = (args) => args.length;
const table: Array<[string, Impl]> = [
  ['a', (args, pos) => args.length + pos.length],
  [
    'b',
    function (args) {
      return args[0] * 10;
    },
  ],
];

class Holder {
  constructor(private readonly impl: Impl) {}
  run(): number {
    return this.impl([1, 2], 'xy', true);
  }
}

function apply(impl: Impl): number {
  return impl([7], 'q');
}

const record: Record<string, Impl> = { only: () => 42 };

console.log(f([1], 'p', false), new Holder(table[0][1]).run());
console.log(new Holder(table[1][1]).run(), new Holder((a) => a[0]).run());
console.log(
  apply((a, p) => a[0] + p.length),
  apply(() => -1),
  record.only([], ''),
);
