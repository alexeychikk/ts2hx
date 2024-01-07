[![Test](https://github.com/alexeychikk/ts2hx/actions/workflows/test.yml/badge.svg)](https://github.com/alexeychikk/ts2hx/actions/workflows/test.yml)

# ⚠️ WORK IN PROGRESS ⚠️

### Converts [TypeScript](https://www.typescriptlang.org/) into [Haxe](https://haxe.org/).

This tool does not seamlessly convert TS to Haxe, but rather helps to transition your codebase.
It just covers syntax differences, basic types and some extra stuff that might come in handy.

## Requirements

- Node.js >= 16

## Usage

1. `git clone https://github.com/alexeychikk/ts2hx.git`
2. `cd ./ts2hx`
3. `npm i`
4. `npm start -- ./path/to/your/tsconfig.json ./output/folder/path`

```console
$ npm start -- -h
Usage: cli [options] <ts-config-path> <output-dir-path>

Arguments:
  ts-config-path                    path to tsconfig.json of your project
  output-dir-path                   path to directory where to output final Haxe code

Options:
  -c, --clean [bool]                    empty output directory before converting (choices: "true", "false", "1", "0")
  -cfj, --copyFormatJson [bool]         copy hxformat.json file into output directory (contains Prettier-like settings for Haxe
                                        formatter https://github.com/HaxeCheckstyle/haxe-formatter) (choices: "true", "false",
                                        "1", "0", default: true)
  -chl, --copyHaxeLibraries [bool]      copy haxe_libraries and .haxerc files into output directory (see lix package manager
                                        https://github.com/lix-pm/lix.client) (choices: "true", "false", "1", "0", default:
                                        true)
  -clf, --copyLibFiles [bool]           copy ts2hx lib files into output directory (contains helper functions and static
                                        extensions which improve compatibility with TS) (choices: "true", "false", "1", "0",
                                        default: true)
  -cih, --copyImportHx [bool]           copy import.hx file into root folders of output (choices: "true", "false", "1", "0",
                                        default: true)
  -cbh, --createBuildHxml [bool]        create build.hxml file (choices: "true", "false", "1", "0")
  -f, --format [bool]                   format final Haxe code using haxe-formatter (choices: "true", "false", "1", "0",
                                        default: true)
  -ife, --ignoreFormatError [bool]      prevents exit code 1 when Haxe formatter fails (choices: "true", "false", "1", "0")
  -ie, --ignoreErrors [bool]            prevents exit code 1 when internal ts2hx error happens (choices: "true", "false", "1",
                                        "0")
  -ic, --includeComments [bool]         include comments generated during transformation (choices: "true", "false", "1", "0")
  -it, --includeTodos [bool]            include todos generated during transformation (choices: "true", "false", "1", "0")
  -l, --logLevel <level>                log level (choices: "Log", "Warn", "Error", "None", default: "Log")
  --transformTemplateExpression [bool]  converts (`foo ${expression} bar`) to ("foo " + expression + " bar") (choices: "true",
                                        "false", "1", "0", default: true)
  -h, --help                            display help for command
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
- [ ] async-await
- [ ] decorators
- [ ] ...probably many more
