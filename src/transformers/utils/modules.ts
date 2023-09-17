import path from 'path';
import { type Transpiler } from '../Transpiler';

export function escapeHaxeModuleName(
  this: Transpiler,
  fileName: string,
): string {
  return fileName
    .replace(/(\.d)?\.(j|t)s(x)?$/i, '')
    .replace(/^([^a-zA-Z\\/]+)/, 'X_$1')
    .replace(/[^a-zA-Z0-9_\\/]/gim, '_');
}

export function getHaxeFilePath(
  this: Transpiler,
  fileName = this.sourceFile.fileName,
): string {
  const filePath = this.utils.getRelativeFilePath(fileName);
  const baseName = path.basename(filePath);
  let newBaseName = this.utils.escapeHaxeModuleName(baseName);
  newBaseName =
    newBaseName === 'import'
      ? newBaseName
      : newBaseName[0].toUpperCase() + newBaseName.slice(1);
  const dirPath = filePath
    .slice(0, -baseName.length)
    .split(path.sep)
    .map((folderName) => {
      if (!folderName) return '';
      const escaped = this.utils.escapeHaxeModuleName(folderName);
      return escaped[0].toLowerCase() + escaped.slice(1);
    })
    .join(path.sep);
  return dirPath + newBaseName + '.hx';
}

export function getRelativeFilePath(
  this: Transpiler,
  fileName = this.sourceFile.fileName,
): string {
  return path.relative(this.compilerOptions.rootDir!, fileName);
}

export function getPackageName(
  this: Transpiler,
  fileName: string = this.sourceFile.fileName,
): string {
  const haxeFilePath = this.utils.getHaxeFilePath(fileName);
  const dirname = path.dirname(haxeFilePath);
  if (dirname === '.') return '';
  return dirname.replace(/[\\/]/gim, '.');
}

export function getImportedPackageName(
  this: Transpiler,
  fileName: string = this.sourceFile.fileName,
): string {
  const haxeFilePath = this.utils.getHaxeFilePath(fileName);
  return haxeFilePath.replace(/\.hx$/gim, '').replace(/[\\/]/gim, '.');
}
