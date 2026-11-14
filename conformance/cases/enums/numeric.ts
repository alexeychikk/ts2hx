enum Direction {
  Up,
  Down,
  Left = 10,
  Right,
}

enum Color {
  Red = 'RED',
  Green = 'GREEN',
}

console.log(Direction.Up, Direction.Down, Direction.Left, Direction.Right);
console.log(Direction[0], Direction[11], Direction[Direction.Down]);
console.log(Color.Red, Color.Green);

function move(d: Direction): string {
  switch (d) {
    case Direction.Up:
      return 'north';
    case Direction.Down:
      return 'south';
    default:
      return 'sideways';
  }
}
console.log(move(Direction.Up), move(Direction.Right));
console.log(Object.keys(Color), Object.values(Color));
