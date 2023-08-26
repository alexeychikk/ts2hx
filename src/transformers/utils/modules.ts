import path from 'path';
import { type Transformer } from '../Transformer';

export function escapeHaxeModuleName(
  this: Transformer,
  fileName: string,
): string {
  return fileName
    .replace(/(\.d)?\.(j|t)s(x)?$/i, '')
    .replace(/^([^a-zA-Z\\/.]+)/, 'X_$1')
    .replace(/[^a-zA-Z0-9_\\/.]/gim, '_');
}

export function getPackageName(
  this: Transformer,
  filePath = this.utils.getRelativeFilePath(),
): string {
  const dirPath = path.dirname(filePath);
  if (dirPath === '.') return '';
  return dirPath.replace(/[\\/]/g, '.');
}

export function getHaxeFilePath(
  this: Transformer,
  fileName = this.sourceFile.fileName,
): string {
  const filePath = this.utils.getRelativeFilePath(fileName);
  const baseName = path.basename(filePath);
  let newBaseName = this.utils.escapeHaxeModuleName(baseName);
  newBaseName =
    newBaseName === 'import'
      ? newBaseName
      : newBaseName[0].toUpperCase() + newBaseName.slice(1);
  return this.utils.escapeHaxeModuleName(
    filePath.slice(0, -baseName.length) + newBaseName + '.hx',
  );
}

export function getModuleFilePath(
  this: Transformer,
  fileName = this.sourceFile.fileName,
): string {
  const filePath = this.utils.getHaxeFilePath(fileName);
  const fileExt = path.extname(filePath);
  return filePath.slice(0, -fileExt.length);
}

export function getRelativeFilePath(
  this: Transformer,
  fileName = this.sourceFile.fileName,
): string {
  return path.relative(this.compilerOptions.rootDir!, fileName);
}

export function getImportedPackageName(
  this: Transformer,
  fileName: string,
): string {
  const modulePath = this.utils.getModuleFilePath(fileName);
  const relativeFileName =
    path.basename(modulePath) === 'Index'
      ? modulePath
      : path.join(modulePath, './Index.hx');
  return this.utils.getPackageName(relativeFileName);
}
