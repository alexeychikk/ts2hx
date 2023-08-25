package ts2hx;

class StaticExtensions {
  static public function or<T>(value: T, defaultValue: T): T {
    switch (value) {
      case 0, null, "", false, Math.NaN:
        return defaultValue;
      case _:
        return value;
    }
  }

  static public function and<T>(value: T, nextValue: T): T {
    switch (value) {
      case 0, null, "", false, Math.NaN:
        return value;
      case _:
        return nextValue;
    }
  }
}
