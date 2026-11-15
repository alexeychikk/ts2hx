export interface Shape {
  kind: 'circle';
  radius: number;
}

export type Point = { x: number; y: number };

export enum Color {
  Red,
  Green,
}

export class Box {
  constructor(readonly label: string) {}
}

export namespace Geometry {
  export const sides = 0;
  export function describe(shape: Shape): string {
    return `circle r=${shape.radius}`;
  }
}

export function make(radius: number): Shape {
  return { kind: 'circle', radius };
}
