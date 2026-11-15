export class UnboundError extends Error {
  constructor(readonly variable: string) {
    super(`undefined variable '${variable}'`);
    this.name = 'UnboundError';
  }
}

export class Scope<T> {
  private readonly vars = new Map<string, T>();
  readonly depth: number;

  constructor(private readonly parent: Scope<T> | null = null) {
    this.depth = parent === null ? 0 : parent.depth + 1;
  }

  child(): Scope<T> {
    return new Scope<T>(this);
  }

  define(name: string, value: T): void {
    this.vars.set(name, value);
  }

  has(name: string): boolean {
    return this.find(name) !== null;
  }

  lookup(name: string): T {
    const owner = this.find(name);
    if (owner === null) throw new UnboundError(name);
    return owner.vars.get(name) as T;
  }

  assign(name: string, value: T): void {
    const owner = this.find(name);
    if (owner === null) throw new UnboundError(name);
    owner.vars.set(name, value);
  }

  names(): string[] {
    return [...this.vars.keys()];
  }

  private find(name: string): Scope<T> | null {
    let scope: Scope<T> | null = this;
    while (scope !== null) {
      if (scope.vars.has(name)) return scope;
      scope = scope.parent;
    }
    return null;
  }
}
