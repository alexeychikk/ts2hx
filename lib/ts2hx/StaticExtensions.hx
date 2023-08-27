package ts2hx;

class StaticExtensions {
  static public function or(value: Any, defaultValue: Any): Any {
    switch (value) {
      case 0, null, "", false, _ == Math.NaN => true:
        return defaultValue;
      case _:
        return value;
    }
  }

  static public function and(value: Any, defaultValue: Any): Any {
    switch (value) {
      case 0, null, "", false, _ == Math.NaN => true:
        return value;
      case _:
        return defaultValue;
    }
  }
}
