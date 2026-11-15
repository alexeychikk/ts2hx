function sealed(_target: Function, _context: ClassDecoratorContext): void {}

function tag(_name: string) {
  return (_target: Function, _context: ClassMethodDecoratorContext): void => {};
}

function field(_value: undefined, _context: ClassFieldDecoratorContext): void {}

@sealed
class Greeter {
  @field greeting = 'Hello';

  constructor(private readonly suffix: string) {}

  @tag('greet')
  greet(name: string): string {
    return `${this.greeting}, ${name}${this.suffix}`;
  }

  @tag('static')
  static create(): Greeter {
    return new Greeter('!');
  }
}

const greeter = Greeter.create();
console.log(greeter.greet('ts2hx'));
greeter.greeting = 'Hi';
console.log(greeter.greet('Haxe'));
