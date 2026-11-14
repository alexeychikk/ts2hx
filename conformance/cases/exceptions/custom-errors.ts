class AppError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
    this.name = 'AppError';
  }

  describe(): string {
    return `${this.name}#${this.code}: ${this.message}`;
  }
}

class NotFoundError extends AppError {
  constructor(readonly resource: string) {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

class Unnamed extends Error {}

function fail(kind: number): void {
  if (kind === 0) throw new NotFoundError('user');
  if (kind === 1) throw new AppError('bad request', 400);
  if (kind === 2) throw new TypeError('not a function');
  if (kind === 3) throw new RangeError('too big');
  if (kind === 4) throw new SyntaxError('unexpected token');
  if (kind === 5) throw new Unnamed('no name');
  throw new Error('generic');
}

for (let kind = 0; kind < 7; kind++) {
  try {
    fail(kind);
  } catch (e) {
    if (e instanceof NotFoundError) {
      console.log('not found', e.resource, e.code);
    }
    if (e instanceof AppError) {
      console.log(e.describe());
    }
    if (e instanceof TypeError) {
      console.log('type error', e.message);
    }
    if (e instanceof RangeError) {
      console.log('range error', e.message);
    }
    const error = e as Error;
    console.log(
      error instanceof Error,
      error instanceof TypeError,
      error.name,
      error.message,
      String(error),
    );
  }
}

const plain = new Error();
console.log(`[${plain.message}]`, plain.name, `${plain}`);
const mutable = new RangeError('before');
mutable.message = 'after';
mutable.name = 'Custom';
console.log(mutable.toString(), mutable instanceof RangeError);
console.log(typeof new Error('x').stack);

const errors: Error[] = [new TypeError('a'), new AppError('b', 1), Error('c')];
console.log(errors.map((error) => `${error.name}:${error.message}`).join(' '));
