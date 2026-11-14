import * as fs from 'node:fs';
import * as path from 'node:path';

import { ALL_TARGETS, type ConformanceCase, type Target } from './types';

const HAXE_KEYWORDS = new Set(
  (
    'abstract break case cast catch class continue default do dynamic else enum ' +
    'extends extern false final for function if implements import in inline ' +
    'interface macro new null operator overload override package private public ' +
    'return static switch this throw true try typedef untyped using var while'
  ).split(' '),
);

/** Maps a case id segment (`key-order`) to a valid Haxe package segment (`key_order`). */
export function packageSegment(segment: string): string {
  let name = segment.replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[a-z_]/.test(name)) {
    name = `_${name}`;
  }
  return HAXE_KEYWORDS.has(name) ? `${name}_` : name;
}

export function rootPackageOf(caseId: string): string {
  return ['cases', ...caseId.split('/').map(packageSegment)].join('.');
}

export function parseTargetsHeader(source: string): Target[] {
  const match = /^\s*\/\/\s*@targets:\s*(.+)$/m.exec(
    source.split('\n').slice(0, 5).join('\n'),
  );
  if (!match) {
    return [...ALL_TARGETS];
  }
  return parseTargets(match[1]);
}

export function parseTargets(list: string): Target[] {
  const targets = list
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  for (const target of targets) {
    if (!(ALL_TARGETS as readonly string[]).includes(target)) {
      throw new Error(`Unknown target "${target}"`);
    }
  }
  return ALL_TARGETS.filter((t) => targets.includes(t));
}

export function matchesFilter(caseId: string, filter?: string): boolean {
  if (!filter) {
    return true;
  }
  return filter
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .some(
      (pattern) =>
        caseId === pattern || path.posix.matchesGlob(caseId, pattern),
    );
}

function listTsFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(
      (e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts'),
    )
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

function makeCase(
  id: string,
  caseDir: string,
  entry: string,
  files: string[],
): ConformanceCase {
  return {
    id,
    rootPackage: rootPackageOf(id),
    caseDir,
    entry,
    files,
    targets: parseTargetsHeader(fs.readFileSync(entry, 'utf8')),
  };
}

/** Finds `<area>/<name>.ts` and `<area>/<name>/main.ts` cases under `casesDir`. */
export function discoverCases(
  casesDir: string,
  filter?: string,
): ConformanceCase[] {
  const cases: ConformanceCase[] = [];
  const areas = fs
    .readdirSync(casesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const area of areas) {
    const areaDir = path.join(casesDir, area);
    for (const entry of fs.readdirSync(areaDir, { withFileTypes: true })) {
      if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.d.ts')
      ) {
        const file = path.join(areaDir, entry.name);
        cases.push(
          makeCase(`${area}/${entry.name.slice(0, -3)}`, areaDir, file, [file]),
        );
      } else if (entry.isDirectory()) {
        const caseDir = path.join(areaDir, entry.name);
        const main = path.join(caseDir, 'main.ts');
        if (!fs.existsSync(main)) {
          throw new Error(
            `Multi-file case ${area}/${entry.name} has no main.ts`,
          );
        }
        cases.push(
          makeCase(
            `${area}/${entry.name}`,
            caseDir,
            main,
            listTsFiles(caseDir),
          ),
        );
      }
    }
  }
  assertUniquePackages(cases);
  return cases
    .filter((c) => matchesFilter(c.id, filter))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function assertUniquePackages(cases: ConformanceCase[]): void {
  const owners = new Map<string, string>();
  for (const c of cases) {
    const owner = owners.get(c.rootPackage);
    if (owner) {
      throw new Error(
        `Cases ${owner} and ${c.id} both map to package ${c.rootPackage}`,
      );
    }
    owners.set(c.rootPackage, c.id);
  }
}
