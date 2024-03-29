import {
  MyInterfaceToImplement,
  MyInterfaceToImplementSecond,
} from './types-and-interfaces.dto';
import { SuperParent } from './Nested';

export class MyEmptyClass {}

class MySimpleClass {
  myString = 'foo';
  constructor() {}

  get prop(): string {
    return this.myString;
  }

  set prop(value: string) {
    this.myEmptyMethod();
    this.myString = value;
  }

  myEmptyMethod() {}

  protected myProtectedMethod() {
    function generic<T>(foo: T) {
      return console.log(foo);
    }

    generic<number>(4);
    this.myGenericMethod<Record<string, never>>('foo', {});

    return 4 * 5;
  }

  private myGenericMethod<T>(foo: string, bar: T): Promise<void> {
    console.log(foo, bar);
    return Promise.resolve();
  }
}

abstract class MyAbstractClass<T extends string> {
  abstract myAbstractMethod(foo: T): number;
}

class MyExtendedClass
  extends MyAbstractClass<'foo' | 'bar'>
  implements MyInterfaceToImplement, MyInterfaceToImplementSecond
{
  foo!: string;
  bar = 5;

  myAbstractMethod(foo: 'bar'): number {
    return 5;
  }
}

class Animal {
  public myPublicString: string;
  protected myProtectedNumber!: number;
  private myPrivateBoolean?: boolean;
  myImplicitPublicFunction: () => void;

  protected constructor(public readonly name: string, myPublicString: string) {
    this.myPublicString = myPublicString;
    this.myImplicitPublicFunction = () => undefined;
  }

  sayHello() {
    console.log(`Hello, my name is ${this.name}!`);
  }

  poop(): string {
    return 'poop';
  }
}

class Dog extends Animal {
  age: number;
  public readonly legs = 4;

  constructor(name: string, public breed: string) {
    super(name, 'foo');
    this.age = 10;
  }

  public override sayHello(): void {
    super.sayHello();
    this.bark();
  }

  private bark(): void {
    console.log('Woof!');
  }
}

export class Main {
  public static async main() {
    const myDog = new Dog('Fido', 'Labrador');
    myDog.sayHello();
  }

  protected asyncMethod = async () => {
    return Promise.resolve(5);
  };

  private thisParameter() {
    function foo(this: Dog) {
      console.log(this.age);

      const bar = (x: number) => {
        console.log(x + this.age);
      };
      bar(4);

      function baz(this: MyExtendedClass) {
        console.log(this.bar);
      }
      baz.call(new MyExtendedClass());
    }

    foo.call(new Dog('foo', 'bar'));
  }
}

class MyError extends Error {}

class ParentLevel1 extends SuperParent {}

class ParentLevel2 extends ParentLevel1 {}

class Inherited extends ParentLevel2 {}
