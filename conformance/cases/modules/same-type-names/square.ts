export interface Shape {
  kind: 'square';
  side: number;
}

export type Point = { col: number; row: number };

export enum Color {
  Red = 'red',
  Blue = 'blue',
}

export class Box {
  constructor(readonly size: number) {}
}

export namespace Geometry {
  export const sides = 4;
  export function describe(shape: Shape): string {
    return `square s=${shape.side}`;
  }
}

export interface Circle {
  inscribed: number;
}

export function make(side: number): Shape {
  return { kind: 'square', side };
}
