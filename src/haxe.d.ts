declare module 'haxe' {
  import { type ChildProcess } from 'child_process';
  export function haxelib(...args: string[]): ChildProcess;
}
