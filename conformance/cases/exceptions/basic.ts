class ValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

function validate(age: number): number {
  if (age < 0) throw new ValidationError('age must be positive', 'age');
  if (age > 150) throw new RangeError('age out of range');
  return age;
}

for (const age of [30, -1, 200]) {
  try {
    console.log('valid', validate(age));
  } catch (e) {
    if (e instanceof ValidationError) {
      console.log(e.name, e.message, e.field);
    } else if (e instanceof Error) {
      console.log(e.name, e.message);
    }
  }
}

try {
  throw 'a string';
} catch (e) {
  console.log('caught', typeof e, e);
}

try {
  try {
    throw new Error('inner');
  } catch (e) {
    throw new Error(`wrapped ${(e as Error).message}`);
  }
} catch (e) {
  console.log((e as Error).message);
}
