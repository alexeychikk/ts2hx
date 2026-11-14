class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function request(path: string): string {
  if (path === '/missing') throw new HttpError('missing page', 404);
  return `content of ${path}`;
}

for (const path of ['/home', '/missing']) {
  try {
    console.log(request(path));
  } catch ({ name, message, status }: any) {
    console.log(name, message, status);
  }
}

try {
  throw { code: 3, details: { reason: 'quota' } };
} catch ({ code, details: { reason }, missing = 'default' }: any) {
  console.log(code, reason, missing);
}

try {
  throw ['first', 'second', 'third'];
} catch ([head, ...rest]: any) {
  console.log(head, rest.length);
}
