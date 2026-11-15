import * as circle from './circle';
import { Color, Geometry, type Point, type Shape } from './circle';
import type { Circle } from './square';
import {
  SquareBox,
  SquareColor,
  type SquarePoint,
  type SquareShape,
} from './shapes';
import * as square from './square';

const c: Shape = circle.make(2);
const s: SquareShape = square.make(3);
const p: Point = { x: 1, y: 2 };
const q: SquarePoint = { col: 3, row: 4 };
const inscribed: Circle = { inscribed: s.side / 2 };

function paint(color: Color, other: SquareColor): string {
  return `${color}/${other}`;
}

console.log(c.kind, c.radius, s.kind, s.side);
console.log(p.x + p.y, q.col * q.row, inscribed.inscribed);
console.log(paint(Color.Green, SquareColor.Blue), Color[Color.Red]);
console.log(circle.Color.Red, square.Color.Red);
console.log(new circle.Box('lid').label, new SquareBox(5).size);
console.log(
  new square.Box(6) instanceof SquareBox,
  new circle.Box('x') instanceof circle.Box,
);
console.log(Geometry.sides, square.Geometry.sides);
console.log(Geometry.describe(c), square.Geometry.describe(s));
