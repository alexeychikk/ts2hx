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
$ npm start -- -h
Usage: cli [options] <ts-config-path> <output-dir-path>

Arguments:
  ts-config-path                    path to tsconfig.json of your project
  output-dir-path                   path to directory where to output final Haxe code

Options:
  -c, --clean [bool]                empty output directory before converting (choices: "true", "false", "1", "0")
  -cfj, --copyFormatJson [bool]     copy hxformat.json file into output directory (contains Prettier-like settings for Haxe formatter
                                    https://github.com/HaxeCheckstyle/haxe-formatter) (choices: "true", "false", "1", "0", default: true)
  -clf, --copyLibFiles [bool]       copy ts2hx lib files into output directory (contains helper functions and static extensions which improve compatibility with
                                    TS) (choices: "true", "false", "1", "0", default: true)
  -f, --format [bool]               format final Haxe code using haxe-formatter (choices: "true", "false", "1", "0", default: true)
  -ife, --ignoreFormatError [bool]  prevents exit code 1 when Haxe formatter fails (choices: "true", "false", "1", "0")
  -ic, --includeComments [bool]     include comments generated during transformation (choices: "true", "false", "1", "0")
  -it, --includeTodos [bool]        include todos generated during transformation (choices: "true", "false", "1", "0")
  -l, --logLevel <level>            log level (choices: "Log", "Warn", "Error", "None", default: "Log")
  -h, --help                        display help for command
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
- [x] enums
- [x] imports
- [x] exceptions
- [x] async-await (more or less, using tink_core, tink_await, compatibility suffers)
- [ ] decorators
- [ ] ...probably many more
