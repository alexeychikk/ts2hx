export const A = { foo: 'bar' };
export type B = { foo: string };
const C = 10;
export default C;
export type D = 'foo' | 'bar';

export class SuperParent {
  bar: number;

  constructor(
    public foo: string,
    public lol: string | number,
    public kek: B[],
    bar = 4,
  ) {
    this.bar = bar;
  }
}
