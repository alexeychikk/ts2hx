import {
  escapeIdentifier,
  isValidRootPackage,
  moduleName,
  packageSegment,
} from '@src/compiler/model/names';

describe('Haxe names', () => {
  it.each([
    ['my-file', 'My_file'],
    ['hello', 'Hello'],
    ['2d', 'M2d'],
    ['_private', 'M_private'],
    ['math', 'Math_'],
    ['string', 'String_'],
  ])('module name of %s is %s', (base, expected) => {
    expect(moduleName(base)).toBe(expected);
  });

  it.each([
    ['Utils', 'utils'],
    ['my-dir', 'my_dir'],
    ['1st', 'p1st'],
    ['class', 'class_'],
  ])('package segment of %s is %s', (dir, expected) => {
    expect(packageSegment(dir)).toBe(expected);
  });

  it.each([
    ['value', 'value'],
    ['cast', 'cast_'],
    ['dynamic', 'dynamic_'],
    ['$el', '_el'],
    ['9lives', '_9lives'],
  ])('identifier %s becomes %s', (name, expected) => {
    expect(escapeIdentifier(name)).toBe(expected);
  });

  it.each(['app', 'cases.basics.hello', 'my_app.v2', 'app.ts2hx', 'app.js'])(
    'root package %s is valid',
    (rootPackage) => {
      expect(isValidRootPackage(rootPackage)).toBe(true);
    },
  );

  it.each([
    'app.class',
    'function',
    'app.dynamic.x',
    'ts2hx',
    'ts2hx.app',
    'haxe.x',
    'js',
    'App',
    'app..x',
    'app.',
    '1app',
    'my-app',
  ])('root package %s is rejected', (rootPackage) => {
    expect(isValidRootPackage(rootPackage)).toBe(false);
  });
});
