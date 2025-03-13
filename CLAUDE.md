# TS2HX Development Guide

## Commands
- Build: `npm run ts`
- Lint: `npm run lint`
- Lint and fix: `npm run lint:fix`
- Format code: `npm run prettify`
- Run tests: `npm run test`
- Run a single test: `npm run test -- -t "test name pattern"`
- Run tests with coverage: `npm run test:coverage`
- Clean build: `npm run clean`

## Code Style Guidelines
- Use TypeScript's strict mode with proper typing
- Prefer interface over type for object definitions
- Use PascalCase for class/interface names, camelCase for variables and functions
- Organize imports alphabetically with TypeScript imports first
- Error handling: use ConverterError for domain errors, proper try/catch with async code
- Asynchronous code should use async/await pattern with proper error handling
- Follow the existing project structure for new transformers
- Write tests using the ts2hx helper function with template strings
- Document public APIs with JSDoc comments