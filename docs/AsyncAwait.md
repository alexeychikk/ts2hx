# Async/Await Transformation

## Overview

TypeScript's async/await syntax is transformed to Haxe's Promise-based code. Since Haxe does not have native async/await keywords, this transformation focuses on:

1. Removing `async` keywords from functions
2. Converting `await` expressions to regular function calls
3. Ensuring Promise return types are maintained

## Examples

### TypeScript
```typescript
async function fetchData() {
  const response = await api.get('/data');
  return response.data;
}

class DataService {
  async getData() {
    return await this.fetchData();
  }
  
  async processData(id: string) {
    const data = await this.getData();
    return data.filter(item => item.id === id);
  }
}
```

### Haxe (Transformed)
```haxe
function fetchData() {
  final response = api.get('/data');
  return response.data;
}

class DataService {
  public function new() {}
    
  public function getData() {
    return this.fetchData();
  }
    
  public function processData(id: String) {
    final data = this.getData();
    return data.filter(item -> item.id == id);
  }
}
```

## Transformation Rules

1. `async function foo()` → `function foo()`
2. `async method()` → `function method()`
3. `const fn = async () => expr` → `final fn = () -> expr`
4. `const fn = async function() {}` → `final fn = function() {}`
5. `await expr` → `expr`
6. `return await expr` → `return expr`
7. `return expr` (in async function) → `return expr`

## Promise Handling

The transformation preserves Promise chaining with `.then()` and `.catch()`:

```typescript
// TypeScript
function processData() {
  return fetchData()
    .then(data => processData(data))
    .then(result => formatResult(result))
    .catch(error => {
      console.error('Error:', error);
      return defaultResult;
    });
}
```

```haxe
// Haxe
function processData() {
  return fetchData()
    .then(data -> processData(data))
    .then(result -> formatResult(result))
    .catch(function(error) {
      console.error('Error:', error);
      return defaultResult;
    });
}
```

## Notes

- Haxe has no direct equivalent to the `async/await` syntax found in TypeScript
- The Promise pattern is used for asynchronous operations in Haxe
- This transformation aims to maintain the semantic meaning of the original code while adapting to Haxe's patterns