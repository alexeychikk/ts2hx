import ts from 'typescript';

import {
  mayReadFieldsBeforeInit,
  redeclaredWrittenFields,
  overridesImplementation,
  rootField,
  superCallStatement,
} from '@src/compiler/frontend/classes';

import { compileSources, createProject } from './helpers';

function classesOf(source: string) {
  const { program, file } = createProject({ 'main.ts': source });
  const sourceFile = program.getSourceFile(file('main.ts'))!;
  const classes = new Map(
    sourceFile.statements
      .filter(ts.isClassDeclaration)
      .map((c) => [c.name!.text, c]),
  );
  const member = (cls: string, name: string) => {
    const declaration = classes.get(cls)!;
    const ctor = declaration.members.find(ts.isConstructorDeclaration);
    return [...declaration.members, ...(ctor?.parameters ?? [])].find(
      (m) => (m.name as ts.Identifier | undefined)?.text === name,
    )!;
  };
  return { program, checker: program.getTypeChecker(), classes, member };
}

async function moduleOf(source: string): Promise<string> {
  const { code, diagnostics } = await compileSources({ 'main.ts': source });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

describe('class helpers', () => {
  it('requires override only over an implemented, non-abstract method', () => {
    const { checker, member } = classesOf(`
      abstract class A { abstract f(): void; g(): void {} }
      class B extends A { f(): void {} g(): void {} }
      class C extends B { f(): void {} }
    `);
    const method = (cls: string, name: string) =>
      member(cls, name) as ts.MethodDeclaration;
    expect(overridesImplementation(checker, method('B', 'f'))).toBe(false);
    expect(overridesImplementation(checker, method('B', 'g'))).toBe(true);
    expect(overridesImplementation(checker, method('C', 'f'))).toBe(true);
  });

  it('finds the root of redeclared fields, including parameter properties', () => {
    const { checker, member } = classesOf(`
      class A { constructor(readonly x: number) {} }
      class B extends A { declare readonly x: number; }
      class C extends B { x = 1; y = 2; }
    `);
    const field = (cls: string, name: string) =>
      member(cls, name) as ts.PropertyDeclaration;
    expect(rootField(checker, field('C', 'x'))).toBe(member('A', 'x'));
    expect(rootField(checker, field('C', 'y'))).toBe(member('C', 'y'));
  });

  it('collects roots redeclared by a subclass that writes them', () => {
    const { program, member } = classesOf(`
      class A { readonly x = 1; readonly y = 2; readonly z = 3; readonly w = 4; readonly v = 5; }
      class B extends A {
        x = 3; readonly y = 4; declare readonly v: number;
        constructor(readonly w: number) { super(); if (w) { this.z += 1; } }
      }
      class C { constructor(readonly name: string) {} }
      class D extends C { constructor(readonly name: string) { super(name); } }
    `);
    const written = redeclaredWrittenFields(program);
    expect(written.has(member('A', 'x'))).toBe(true);
    expect(written.has(member('A', 'y'))).toBe(true);
    expect(written.has(member('A', 'w'))).toBe(true);
    expect(written.has(member('A', 'v'))).toBe(false);
    expect(written.has(member('C', 'name'))).toBe(true);
  });

  it('detects superclass code that may read fields before they are set', () => {
    const { checker, classes } = classesOf(`
      class A { constructor() { this.init(); } init(): void {} }
      class B extends A {}
      class C { n = 1; constructor() { this.n = 2; } }
      class D extends C {}
      class E { self = this; }
      class F extends E {}
    `);
    const reads = (cls: string) =>
      mayReadFieldsBeforeInit(checker, classes.get(cls)!);
    expect(reads('B')).toBe(true);
    expect(reads('D')).toBe(false);
    expect(reads('F')).toBe(true);
    expect(reads('A')).toBe(false);
  });

  it('finds the top-level super() call', () => {
    const { classes } = classesOf(`
      class A {}
      class B extends A { constructor() { console.log(1); super(); } }
    `);
    const ctor = classes.get('B')!.members.find(ts.isConstructorDeclaration)!;
    expect(superCallStatement(ctor)?.getText()).toBe('super();');
  });
});

describe('classes in the frontend', () => {
  it('moves field initialisers after super() and parameter properties first', async () => {
    const code = await moduleOf(`
      class A { constructor(public a: number) {} }
      class B extends A {
        b = 2;
        constructor(readonly c: string) {
          console.log('before');
          super(1);
          console.log('after');
        }
      }
      console.log(new B('c').b);
    `);
    expect(code).toContain(
      '\tpublic function new(c:String) {\n' +
        '\t\tts2hx.Console.log("before");\n' +
        '\t\tsuper(1.0);\n' +
        '\t\tthis.c = c;\n' +
        '\t\tthis.b = 2.0;\n' +
        '\t\tts2hx.Console.log("after");\n' +
        '\t}',
    );
    expect(code).toContain('public final c:String;');
    expect(code).toContain('public var b:Float;');
  });

  it('generates a forwarding constructor only when a subclass has initialisers', async () => {
    const code = await moduleOf(`
      class A { constructor(public a: number, ...rest: string[]) {} }
      class B extends A { b = 2; }
      class C extends A {}
      console.log(new B(1, 'x').b, new C(2).a);
    `);
    expect(code).toMatch(
      /class B extends Main_2\.A \{\n\tpublic function new\(a:Float, \.\.\.rest:String\) \{\n\t\tsuper\(a, \.\.\.rest\);\n\t\tthis\.b = 2\.0;/,
    );
    expect(code).toMatch(/class C extends Main_2\.A \{\}/);
  });

  it('marks overrides, abstract members and declares redeclared fields once', async () => {
    const code = await moduleOf(`
      abstract class A { readonly x: number = 1; abstract f(): number; g(): number { return 1; } }
      class B extends A { x = 2; f(): number { return this.x; } override g(): number { return super.g(); } }
      console.log(new B().f());
    `);
    expect(code).toContain('abstract class A {');
    expect(code).toContain('public abstract function f():Float;');
    expect(code).toContain('public var x:Float;');
    expect(code).toContain('\tpublic function f():Float {');
    expect(code).toContain('public override function g():Float {');
    expect(code.match(/var x:/g)).toHaveLength(1);
  });

  it('rewrites inherited statics to the declaring class and this in static methods', async () => {
    const code = await moduleOf(`
      class A { static n = 0; static m = [A.n]; static readonly label = 'a'; static make(): A { this.n++; return new A(); } }
      class B extends A {}
      B.make();
      console.log(B.n, B.label);
    `);
    expect(code).toContain('public static var n:Float = 0.0;');
    expect(code).toContain('public static final label:String = "a";');
    expect(code).toContain('Main_2.A.n++;');
    expect(code).toContain('Main_2.A.make();');
    expect(code).toContain('public static var m:Array<Float>;');
    expect(code).toContain('Main_2.A.m = [Main_2.A.n];');
    expect(code).toContain(
      'ts2hx.Console.inspectNumber(Main_2.A.n), Main_2.A.label',
    );
  });

  it('types fields nullable when a superclass may read them before they are set', async () => {
    const code = await moduleOf(`
      class A { constructor() { this.init(); } init(): void {} }
      class B extends A { n = 1; override init(): void { console.log(String(this.n)); } }
      new B();
    `);
    expect(code).toContain('public var n:Null<Float>;');
    expect(code).toContain('ts2hx.Ts2hx.string(this.n)');
  });

  it('keeps a readonly root mutable when a readonly redeclaration assigns it', async () => {
    const code = await moduleOf(`
      class A { readonly kind: string = 'a'; }
      class B extends A { readonly kind: string = 'b'; }
      console.log(new B().kind);
    `);
    expect(code).toContain('public var kind:String;');
    expect(code).not.toContain('final kind');
  });

  it('reports extending a non-project class as unsupported', async () => {
    const { code, diagnostics } = await compileSources({
      'main.ts': 'class Stack extends Array<number> {}',
    });
    expect(code['Main_2.hx']).not.toContain('extends Array');
    expect(diagnostics.map((d) => d.message)).toEqual([
      'TODO(ts2hx): extending Array is not supported yet',
    ]);
  });

  it('maps instanceof on project classes to Std.isOfType', async () => {
    const code = await moduleOf(`
      class A {}
      const a: unknown = new A();
      console.log(a instanceof A);
    `);
    expect(code).toContain('Std.isOfType(a, Main_2.A)');
  });
});
