import ts from "typescript";
import fs from "fs";
import path from "path";
import { Converter } from "./Converter";
import { logger } from "./Logger";

const tsConfigPathParam = process.argv[2];
const outputDirPathParam = process.argv[3];

const tsconfigPath = path.resolve(process.cwd(), tsConfigPathParam);
const outputDirPath = path.resolve(process.cwd(), outputDirPathParam);
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

if (configFile.error) {
	logger.error(configFile.error.messageText);
	process.exit(1);
}

const config = ts.parseJsonConfigFileContent(
	configFile.config,
	ts.sys,
	path.dirname(tsconfigPath)
);

const program = ts.createProgram({
	rootNames: config.fileNames,
	options: config.options,
});

(async () => {
	try {
		const converter = new Converter({ program, outputDirPath });
		await converter.run();
	} catch (error) {
		logger.error(error);
		process.exit(1);
	}
})();
