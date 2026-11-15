import ts from 'typescript';

import {
  hoistedClassName,
  inheritedStaticDivergence,
  isHoistedClass,
  isWriteTarget,
  mayReadFieldsBeforeInit,
  privateMemberName,
  structuralAccessorMembers,
  structuralMemberConflicts,
  structuralOptionalMembers,
  redeclaredWrittenFields,
  overridesImplementation,
  rootField,
  staticThisClass,
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
      class B extends A { static show(): string { return this.label; } }
      A.make();
      console.log(B.n, B.label, B.show());
    `);
    expect(code).toContain('public static var n:Float = 0.0;');
    expect(code).toContain('public static final label:String = "a";');
    expect(code).toContain('Main_2.A.n++;');
    expect(code).toContain('Main_2.A.make();');
    expect(code).toContain('public static var m:Array<Float>;');
    expect(code).toContain('Main_2.A.m = [Main_2.A.n];');
    expect(code).toContain(
      'ts2hx.Console.inspectNumber(Main_2.A.n), Main_2.A.label, Main_2.B.show()',
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
    expect(code).toContain(
      '"c:" + ts2hx.Ts2hx.stringOperand(new Main_2.C().name)',
    );
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
      privateMemberName(
        checker,
        member(cls, name) as ts.PropertyDeclaration & {
          name: ts.PrivateIdentifier;
        },
      );
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

  it('leaves off an optional member a subclass declares as a method or accessor', () => {
    const { program, classes } = classesOf(`
      interface I { greet?(): string; label?: string; size?: number }
      class A implements I {}
      class B extends A { greet() { return 'b'; } get size() { return 1; } }
      class C extends A { label = 'c'; }
    `);
    const a = classes.get('A')!;
    expect([
      ...(structuralOptionalMembers(program).get(a)?.keys() ?? []),
    ]).toEqual(['label']);
    expect([...(structuralMemberConflicts(program).get(a) ?? [])]).toEqual([
      'greet',
      'size',
    ]);
  });

  it('collects optional structure members of class expressions from their instance type', () => {
    const { program, file } = createProject({
      'main.ts': `
        interface S { area(): number; name?: string; length?: number }
        const E = class implements S { area() { return 1; } };
        const U = class { area() { return 2; } get name() { return 'u'; } };
        const s: S = new U();
      `,
    });
    const expressions: ts.ClassExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isClassExpression(node)) {
        expressions.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(program.getSourceFile(file('main.ts'))!);
    const added = structuralOptionalMembers(program);
    const names = (node: ts.ClassExpression) => [
      ...(added.get(node)?.keys() ?? []),
    ];
    expect(names(expressions[0])).toEqual(['name', 'length']);
    expect(names(expressions[1])).toEqual(['length']);
    expect(
      [...structuralAccessorMembers(program)].map((symbol) => symbol.name),
    ).toEqual(['name']);
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

  it('does not capture the property of a parameter property read through a local', async () => {
    const code = await moduleOf(`
      class Base { constructor(public label: string) {} }
      function f(b: Base) { class X { g() { return b.label; } } return new X(); }
      console.log(f(new Base('l')).g());
    `);
    expect(code).toContain('return new Main_2.X(b);');
    expect(code).toContain('return this.__X_b.label;');
  });

  it('forwards the captures of a hoisted base class to super', async () => {
    const code = await moduleOf(`
      function f(k: number, m: string) {
        class A { v() { return k; } }
        class B extends A {}
        class C extends A { constructor() { super(); } w() { return m; } }
        return [new B().v(), new C().w()];
      }
      console.log(f(1, 'm'));
    `);
    expect(code).toContain('new Main_2.B(k)');
    expect(code).toContain('new Main_2.C(k, m)');
    expect(code).toContain(
      '\tpublic function new(__k_2:Float) {\n\t\tsuper(__k_2);\n\t}',
    );
    expect(code).toContain(
      '\tpublic function new(__k_3:Float, __m_4:String) {\n' +
        '\t\tsuper(__k_3);\n' +
        '\t\tthis.__C_m = __m_4;\n',
    );
  });

  it('reads captures from the capture parameters inside the constructor', async () => {
    const code = await moduleOf(`
      class Failure { constructor(public message: string) {} }
      function f(prefix: string) {
        class Tagged extends Failure {
          constructor(detail: string = prefix) { super(prefix + detail); }
        }
        return new Tagged();
      }
      console.log(f('p').message);
    `);
    expect(code).toContain('detail = __prefix_1;');
    expect(code).toContain(
      'super(ts2hx.Ts2hx.stringOperand(__prefix_1) + ts2hx.Ts2hx.stringOperand(detail));',
    );
  });

  it('reports an optional structure member clashing with a subclass method', async () => {
    const { diagnostics } = await compileSources({
      'main.ts': `
        interface I { greet?(): string }
        class A implements I {}
        class B extends A { greet() { return 'b'; } }
        const i: I = new B();
        console.log(i.greet!());
      `,
    });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'TODO(ts2hx): optional member greet is not added, as a subclass declares it as a method or accessor: reading it on this class fails on C#',
    ]);
  });

  it('reports an anonymous class extending a constructor parameter as unsupported', async () => {
    for (const base of ['T', 'typeof Plain']) {
      const { code, diagnostics } = await compileSources({
        'main.ts': `
          class Plain { hi() { return 'hi'; } }
          function mixin<T extends new (...args: any[]) => object>(B: ${base}) {
            return class extends B { extra(): string { return 'extra'; } };
          }
          console.log(typeof mixin);
        `,
      });
      expect(diagnostics.map((d) => d.message)).toEqual([
        'TODO(ts2hx): extending B is not supported yet',
      ]);
      expect(code['Main_2.hx']).not.toMatch(/Main_2\.Class\b/);
    }
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

describe('classes follow-up', () => {
  function accessesOf(source: string) {
    const { program, checker } = classesOf(source);
    const sourceFile = program.getSourceFile(
      program.getRootFileNames().find((f) => f.endsWith('main.ts'))!,
    )!;
    const accesses: ts.PropertyAccessExpression[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isPropertyAccessExpression(n)) accesses.push(n);
      ts.forEachChild(n, visit);
    };
    visit(sourceFile);
    const access = (text: string, nth = 0) =>
      accesses.filter((a) => a.getText() === text)[nth];
    const classType = (name: string) =>
      checker.getTypeOfSymbol(
        checker.getSymbolAtLocation(
          sourceFile.statements
            .filter(ts.isClassDeclaration)
            .find((c) => c.name!.text === name)!.name!,
        )!,
      );
    return { checker, access, classType };
  }

  it('finds write targets', () => {
    const { access } = accessesOf(`
      class A { static n = 0; }
      A.n = 1; A.n++; --A.n; (A.n) += 2; A.n ??= 3; console.log(A.n === 1);
    `);
    expect(
      [0, 1, 2, 3, 4, 5].map((i) => isWriteTarget(access('A.n', i))),
    ).toEqual([true, true, true, true, true, false]);
  });

  it('finds the class this denotes in static code only', () => {
    const { access } = accessesOf(`
      class A {
        static n = 0;
        static m = this.n;
        static f() { return this.n; }
        static { this.n = 1; }
        g() { return this.n; }
      }
    `);
    const classOf = (i: number) =>
      staticThisClass(access('this.n', i).expression);
    expect([0, 1, 2].map((i) => classOf(i)?.name?.text)).toEqual([
      'A',
      'A',
      'A',
    ]);
    expect(classOf(3)).toBeUndefined();
  });

  it('flags static accesses through a subclass that diverge from JS', () => {
    const { checker, access, classType } = accessesOf(`
      class A {
        static n = 0;
        static label = 'a';
        static inc() { ++this.n; }
        static read() { return this.n + this.label; }
        static viaCall() { this.inc(); }
        static make() { return new this(); }
        static named() { return A.n; }
      }
      class B extends A { static override label = 'b'; }
      class C extends A {}
      B.n = 1;
      C.inc(); C.read(); B.read(); C.viaCall(); C.make(); C.named(); console.log(C.n);
    `);
    const divergence = (text: string, cls: string) =>
      inheritedStaticDivergence(checker, access(text), classType(cls));
    expect(divergence('B.n', 'B')).toMatch(/^writing an inherited static/);
    expect(divergence('C.inc', 'C')).toMatch(/^calling an inherited static/);
    expect(divergence('C.read', 'C')).toBeUndefined();
    expect(divergence('B.read', 'B')).toMatch(/^calling an inherited static/);
    expect(divergence('C.viaCall', 'C')).toMatch(
      /^calling an inherited static/,
    );
    expect(divergence('C.make', 'C')).toMatch(/^calling an inherited static/);
    expect(divergence('C.named', 'C')).toBeUndefined();
    expect(divergence('C.n', 'C')).toBeUndefined();
  });

  it('reports inherited static writes and this-dependent calls through a subclass', async () => {
    const { code, diagnostics } = await compileSources({
      'main.ts': `
        class A { static n = 0; static inc() { ++this.n; } static get() { return this.n; } }
        class B extends A {
          static bump() { this.n = 5; }
        }
        A.inc(); B.inc(); B.n = 2; B.bump();
        console.log(B.get(), B.n);
      `,
    });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'TODO(ts2hx): writing an inherited static through a subclass is not supported: in JS it creates a separate static of the subclass',
      'TODO(ts2hx): calling an inherited static method through a subclass is not supported when the method writes a static through `this`, reads one the subclass redeclares or uses `this` as a value',
      'TODO(ts2hx): writing an inherited static through a subclass is not supported: in JS it creates a separate static of the subclass',
    ]);
    expect(code['Main_2.hx']).toContain('Main_2.A.inc();');
    expect(code['Main_2.hx']).toContain('Main_2.A.get()');
  });

  it('converts String operands of + and templates null-safely', async () => {
    const code = await moduleOf(`
      function show(s: string, n: number): string {
        const parts = [s];
        return '[' + s + ']' + \`<\${parts[0]}>\` + 'lit' + n + s.toUpperCase();
      }
      console.log(show('a', 1));
    `);
    expect(code).toContain(
      'return "[" + ts2hx.Ts2hx.stringOperand(s) + "]" + ("<" + ts2hx.Ts2hx.stringOperand(parts[0]) + ">") + "lit" + ts2hx.Num.toString(n)',
    );
  });

  it('types typeof of a class value as function', async () => {
    const code = await moduleOf(`
      class P {}
      const K: typeof P = P;
      const ctor: new () => P = P;
      console.log(typeof P, typeof K, typeof ctor);
    `);
    expect(code).toContain(
      'ts2hx.Console.log("function", "function", "function");',
    );
  });

  it('constructs class values', async () => {
    const code = await moduleOf(`
      class P { constructor(public a: string, public b = 1) {} }
      function factory() { return class { hi() { return 'hi'; } }; }
      const Made = factory();
      const K: typeof P = P;
      console.log(new Made().hi(), new K('x').b, new (class { v = 1 })().v);
    `);
    expect(code).toContain(
      '(cast Type.createInstance(Made, []) : Main_2.Class_)',
    );
    expect(code).toContain(
      '(cast Type.createInstance(K, ["x", null]) : Main_2.P)',
    );
    expect(code).toContain('new Main_2.Class__2().v');
  });

  it('reports new on a class value whose class captures locals', async () => {
    const { diagnostics } = await compileSources({
      'main.ts': `
        function factory(p: string) { return class { hi() { return p; } }; }
        const Made = factory('x');
        console.log(new Made().hi());
      `,
    });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'TODO(ts2hx): `new` on a class value whose class captures locals is not supported',
    ]);
  });
});
