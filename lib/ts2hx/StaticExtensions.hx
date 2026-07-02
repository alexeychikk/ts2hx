package ts2hx;

#if macro
import haxe.macro.Expr;
import haxe.macro.Context;

using haxe.macro.Tools;
using Lambda;
#end

class StaticExtensions {
  static public function or<T>(value: Null<Any>, defaultValue: T): T {
    switch (value) {
      case 0, null, "", false, _ == Math.NaN => true:
        return defaultValue;
      case _:
        return value;
    }
  }

  static public function and<T>(value: Null<Any>, defaultValue: T): Any {
    switch (value) {
      case 0, null, "", false, _ == Math.NaN => true:
        return value;
      case _:
        return defaultValue;
    }
  }

  // --- JS Array compatibility ---

  extern inline overload static public function forEach<T>(
    array: Array<T>,
    callback: (item: T) -> Void
  ): Void {
    forEachItem(array, callback);
  }

  extern inline overload static public function forEach<T>(
    array: Array<T>,
    callback: (item: T, index: Int) -> Void
  ): Void {
    forEachItemIndex(array, callback);
  }

  static function forEachItem<T>(array: Array<T>, callback: (item: T) -> Void): Void {
    for (item in array) callback(item);
  }

  static function forEachItemIndex<T>(
    array: Array<T>,
    callback: (item: T, index: Int) -> Void
  ): Void {
    for (i in 0...array.length) callback(array[i], i);
  }

  static public function some<T>(array: Array<T>, callback: (item: T) -> Bool): Bool {
    for (item in array) if (callback(item)) return true;
    return false;
  }

  static public function every<T>(array: Array<T>, callback: (item: T) -> Bool): Bool {
    for (item in array) if (!callback(item)) return false;
    return true;
  }

  static public function findIndex<T>(array: Array<T>, callback: (item: T) -> Bool): Int {
    for (i in 0...array.length) if (callback(array[i])) return i;
    return -1;
  }

  static public function includes<T>(array: Array<T>, item: T): Bool {
    return array.indexOf(item) != -1;
  }

  extern inline overload static public function reduce<T, R>(
    array: Array<T>,
    callback: (accumulator: R, item: T) -> R,
    initialValue: R
  ): R {
    return reduceItems(array, callback, initialValue);
  }

  extern inline overload static public function reduce<T, R>(
    array: Array<T>,
    callback: (accumulator: R, item: T, index: Int) -> R,
    initialValue: R
  ): R {
    return reduceItemsIndex(array, callback, initialValue);
  }

  static function reduceItems<T, R>(
    array: Array<T>,
    callback: (accumulator: R, item: T) -> R,
    initialValue: R
  ): R {
    var accumulator = initialValue;
    for (item in array) accumulator = callback(accumulator, item);
    return accumulator;
  }

  static function reduceItemsIndex<T, R>(
    array: Array<T>,
    callback: (accumulator: R, item: T, index: Int) -> R,
    initialValue: R
  ): R {
    var accumulator = initialValue;
    for (i in 0...array.length) accumulator = callback(accumulator, array[i], i);
    return accumulator;
  }

  static public function flat(array: Array<Dynamic>, depth: Int = 1): Array<Dynamic> {
    final result: Array<Dynamic> = [];
    for (item in array) {
      if (depth > 0 && Std.isOfType(item, Array)) {
        for (inner in flat((item : Array<Dynamic>), depth - 1)) result.push(inner);
      } else {
        result.push(item);
      }
    }
    return result;
  }

  // --- JS String compatibility ---

  extern inline overload static public function slice(text: String, start: Int): String {
    return sliceString(text, start, null);
  }

  extern inline overload static public function slice(text: String, start: Int, end: Int): String {
    return sliceString(text, start, end);
  }

  static public function repeat(text: String, count: Int): String {
    final result = new StringBuf();
    for (_ in 0...count) result.add(text);
    return result.toString();
  }

  static function sliceString(text: String, start: Int, end: Null<Int>): String {
    var from = start < 0 ? text.length + start : start;
    var to = end == null ? text.length : end < 0 ? text.length + end : end;
    if (from < 0) from = 0;
    if (to > text.length) to = text.length;
    return from >= to ? '' : text.substring(from, to);
  }

  /** Shallow-merges two objects into a new one ({ ...a, ...b } in TS) */
  static public function combine(target: Dynamic, source: Dynamic): Dynamic {
    final result: Dynamic = {};
    for (object in [target, source]) {
      if (object == null) continue;
      for (field in Reflect.fields(object)) {
        Reflect.setField(result, field, Reflect.field(object, field));
      }
    }
    return result;
  }

  public static macro function spread(rest: Array<Expr>): Expr {
    var pos = Context.currentPos();
    var block = [];
    var cnt = 1;
    // since we want to allow duplicate field names, we use a Map. The last occurrence wins.
    var all = new Map<String, ObjectField>();
    for (rx in rest) {
      var trest = Context.typeof(rx);
      switch (trest.follow()) {
        case TAnonymous(_.get() => tr):
          // for each parameter we create a tmp var with an unique name.
          // we need a tmp var in the case, the parameter is the result of a complex expression.
          var tmp = "tmp_" + cnt;
          cnt++;
          var extVar = macro $i{tmp};
          block.push(macro var $tmp = $rx);
          for (field in tr.fields) {
            var fname = field.name;
            all.set(fname, { field: fname, expr: macro $extVar.$fname });
          }
        default:
          return Context.error(
            "Object type expected instead of " + trest.toString(),
            rx.pos
          );
      }
    }
    var result = { expr: EObjectDecl(all.array()), pos: pos };
    block.push(macro $result);
    return macro $b{block};
  }
}
