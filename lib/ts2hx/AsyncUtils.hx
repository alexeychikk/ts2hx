package ts2hx;

#if js
import js.lib.Promise;
#end

/**
 * Runtime helpers used by the ts2hx async/await to Promise transformation.
 *
 * Loop body callbacks may resolve with `AsyncUtils.BREAK` to stop the loop
 * (the equivalent of the `break` keyword); any other value continues with
 * the next iteration.
 *
 * Only available on the JS target — on other targets adapt these helpers
 * to the Promise implementation of your choice.
 */
class AsyncUtils {
  #if js
  /** Sentinel value a loop body resolves with to emulate `break`. */
  public static final BREAK: Dynamic = {};

  /**
   * Sequential Promise-based version of `for (i in start...end)`.
   */
  public static function asyncLoop(
    start: Int,
    end: Int,
    body: Int -> Promise<Dynamic>
  ): Promise<Void> {
    function iterate(index: Int): Promise<Void> {
      if (index >= end) return resolveVoid();
      return call(body.bind(index)).then(function(result) {
        if (result == BREAK) return resolveVoid();
        return iterate(index + 1);
      });
    }
    return iterate(start);
  }

  /**
   * Sequential Promise-based version of `for (item in items)`.
   */
  public static function forEachAsync<T>(
    items: Array<T>,
    body: T -> Promise<Dynamic>
  ): Promise<Void> {
    return asyncLoop(0, items.length, function(index) {
      return body(items[index]);
    });
  }

  /**
   * Sequential Promise-based version of `while (condition()) { ... }`.
   */
  public static function whileAsync(
    condition: () -> Bool,
    body: () -> Promise<Dynamic>
  ): Promise<Void> {
    function iterate(): Promise<Void> {
      if (!condition()) return resolveVoid();
      return call(body).then(function(result) {
        if (result == BREAK) return resolveVoid();
        return iterate();
      });
    }
    return iterate();
  }

  /**
   * Sequential Promise-based version of `do { ... } while (condition())`.
   */
  public static function doWhileAsync(
    condition: () -> Bool,
    body: () -> Promise<Dynamic>
  ): Promise<Void> {
    return call(body).then(function(result) {
      if (result == BREAK) return resolveVoid();
      return whileAsync(condition, body);
    });
  }

  /**
   * Promise-based version of try/catch/finally. Synchronous exceptions
   * thrown by `tryFn` are routed to `catchFn` just like rejections.
   * `finallyFn` runs (and is awaited) on both the success and failure paths.
   */
  public static function tryAsync<T>(
    tryFn: () -> Promise<T>,
    ?catchFn: Dynamic -> Promise<T>,
    ?finallyFn: () -> Promise<Dynamic>
  ): Promise<T> {
    var result = call(tryFn);
    if (catchFn != null) {
      result = result.catchError(function(error) {
        return call(catchFn.bind(error));
      });
    }
    if (finallyFn != null) {
      result = result.then(
        function(value) {
          return call(finallyFn).then(function(_) return Promise.resolve(value));
        },
        function(error): Promise<T> {
          return call(finallyFn).then(function(_) return Promise.reject(error));
        }
      );
    }
    return result;
  }

  /** Invokes `fn` converting synchronous exceptions into rejections. */
  static function call<T>(fn: () -> Promise<T>): Promise<T> {
    try {
      return fn();
    } catch (error: Dynamic) {
      // Dynamic preserves the original thrown value (like JS try/catch)
      return Promise.reject(error);
    }
  }

  static function resolveVoid(): Promise<Void> {
    return cast Promise.resolve();
  }
  #end
}
