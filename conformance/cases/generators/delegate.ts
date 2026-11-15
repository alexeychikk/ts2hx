function* letters(): Generator<string, number> {
  yield 'a';
  yield 'b';
  return 2;
}

function* everything(): Generator<string | number, void, unknown> {
  const count = yield* letters();
  yield count;
  yield* [10, 20];
  yield* 'hi';
  yield* new Set(['s1', 's2']);
}
console.log([...everything()]);

function* tree(depth: number, label: string): Generator<string> {
  yield label;
  if (depth > 0) {
    yield* tree(depth - 1, label + 'L');
    yield* tree(depth - 1, label + 'R');
  }
}
console.log([...tree(2, 'n')].join(' '));

function* guarded(): Generator<number> {
  try {
    yield 1;
    yield 2;
  } catch (e) {
    console.log('inner caught', (e as Error).message);
    yield 99;
  } finally {
    console.log('inner finally');
  }
}
function* wrapper(): Generator<number> {
  yield 0;
  yield* guarded();
  yield 3;
}
const thrown = wrapper();
console.log(thrown.next(), thrown.next());
console.log(thrown.throw(new Error('boom')));
console.log(thrown.next(), thrown.next());

const returned = wrapper();
console.log(returned.next(), returned.next());
console.log(returned.return(7));
console.log(returned.next());

function* pairs(): Generator<[string, number]> {
  yield* new Map([
    ['x', 1],
    ['y', 2],
  ]);
}
for (const [key, value] of pairs()) {
  console.log(key, value);
}

function* withSent(): Generator<string, void, string> {
  const answer = yield* echo();
  console.log('echo returned', answer);
}
function* echo(): Generator<string, string, string> {
  const first = yield 'first?';
  const second = yield 'second?';
  return first + '+' + second;
}
const talk = withSent();
console.log(talk.next('ignored').value);
console.log(talk.next('one').value);
console.log(talk.next('two').done);
