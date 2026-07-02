package ts2hx;

import haxe.ds.IntMap;
import haxe.Timer;

class Ts2hx {
  static public function typeof<T>(value: T): String {
    switch (Type.typeof(value)) {
      case TInt, TFloat, TEnum(_):
        return "number";
      case TBool:
        return "boolean";
      case TClass(String):
        return "string";
      case TFunction:
        return "function";
      case TNull:
        // In JS `typeof null === "object"` but since there is no `undefined`
        // in Haxe, we convert JS's `undefined` to Haxe's `null`.
        return "undefined";
      case _:
        if (Type.getClassName((value : Dynamic)) != null) return "function";
        return "object";
    }
  }

  static public function rest<T: {}>(obj: T, fields: Array<String>): Dynamic {
    var result: Dynamic = Reflect.copy(obj);
    for (field in fields) {
      Reflect.deleteField(result, field);
    }
    return result;
  }

  /** Object.values(obj) */
  static public function objectValues(object: Dynamic): Array<Dynamic> {
    return [for (field in Reflect.fields(object)) Reflect.field(object, field)];
  }

  /** Object.entries(obj) */
  static public function objectEntries(object: Dynamic): Array<Array<Dynamic>> {
    return [
      for (field in Reflect.fields(object))
        ([field, Reflect.field(object, field)] : Array<Dynamic>)
    ];
  }

  /** Object.assign(target, ...sources) */
  static public function objectAssign(target: Dynamic, ...sources: Dynamic): Dynamic {
    for (source in sources) {
      if (source == null) continue;
      for (field in Reflect.fields(source)) {
        Reflect.setField(target, field, Reflect.field(source, field));
      }
    }
    return target;
  }

  /** Object.fromEntries(entries) */
  static public function objectFromEntries(entries: Array<Dynamic>): Dynamic {
    final result: Dynamic = {};
    for (entry in entries) {
      Reflect.setField(result, Std.string(entry[0]), entry[1]);
    }
    return result;
  }

  /** Date.now() — current time in milliseconds */
  static public function dateNow(): Float {
    return Date.now().getTime();
  }

  /** Array.isArray(value) */
  static public function isArray(value: Any): Bool {
    return Std.isOfType(value, Array);
  }

  /** Array.from(value) */
  static public function arrayFrom(value: Dynamic): Array<Dynamic> {
    #if js
    return js.Syntax.code("Array.from({0})", value);
    #else
    if (Std.isOfType(value, Array)) return (value : Array<Dynamic>).copy();
    final result: Array<Dynamic> = [];
    final iterator: Dynamic = Reflect.field(value, "iterator") != null
      ? value.iterator()
      : value;
    while (iterator.hasNext()) result.push(iterator.next());
    return result;
    #end
  }

  static var timeoutCounter = 0;
  static var timeouts: IntMap<Timer> = new IntMap();

  static public function setTimeout(cb: () -> Void, ms: Float = 0): Int {
    var timer = Timer.delay(cb, Std.int(ms));
    Ts2hx.timeouts.set(timeoutCounter, timer);
    return Ts2hx.timeoutCounter++;
  }

  static public function clearTimeout(timeoutId: Float): Void {
    var timer = Ts2hx.timeouts.get(Std.int(timeoutId));
    if (timer == null) return;
    timer.stop();
    Ts2hx.timeouts.remove(Std.int(timeoutId));
  }

  static var intervalCounter = 0;
  static var intervals: IntMap<Timer> = new IntMap();

  static public function setInterval(cb: () -> Void, ms: Float = 0): Int {
    var intervalId = Ts2hx.intervalCounter;

    function recursiveCallback() {
      cb();
      Ts2hx.intervals.set(intervalId, Timer.delay(recursiveCallback, Std.int(ms)));
    };
    var timer = Timer.delay(recursiveCallback, Std.int(ms));
    Ts2hx.intervals.set(intervalId, timer);

    return Ts2hx.intervalCounter++;
  }

  static public function clearInterval(intervalId: Float): Void {
    var timer = Ts2hx.intervals.get(Std.int(intervalId));
    if (timer == null) return;
    timer.stop();
    Ts2hx.intervals.remove(Std.int(intervalId));
  }
}
