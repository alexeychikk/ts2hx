# ⚠️ WORK IN PROGRESS ⚠️

### Converts [TypeScript](https://www.typescriptlang.org/) into [Haxe](https://haxe.org/).

This tool does not seamlessly convert TS to Haxe, but rather helps to transition your codebase.
It just covers syntax differences, basic types and some extra stuff that might come in handy.

## Requirements

- Node.js >= 16

## Usage

1. Clone this repository
2. `npm i`
3. `npm start -- ./path/to/your/tsconfig.json ./output/folder/path`

```console
$ node .\dist\src\cli.js -h
Usage: cli [options] <ts-config-path> <output-dir-path>

Arguments:
  ts-config-path          path to tsconfig.json of your project
  output-dir-path         path to directory where to output final Haxe code

Options:
  -c, --includeComments   whether to include comments generated during transformation
  -t, --includeTodos      whether to include todos generated during transformation
  -l, --logLevel <level>  log level (choices: "Log", "Warn", "Error", "None", default: "Log")
  -h, --help              display help for command
```

## Features

- [x] keywords and syntax tokens
- [x] basic data types
- [x] variable declarations
- [x] loops
- [x] switch-case
- [x] dynamic property access/read
- [x] implicit to explicit boolean condition
- [x] functions
- [x] classes
- [x] interfaces and type definitions
- [x] imports
- [x] exceptions
- [x] enums
- [ ] decorators
- [ ] ...probably many more
