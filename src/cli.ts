import path from 'path';
import { Converter } from './Converter';
import { logger } from './Logger';

const tsConfigPathParam = process.argv[2];
const outputDirPathParam = process.argv[3];

const tsconfigPath = path.resolve(process.cwd(), tsConfigPathParam);
const outputDirPath = path.resolve(process.cwd(), outputDirPathParam);

void (async () => {
  try {
    const converter = new Converter({ tsconfigPath, outputDirPath });
    await converter.run();
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
