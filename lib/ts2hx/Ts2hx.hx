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

  static var timeoutCounter = 0;
  static var timeouts: IntMap<Timer> = new IntMap();

  static public function setTimeout(cb: () -> Void, ms = 0): Int {
    var timer = Timer.delay(cb, ms);
    Ts2hx.timeouts.set(timeoutCounter, timer);
    return Ts2hx.timeoutCounter++;
  }

  static public function clearTimeout(timeoutId: Int): Void {
    var timer = Ts2hx.timeouts.get(timeoutId);
    if (timer == null) return;
    timer.stop();
    Ts2hx.timeouts.remove(timeoutId);
  }

  static var intervalCounter = 0;
  static var intervals: IntMap<Timer> = new IntMap();

  static public function setInterval(cb: () -> Void, ms = 0): Int {
    var intervalId = Ts2hx.intervalCounter;

    function recursiveCallback() {
      cb();
      Ts2hx.intervals.set(intervalId, Timer.delay(recursiveCallback, ms));
    };
    var timer = Timer.delay(recursiveCallback, ms);
    Ts2hx.intervals.set(intervalId, timer);

    return Ts2hx.intervalCounter++;
  }

  static public function clearInterval(intervalId: Int): Void {
    var timer = Ts2hx.intervals.get(intervalId);
    if (timer == null) return;
    timer.stop();
    Ts2hx.intervals.remove(intervalId);
  }
}
