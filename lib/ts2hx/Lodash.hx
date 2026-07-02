package ts2hx;

/**
 * Minimal runtime shim for the lodash functions most commonly used in
 * TypeScript projects. Signatures are intentionally Dynamic — lodash
 * accepts both arrays and objects as collections and both functions and
 * property names as iteratees, which cannot be expressed statically.
 */
class Lodash {
  // --- collection helpers ---

  /** Iteration entries of an array (key = index) or an object (key = field name) */
  static function entries(collection: Dynamic): Array<{key: Dynamic, value: Dynamic}> {
    final result: Array<{key: Dynamic, value: Dynamic}> = [];
    if (collection == null) return result;
    if (Std.isOfType(collection, Array)) {
      final array: Array<Dynamic> = collection;
      for (i in 0...array.length) result.push({ key: i, value: array[i] });
    } else {
      for (field in Reflect.fields(collection)) {
        result.push({ key: field, value: Reflect.field(collection, field) });
      }
    }
    return result;
  }

  /** Calls an iteratee that may accept fewer arguments than provided */
  static function call2(fn: Dynamic, a: Dynamic, b: Dynamic): Dynamic {
    #if js
    return untyped fn(a, b);
    #else
    return Reflect.callMethod(null, fn, [a, b]);
    #end
  }

  static function call3(fn: Dynamic, a: Dynamic, b: Dynamic, c: Dynamic): Dynamic {
    #if js
    return untyped fn(a, b, c);
    #else
    return Reflect.callMethod(null, fn, [a, b, c]);
    #end
  }

  /** Supports lodash property-name shorthand iteratees */
  static function toIteratee(iteratee: Dynamic): Dynamic {
    if (Std.isOfType(iteratee, String)) {
      final property: String = iteratee;
      return (value: Dynamic, ?_: Dynamic) -> Reflect.field(value, property);
    }
    return iteratee;
  }

  static function truthy(value: Dynamic): Bool {
    return value != null && value != false && value != 0 && value != "";
  }

  static function flattenArguments(values: Array<Dynamic>): Array<Dynamic> {
    final result: Array<Dynamic> = [];
    for (value in values) {
      if (Std.isOfType(value, Array)) {
        for (item in (value : Array<Dynamic>)) result.push(item);
      } else {
        result.push(value);
      }
    }
    return result;
  }

  // --- array functions ---

  public static function first(array: Array<Dynamic>): Dynamic {
    return array == null || array.length == 0 ? null : array[0];
  }

  public static function head(array: Array<Dynamic>): Dynamic {
    return first(array);
  }

  public static function last(array: Array<Dynamic>): Dynamic {
    return array == null || array.length == 0 ? null : array[array.length - 1];
  }

  public static function compact(array: Array<Dynamic>): Dynamic {
    return [for (item in array) if (truthy(item)) item];
  }

  public static function uniq(array: Array<Dynamic>): Dynamic {
    final result: Array<Dynamic> = [];
    for (item in array) if (result.indexOf(item) == -1) result.push(item);
    return result;
  }

  public static function uniqBy(array: Array<Dynamic>, iteratee: Dynamic): Dynamic {
    final fn = toIteratee(iteratee);
    final seen: Array<Dynamic> = [];
    final result: Array<Dynamic> = [];
    for (i in 0...array.length) {
      final key = call2(fn, array[i], i);
      if (seen.indexOf(key) == -1) {
        seen.push(key);
        result.push(array[i]);
      }
    }
    return result;
  }

  public static function without(array: Array<Dynamic>, ...values: Dynamic): Dynamic {
    final excluded = values.toArray();
    return [for (item in array) if (excluded.indexOf(item) == -1) item];
  }

  public static function difference(array: Array<Dynamic>, ...others: Dynamic): Dynamic {
    final excluded = flattenArguments(others.toArray());
    return [for (item in array) if (excluded.indexOf(item) == -1) item];
  }

  public static function dropRight(array: Array<Dynamic>, n: Float = 1): Dynamic {
    final end = array.length - Std.int(n);
    return end <= 0 ? [] : array.slice(0, end);
  }

  /** Mutates the array, removing all occurrences of the given values */
  public static function pull(array: Array<Dynamic>, ...values: Dynamic): Dynamic {
    final excluded = values.toArray();
    var i = array.length - 1;
    while (i >= 0) {
      if (excluded.indexOf(array[i]) != -1) array.splice(i, 1);
      i--;
    }
    return array;
  }

  /** Mutates the array, removing elements matching the predicate; returns the removed ones */
  public static function remove(array: Array<Dynamic>, predicate: Dynamic): Dynamic {
    final fn = toIteratee(predicate);
    final removed: Array<Dynamic> = [];
    var i = 0;
    while (i < array.length) {
      if (truthy(call2(fn, array[i], i))) {
        removed.push(array[i]);
        array.splice(i, 1);
      } else {
        i++;
      }
    }
    return removed;
  }

  public static function times(n: Float, ?iteratee: Dynamic): Dynamic {
    return [for (i in 0...Std.int(n)) iteratee == null ? i : call2(iteratee, i, null)];
  }

  // --- collection functions (arrays and objects) ---

  public static function forEach(collection: Dynamic, iteratee: Dynamic): Dynamic {
    final fn = toIteratee(iteratee);
    for (entry in entries(collection)) {
      if (call2(fn, entry.value, entry.key) == false) break;
    }
    return collection;
  }

  public static function map(collection: Dynamic, iteratee: Dynamic): Dynamic {
    final fn = toIteratee(iteratee);
    return [for (entry in entries(collection)) call2(fn, entry.value, entry.key)];
  }

  public static function filter(collection: Dynamic, predicate: Dynamic): Dynamic {
    final fn = toIteratee(predicate);
    return [
      for (entry in entries(collection))
        if (truthy(call2(fn, entry.value, entry.key))) entry.value
    ];
  }

  public static function find(collection: Dynamic, predicate: Dynamic): Dynamic {
    final fn = toIteratee(predicate);
    for (entry in entries(collection)) {
      if (truthy(call2(fn, entry.value, entry.key))) return entry.value;
    }
    return null;
  }

  public static function some(collection: Dynamic, predicate: Dynamic): Bool {
    final fn = toIteratee(predicate);
    for (entry in entries(collection)) {
      if (truthy(call2(fn, entry.value, entry.key))) return true;
    }
    return false;
  }

  public static function flatMap(collection: Dynamic, iteratee: Dynamic): Dynamic {
    final fn = toIteratee(iteratee);
    final result: Array<Dynamic> = [];
    for (entry in entries(collection)) {
      final mapped = call2(fn, entry.value, entry.key);
      if (Std.isOfType(mapped, Array)) {
        for (item in (mapped : Array<Dynamic>)) result.push(item);
      } else {
        result.push(mapped);
      }
    }
    return result;
  }

  public static function sum(array: Array<Dynamic>): Float {
    var total = 0.0;
    for (item in array) total += (item : Float);
    return total;
  }

  public static function sumBy(collection: Dynamic, iteratee: Dynamic): Float {
    final fn = toIteratee(iteratee);
    var total = 0.0;
    for (entry in entries(collection)) total += (call2(fn, entry.value, entry.key) : Float);
    return total;
  }

  public static function minBy(collection: Dynamic, iteratee: Dynamic): Dynamic {
    return extremumBy(collection, iteratee, -1);
  }

  public static function maxBy(collection: Dynamic, iteratee: Dynamic): Dynamic {
    return extremumBy(collection, iteratee, 1);
  }

  static function extremumBy(collection: Dynamic, iteratee: Dynamic, direction: Int): Dynamic {
    final fn = toIteratee(iteratee);
    var best: Dynamic = null;
    var bestKey: Null<Float> = null;
    for (entry in entries(collection)) {
      final key: Float = call2(fn, entry.value, entry.key);
      if (bestKey == null || (direction > 0 ? key > bestKey : key < bestKey)) {
        bestKey = key;
        best = entry.value;
      }
    }
    return best;
  }

  public static function sortBy(collection: Dynamic, ?iteratee: Dynamic): Dynamic {
    final fn = iteratee == null ? null : toIteratee(iteratee);
    final result = [for (entry in entries(collection)) entry.value];
    result.sort((a, b) -> {
      final keyA: Dynamic = fn == null ? a : call2(fn, a, null);
      final keyB: Dynamic = fn == null ? b : call2(fn, b, null);
      return Reflect.compare(keyA, keyB);
    });
    return result;
  }

  public static function orderBy(collection: Dynamic, ?iteratees: Dynamic, ?orders: Dynamic): Dynamic {
    final iterateeList: Array<Dynamic> = iteratees == null
      ? []
      : Std.isOfType(iteratees, Array) ? iteratees : [iteratees];
    final orderList: Array<Dynamic> = orders == null
      ? []
      : Std.isOfType(orders, Array) ? orders : [orders];

    final result = [for (entry in entries(collection)) entry.value];
    result.sort((a, b) -> {
      for (i in 0...(iterateeList.length > 0 ? iterateeList.length : 1)) {
        final fn = iterateeList.length > 0 ? toIteratee(iterateeList[i]) : null;
        final keyA: Dynamic = fn == null ? a : call2(fn, a, null);
        final keyB: Dynamic = fn == null ? b : call2(fn, b, null);
        var comparison = Reflect.compare(keyA, keyB);
        if (i < orderList.length && orderList[i] == 'desc') comparison = -comparison;
        if (comparison != 0) return comparison;
      }
      return 0;
    });
    return result;
  }

  public static function groupBy(collection: Dynamic, iteratee: Dynamic): Dynamic {
    final fn = toIteratee(iteratee);
    final result: Dynamic = {};
    for (entry in entries(collection)) {
      final key = Std.string(call2(fn, entry.value, entry.key));
      var group: Array<Dynamic> = Reflect.field(result, key);
      if (group == null) {
        group = [];
        Reflect.setField(result, key, group);
      }
      group.push(entry.value);
    }
    return result;
  }

  public static function keyBy(collection: Dynamic, iteratee: Dynamic): Dynamic {
    final fn = toIteratee(iteratee);
    final result: Dynamic = {};
    for (entry in entries(collection)) {
      Reflect.setField(result, Std.string(call2(fn, entry.value, entry.key)), entry.value);
    }
    return result;
  }

  public static function transform(collection: Dynamic, iteratee: Dynamic, ?accumulator: Dynamic): Dynamic {
    final acc: Dynamic = accumulator != null
      ? accumulator
      : Std.isOfType(collection, Array) ? ([] : Array<Dynamic>) : {};
    for (entry in entries(collection)) {
      if (call3(iteratee, acc, entry.value, entry.key) == false) break;
    }
    return acc;
  }

  // --- object functions ---

  public static function omit(object: Dynamic, ...keys: Dynamic): Dynamic {
    final excluded = flattenArguments(keys.toArray()).map(Std.string);
    final result: Dynamic = {};
    if (object == null) return result;
    for (field in Reflect.fields(object)) {
      if (excluded.indexOf(field) == -1) {
        Reflect.setField(result, field, Reflect.field(object, field));
      }
    }
    return result;
  }

  public static function pick(object: Dynamic, ...keys: Dynamic): Dynamic {
    final included = flattenArguments(keys.toArray()).map(Std.string);
    final result: Dynamic = {};
    if (object == null) return result;
    for (field in included) {
      if (Reflect.hasField(object, field)) {
        Reflect.setField(result, field, Reflect.field(object, field));
      }
    }
    return result;
  }

  public static function omitBy(object: Dynamic, predicate: Dynamic): Dynamic {
    final fn = toIteratee(predicate);
    final result: Dynamic = {};
    if (object == null) return result;
    for (field in Reflect.fields(object)) {
      final value = Reflect.field(object, field);
      if (!truthy(call2(fn, value, field))) Reflect.setField(result, field, value);
    }
    return result;
  }

  public static function pickBy(object: Dynamic, predicate: Dynamic): Dynamic {
    final fn = toIteratee(predicate);
    final result: Dynamic = {};
    if (object == null) return result;
    for (field in Reflect.fields(object)) {
      final value = Reflect.field(object, field);
      if (truthy(call2(fn, value, field))) Reflect.setField(result, field, value);
    }
    return result;
  }

  public static function mapValues(object: Dynamic, iteratee: Dynamic): Dynamic {
    final fn = toIteratee(iteratee);
    final result: Dynamic = {};
    if (object == null) return result;
    for (field in Reflect.fields(object)) {
      Reflect.setField(result, field, call2(fn, Reflect.field(object, field), field));
    }
    return result;
  }

  // --- lang functions ---

  public static function isEmpty(value: Dynamic): Bool {
    if (value == null) return true;
    if (Std.isOfType(value, String)) return (value : String).length == 0;
    if (Std.isOfType(value, Array)) return (value : Array<Dynamic>).length == 0;
    if (Reflect.isObject(value)) return Reflect.fields(value).length == 0;
    return true;
  }

  public static function isEqual(a: Dynamic, b: Dynamic): Bool {
    if (a == b) return true;
    if (a == null || b == null) return false;
    if (Std.isOfType(a, Array) && Std.isOfType(b, Array)) {
      final arrayA: Array<Dynamic> = a;
      final arrayB: Array<Dynamic> = b;
      if (arrayA.length != arrayB.length) return false;
      for (i in 0...arrayA.length) if (!isEqual(arrayA[i], arrayB[i])) return false;
      return true;
    }
    if (Reflect.isObject(a) && Reflect.isObject(b)
      && !Std.isOfType(a, String) && !Std.isOfType(b, String)) {
      final fieldsA = Reflect.fields(a);
      final fieldsB = Reflect.fields(b);
      if (fieldsA.length != fieldsB.length) return false;
      for (field in fieldsA) {
        if (!Reflect.hasField(b, field)) return false;
        if (!isEqual(Reflect.field(a, field), Reflect.field(b, field))) return false;
      }
      return true;
    }
    return false;
  }

  public static function cloneDeep(value: Dynamic): Dynamic {
    if (value == null) return null;
    if (Std.isOfType(value, Array)) {
      return [for (item in (value : Array<Dynamic>)) cloneDeep(item)];
    }
    if (Reflect.isObject(value) && !Std.isOfType(value, String)
      && !Reflect.isFunction(value)) {
      final result: Dynamic = {};
      for (field in Reflect.fields(value)) {
        Reflect.setField(result, field, cloneDeep(Reflect.field(value, field)));
      }
      return result;
    }
    return value;
  }

  public static function clamp(value: Float, lower: Float, upper: Float): Float {
    return value < lower ? lower : value > upper ? upper : value;
  }

  // --- function functions ---

  public static function noop(): Void {}

  public static function memoize(fn: Dynamic): Dynamic {
    final cache = new haxe.ds.StringMap<Dynamic>();
    return function(?argument: Dynamic): Dynamic {
      final key = Std.string(argument);
      if (!cache.exists(key)) {
        cache.set(key, argument == null ? untyped fn() : untyped fn(argument));
      }
      return cache.get(key);
    };
  }

  public static function debounce(fn: Dynamic, wait: Float = 0): Dynamic {
    var timeoutId: Null<Int> = null;
    final debounced = function(?a: Dynamic, ?b: Dynamic): Dynamic {
      if (timeoutId != null) Ts2hx.clearTimeout(timeoutId);
      timeoutId = Ts2hx.setTimeout(() -> {
        timeoutId = null;
        call2(fn, a, b);
      }, wait);
      return null;
    };
    #if js
    untyped debounced.cancel = function() {
      if (timeoutId != null) Ts2hx.clearTimeout(timeoutId);
      timeoutId = null;
    };
    untyped debounced.flush = function() {
      if (timeoutId != null) Ts2hx.clearTimeout(timeoutId);
      timeoutId = null;
      call2(fn, null, null);
    };
    #end
    return debounced;
  }

  // --- string functions ---

  public static function escapeRegExp(text: String): String {
    return new EReg("[.*+?^${}()|[\\]\\\\]", "g").replace(text, "\\$0");
  }
}
