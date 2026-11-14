import ts from 'typescript';

import {
  hoistedClassName,
  isHoistedClass,
  mayReadFieldsBeforeInit,
  privateMemberName,
  structuralAccessorMembers,
  structuralOptionalMembers,
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

  it('converts a string field to text null-safely when it may be read before it is set', async () => {
    const code = await moduleOf(`
      abstract class A { constructor() { this.peek(); } abstract peek(): void; }
      class B extends A { name: string = 'b'; peek(): void { console.log(\`t:\${this.name}\`, 'c:' + this.name); } }
      class C { name: string = 'c'; }
      console.log('c:' + new C().name);
      new B();
    `);
    expect(code).toContain('public var name:String;');
    expect(code).toContain('"t:" + ts2hx.Ts2hx.string(this.name)');
    expect(code).toContain('"c:" + ts2hx.Ts2hx.string(this.name)');
    expect(code).toContain('"c:" + new Main_2.C().name');
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

describe('classes II helpers', () => {
  it('suffixes a #private name redeclared below an ancestor with the same name', () => {
    const { checker, member } = classesOf(`
      class A { #x = 1; }
      class B extends A { #y = 2; }
      class C extends B { #x = 3; }
    `);
    const privateOf = (cls: string, name: string) =>
      privateMemberName(checker, member(cls, name) as ts.ClassElement);
    expect(privateOf('A', '#x')).toBe('__x');
    expect(privateOf('B', '#y')).toBe('__y');
    expect(privateOf('C', '#x')).toBe('__x_2');
  });

  it('collects optional structure members a class used as that structure lacks', () => {
    const { program, classes } = classesOf(`
      interface L { name: string; label?: string; rank?: number }
      interface D { describe(): string; note?: string }
      class P { name = 'p'; rank = 1; }
      class I implements D { describe() { return ''; } }
      class S extends I { note = 's'; }
      class Q extends P {}
      class Unused { name = 'u'; }
      const list: L[] = [new P()];
      function show(l: L | undefined) { return l; }
      show(new Q());
    `);
    const added = structuralOptionalMembers(program);
    const names = (cls: string) => [
      ...(added.get(classes.get(cls)!)?.keys() ?? []),
    ];
    expect(names('P')).toEqual(['label']);
    expect(names('I')).toEqual(['note']);
    expect(names('S')).toEqual([]);
    expect(names('Q')).toEqual([]);
    expect(names('Unused')).toEqual([]);
  });

  it('marks structure members a class implements with an accessor', () => {
    const { program } = classesOf(`
      interface H { readonly area: number; label?: string }
      class Sq implements H { get area() { return 1; } }
      class Plain { area = 2; }
      const h: H = new Plain();
    `);
    expect(
      [...structuralAccessorMembers(program)].map((symbol) => symbol.name),
    ).toEqual(['area']);
  });

  it('hoists class expressions and local classes, named after their binding', () => {
    const { program, file } = createProject({
      'main.ts': `
        class Top {}
        const Bound = class {};
        const Named = class Inner {};
        function f() { class Local {} return [Local, class {}]; }
      `,
    });
    program.getTypeChecker();
    const hoisted: string[] = [];
    const visit = (node: ts.Node): void => {
      if (isHoistedClass(node)) {
        hoisted.push(hoistedClassName(node));
      }
      ts.forEachChild(node, visit);
    };
    visit(program.getSourceFile(file('main.ts'))!);
    expect(hoisted).toEqual(['Bound', 'Inner', 'Local', 'Class']);
  });
});

describe('classes II in the frontend', () => {
  it('maps accessors to a property whose setter returns the assigned value', async () => {
    const code = await moduleOf(`
      class T {
        #c = 0;
        get c(): number { return this.#c; }
        set c(v: number) { if (v < 0) return; this.#c = v; }
        get only(): number { return 1; }
      }
      const t = new T();
      t.c = 2;
      console.log(t.c + t.only);
    `);
    expect(code).toContain('public var c(get, set):Float;');
    expect(code).toContain('public var only(get, never):Float;');
    expect(code).toContain(
      '\tpublic function set_c(__value_1:Float):Float {\n' +
        '\t\tvar v:Float = __value_1;\n' +
        '\t\tif (v < 0.0) {\n' +
        '\t\t\treturn __value_1;\n' +
        '\t\t}\n' +
        '\t\tthis.__c = v;\n' +
        '\t\treturn __value_1;\n' +
        '\t}',
    );
  });

  it('declares an overridden accessor once, overriding only implemented methods', async () => {
    const code = await moduleOf(`
      abstract class Shape {
        abstract get area(): number;
        get kind(): string { return 'shape'; }
      }
      class Sq extends Shape {
        get area() { return 4; }
        override get kind() { return 'sq'; }
      }
      console.log(new Sq().kind);
    `);
    expect(code.match(/var kind\(get, never\)/g)).toHaveLength(1);
    expect(code.match(/var area\(get, never\)/g)).toHaveLength(1);
    expect(code).toContain('public override function get_kind():String');
    expect(code).toContain('\tpublic function get_area():Float');
  });

  it('reads accessor-backed structure members through Reflect.getProperty', async () => {
    const code = await moduleOf(`
      interface H { readonly area: number; label?: string }
      class Sq implements H { get area() { return 1; } }
      const h: H = new Sq();
      console.log(h.area, h.label);
    `);
    expect(code).toContain('Reflect.getProperty(h, "area")');
    expect(code).toContain('h.label');
    expect(code).toContain('public var label:');
  });

  it('hoists a local class and passes its captured locals to the constructor', async () => {
    const code = await moduleOf(`
      function make(step: number) {
        class Counter { n = 0; inc() { this.n += step; return this.n; } }
        return new Counter();
      }
      console.log(make(2).inc());
    `);
    expect(code).toContain('return new Main_2.Counter(step);');
    expect(code).toContain(
      '\tpublic function new(__step_1:Float) {\n' +
        '\t\tthis.__Counter_step = __step_1;\n',
    );
    expect(code).toContain('this.n += this.__Counter_step;');
  });

  it('reports a class capturing a reassigned local as unsupported', async () => {
    const { diagnostics } = await compileSources({
      'main.ts': `
        function bad(step: number) {
          let s = step; s++;
          class R { v() { return s; } }
          return new R();
        }
        console.log(bad(1).v());
      `,
    });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'TODO(ts2hx): a class capturing a reassigned local is not supported',
      'TODO(ts2hx): constructing a class that is not supported',
    ]);
  });

  it('binds this in object-literal methods to a self local', async () => {
    const code = await moduleOf(`
      const o = { n: 1, get() { return this.n; } };
      console.log(o.get());
    `);
    expect(code).toContain('__self_1 = {n: 1.0, get: function():Float {');
    expect(code).toContain('return __self_1.n;');
  });
});
