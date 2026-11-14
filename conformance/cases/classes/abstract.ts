abstract class Animal {
  abstract readonly sound: string;
  protected legs = 4;
  constructor(readonly name: string) {}
  abstract describe(): string;
  speak(): string {
    return `${this.name} says ${this.sound} on ${String(this.legs)} legs`;
  }
}

abstract class Bird extends Animal {
  readonly sound: string = 'tweet';
  protected override legs = 2;
  canFly(): boolean {
    return true;
  }
}

class Penguin extends Bird {
  override canFly(): boolean {
    return false;
  }
  describe(): string {
    return `${this.speak()}, flies: ${String(this.canFly())}`;
  }
}

class Dog extends Animal {
  readonly sound = 'woof';
  describe(): string {
    return this.speak();
  }
}

const animals: Animal[] = [new Penguin('pingu'), new Dog('rex')];
for (const animal of animals) {
  console.log(animal.describe());
  console.log(
    animal instanceof Bird,
    animal instanceof Penguin,
    animal instanceof Dog,
    animal instanceof Animal,
  );
}
function legsOf(animal: Animal): string {
  if (animal instanceof Bird) {
    return `bird that flies: ${String(animal.canFly())}`;
  }
  return 'not a bird';
}
console.log(legsOf(animals[0]), legsOf(animals[1]));
