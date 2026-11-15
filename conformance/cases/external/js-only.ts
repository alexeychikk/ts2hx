// @targets: js
import ts, {
  couldStartTrivia,
  isIdentifierStart,
  isLineBreak,
  versionMajorMinor,
} from 'typescript';
import * as typescript from 'typescript';

console.log(
  typeof versionMajorMinor,
  versionMajorMinor === ts.versionMajorMinor,
);
console.log(versionMajorMinor.split('.').length);
console.log(isLineBreak(10), isLineBreak(65));
console.log(isIdentifierStart(95, undefined), isIdentifierStart(49, undefined));
console.log(couldStartTrivia('  x', 0), typescript.couldStartTrivia('x', 0));
console.log(typescript.version.startsWith(versionMajorMinor));
