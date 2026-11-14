abstract class Shape {
  constructor(readonly name: string) {}
  abstract area(): number;
  describe(): string {
    return `${this.name} with area ${this.area().toFixed(2)}`;
  }
}

class Circle extends Shape {
  constructor(private radius: number) {
    super('circle');
  }
  area(): number {
    return Math.PI * this.radius ** 2;
  }
}

class Square extends Shape {
  constructor(protected side: number) {
    super('square');
  }
  area(): number {
    return this.side * this.side;
  }
  override describe(): string {
    return `[${super.describe()}]`;
  }
}

class Cube extends Square {
  volume(): number {
    return this.area() * this.side;
  }
}

const shapes: Shape[] = [new Circle(1), new Square(2), new Cube(3)];
for (const s of shapes) {
  console.log(s.describe());
}
const cube = new Cube(2);
console.log(
  cube.volume(),
  cube instanceof Square,
  cube instanceof Shape,
  shapes[0] instanceof Square,
);
