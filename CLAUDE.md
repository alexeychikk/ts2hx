# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ts2hx is a tool that converts TypeScript code into Haxe code. It helps with transitioning codebases by handling syntax differences, basic types, and other features. The tool parses TypeScript AST (Abstract Syntax Tree) and transforms it into equivalent Haxe code.

## Common Commands

### Development Commands

```bash
# Install dependencies
npm install

# Build the project
npm run ts

# Run the converter
npm start -- ./path/to/your/tsconfig.json ./output/folder/path

# Clean build artifacts
npm run clean

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format all files with prettier
npm run prettify

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage
```

### CLI Options

The CLI tool supports various options:

```
Usage: cli [options] <ts-config-path> <output-dir-path>

Arguments:
  ts-config-path                        path to tsconfig.json of your project
  output-dir-path                       path to directory where to output final Haxe code

Options:
  -c, --clean [bool]                    empty output directory before converting
  -cfj, --copyFormatJson [bool]         copy hxformat.json file into output directory
  -chl, --copyHaxeLibraries [bool]      copy haxe_libraries and .haxerc files into output directory
  -clf, --copyLibFiles [bool]           copy ts2hx lib files into output directory
  -cih, --copyImportHx [bool]           copy import.hx file into root folders of output
  -cbh, --createBuildHxml [bool]        create build.hxml file
  -f, --format [bool]                   format final Haxe code using haxe-formatter
  -ife, --ignoreFormatError [bool]      prevents exit code 1 when Haxe formatter fails
  -ie, --ignoreErrors [bool]            prevents exit code 1 when internal ts2hx error happens
  -ic, --includeComments [bool]         include comments generated during transformation
  -it, --includeTodos [bool]            include todos generated during transformation
  -l, --logLevel <level>                log level (choices: "Log", "Warn", "Error", "None")
  --transformTemplateExpression [bool]  converts (`foo ${expression} bar`) to ("foo " + expression + " bar")
```

## Architecture Overview

The project has several main components:

1. **CLI Tool (`src/cli.ts`)**: Handles command-line arguments and initiates the conversion process.

2. **Converter (`src/Converter.ts`)**: Orchestrates the entire conversion process including:
   - Creating a TypeScript program
   - Running transformers
   - Emitting Haxe code
   - Copying supporting files
   - Formatting output

3. **Transpiler (`src/transformers/Transpiler.ts`)**: Core transformation engine that:
   - Applies transformers to TypeScript nodes
   - Emits Haxe code
   - Manages code transformation utilities

4. **Transformers**: Various modules that handle specific aspects of transformation:
   - Language basics (`transformers/lang/basics.ts`)
   - Classes (`transformers/lang/classes.ts`)
   - Functions (`transformers/lang/functions.ts`) 
   - Types (`transformers/lang/types.ts`)
   - Variables (`transformers/lang/variables.ts`)
   - and many others

5. **Utils**: Utility functions for the conversion process:
   - TypeScript source file management
   - Compiler host creation
   - Error handling

## Testing Framework

The project uses Jest for testing. The test framework is defined in `tests/framework.ts`, which provides:

1. `ts2hx` function: A template literal function for easily writing tests
2. `Ts2hx` class: For more complex test cases with multiple source files

Tests follow a pattern of providing TypeScript input and asserting on the expected Haxe output using snapshot testing. The tests are organized by feature, with separate directories for:

- basics
- classes
- conditions
- functions
- objects
- promise
- types
- variables

## Project Status

The project is marked as "WORK IN PROGRESS" in the README. It currently supports many essential features like:
- keywords and syntax tokens
- basic data types
- variable declarations
- loops
- switches
- dynamic property access
- functions
- classes
- interfaces and type definitions
- enums
- imports
- exceptions

But some features are not yet fully supported, including:
- decorators