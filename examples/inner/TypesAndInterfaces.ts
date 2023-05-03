export type MyString = string;
export type MyUnion = string | number;
export type MyTuple = [number, string];
export type MyLiteral = 'foo' | 'bar';

export type MyEmpty = {};
export type Coords = { x: number; y: number };

export type GetReturnType<Type> = Type extends (
  ...args: never[]
) => infer Return
  ? Return
  : never;

export type MyObject = {
  foo: string;
  bar?: MyLiteral;
  method(): void;
  fn: () => string;
  readonly prop: number;
};
export type MyOtherObject = {
  [key: string]: MyUnion;
};

export type MyIntersection = Required<MyObject> & {
  lol: MyOtherObject;
} & Coords;

export const MY_CONSTANT = {
  foo: 'bar',
  baz: ['quz'],
  lol: { wow: 5 },
} as const;

export type MyConstant = typeof MY_CONSTANT;

const MY_RECORD: Record<number, string> = { 1: 'foo', 2: 'bar' };
export default MY_RECORD;

export interface MyInterface {
  foo: string;
  bar?: MyLiteral;
  method(): void;
  fn: () => string;
  readonly prop: number;
}

export interface MyConstructorHolder {
  new (foo: string): { bar: number };
}

export interface MyOtherInterface extends Partial<MyInterface>, Error {
  lol: string;
}

export interface MyInterfaceToImplement {
  foo: string;
}

export interface MyInterfaceToImplementSecond {
  bar: number;
}

enum MyNumberEnum {
  Foo,
  Bar,
  Baz,
}

enum MyStringEnum {
  Foo = 'foo',
  Bar = 'bar',
  Baz = 'baz',
}

enum MyHybridEnum {
  Foo = 10,
  Bar,
  Baz,
}
