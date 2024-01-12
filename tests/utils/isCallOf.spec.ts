import { Ts2hx } from '@tests/framework';

test('checks if certain node is a call expression of certain property chain', () => {
  const utils = new Ts2hx(
    `
var foo = { bar: { baz: () => false } };
foo.bar.baz();
var baz = foo.bar.baz;
baz();
`,
  ).getUtils();

  expect(
    utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `foo.bar.baz`),
  ).toEqual(true);
  expect(
    utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `foo.bar.*`),
  ).toEqual(true);
  expect(
    utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `foo.*.baz`),
  ).toEqual(true);
  expect(
    utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `*.bar.baz`),
  ).toEqual(true);
  expect(
    utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `*.*.*`),
  ).toEqual(true);

  expect(utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `foo`)).toEqual(
    false,
  );
  expect(
    utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `foo.bar`),
  ).toEqual(false);
  expect(
    utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `foo.bar.bax`),
  ).toEqual(false);
  expect(
    utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `foo.bar.baz.tax`),
  ).toEqual(false);
  expect(
    utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `foo.bar.baz.*`),
  ).toEqual(false);
  expect(
    utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `foo.*.bax`),
  ).toEqual(false);
  expect(
    utils.isCallOf(utils.getNodeByText(`foo.bar.baz()`)!, `*.foo.*`),
  ).toEqual(false);
});
