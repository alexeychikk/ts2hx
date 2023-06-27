const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  collectCoverageFrom: ['src/**/*.ts?(x)'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageReporters: ['text', 'html'],
  errorOnDeprecated: true,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'mjs'],
  moduleNameMapper: {
    ...pathsToModuleNameMapper(compilerOptions.paths || {}, {
      prefix: process.cwd(),
    }),
  },
  preset: 'ts-jest',
  setupFiles: ['./tests/setupTests.ts'],
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '/.vscode/',
    '/dist/',
    '/examples/',
    '/haxe_libraries/',
    '/lib/',
    '/node_modules/',
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
      },
    ],
  },
};
