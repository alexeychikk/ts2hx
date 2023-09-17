import { Ts2hx } from '@tests/framework';

test('adds package statement to sources in subfolders', async () => {
  await expect(new Ts2hx('', './my/Path.to/sub-Folder/main.dto.ts').run())
    .resolves.toMatchInlineSnapshot(`
    "package my.path_to.sub_Folder;

    "
  `);
});

test('does not add package statement to root files', async () => {
  await expect(new Ts2hx('', './Main.ts').run()).resolves.toMatchInlineSnapshot(
    `""`,
  );
});
