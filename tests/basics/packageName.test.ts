import { Ts2hx } from '@tests/framework';

test('adds package statement to sources in subfolders', () => {
  expect(new Ts2hx('', './my/Path.to/sub-Folder/main.dto.ts').run())
    .toMatchInlineSnapshot(`
    "package my.path_to.sub_Folder;

    "
  `);
});

test('does not add package statement to root files', () => {
  expect(new Ts2hx('', './Main.ts').run()).toMatchInlineSnapshot(`""`);
});
