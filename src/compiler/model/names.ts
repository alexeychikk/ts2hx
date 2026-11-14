/** Haxe keywords and contextual words that cannot be used as identifiers or package names. */
export const HAXE_KEYWORDS: ReadonlySet<string> = new Set([
  'abstract',
  'break',
  'case',
  'cast',
  'catch',
  'class',
  'continue',
  'default',
  'do',
  'dynamic',
  'else',
  'enum',
  'extends',
  'extern',
  'false',
  'final',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'inline',
  'interface',
  'macro',
  'new',
  'null',
  'operator',
  'overload',
  'override',
  'package',
  'private',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typedef',
  'untyped',
  'using',
  'var',
  'while',
]);

/**
 * Top-level types of the Haxe standard library. A generated module of the same name
 * would shadow them for every module of its package (`Math.NaN` would resolve to it).
 */
export const HAXE_STD_TYPES: ReadonlySet<string> = new Set([
  'Any',
  'Array',
  'Bool',
  'Class',
  'Date',
  'DateTools',
  'Dynamic',
  'EReg',
  'Enum',
  'EnumValue',
  'Float',
  'Int',
  'IntIterator',
  'Iterable',
  'Iterator',
  'KeyValueIterable',
  'KeyValueIterator',
  'Lambda',
  'List',
  'Map',
  'Math',
  'Null',
  'Reflect',
  'Std',
  'StdTypes',
  'String',
  'StringBuf',
  'StringTools',
  'Sys',
  'Type',
  'UInt',
  'UnicodeString',
  'Void',
  'Xml',
]);

/** Root packages owned by Haxe or the runtime; a project directory of that name is renamed. */
export const RESERVED_ROOT_PACKAGES: ReadonlySet<string> = new Set([
  'cpp',
  'cs',
  'haxe',
  'hl',
  'java',
  'js',
  'lua',
  'neko',
  'php',
  'python',
  'sys',
  'ts2hx',
]);

export const ROOT_PACKAGE_RULE =
  'expected lower-case dotted Haxe package segments, none a Haxe keyword, not rooted at a Haxe or runtime package';

const PACKAGE_SEGMENT = /^[a-z][A-Za-z0-9_]*$/;

/**
 * Whether `rootPackage` is a dotted Haxe package the emitted modules can live in:
 * lower-case identifier segments, no Haxe keyword, and no root owned by Haxe or the runtime.
 */
export function isValidRootPackage(rootPackage: string): boolean {
  const segments = rootPackage.split('.');
  return (
    !RESERVED_ROOT_PACKAGES.has(segments[0]) &&
    segments.every(
      (segment) => PACKAGE_SEGMENT.test(segment) && !HAXE_KEYWORDS.has(segment),
    )
  );
}

function identifierChars(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_');
}

/** A valid Haxe local/field identifier for a TS name. */
export function escapeIdentifier(name: string): string {
  let id = identifierChars(name);
  if (/^[0-9]/.test(id) || id === '') {
    id = `_${id}`;
  }
  return HAXE_KEYWORDS.has(id) ? `${id}_` : id;
}

/** A Haxe package segment for a directory name: lower-case, starting with a letter. */
export function packageSegment(name: string): string {
  let segment = identifierChars(name).toLowerCase();
  if (!/^[a-z]/.test(segment)) {
    segment = `p${segment}`;
  }
  return HAXE_KEYWORDS.has(segment) ? `${segment}_` : segment;
}

/** A Haxe module name for a file base name (`my-file` → `My_file`). */
export function moduleName(baseName: string): string {
  let name = identifierChars(baseName);
  if (!/^[A-Za-z]/.test(name)) {
    name = `M${name}`;
  }
  name = name[0].toUpperCase() + name.slice(1);
  return HAXE_STD_TYPES.has(name) ? `${name}_` : name;
}
