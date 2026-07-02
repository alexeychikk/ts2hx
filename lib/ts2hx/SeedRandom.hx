package ts2hx;

/**
 * Minimal replacement for the seedrandom package: a deterministic
 * Lehmer PRNG seeded by a string. Note that the number sequence differs
 * from the original seedrandom algorithm.
 */
class SeedRandom {
  /** Returns a () -> Float generator producing numbers in [0, 1) */
  public static function seedRandom(?seed: String): Dynamic {
    var state = hash(seed != null ? seed : Std.string(Math.random()));
    return function(): Float {
      state = (state * 48271) % 2147483647;
      return (state - 1) / 2147483646;
    };
  }

  static function hash(seed: String): Float {
    var result: Float = 0;
    for (i in 0...seed.length) {
      result = (result * 31 + seed.charCodeAt(i)) % 2147483647;
    }
    return result <= 0 ? 1 : result;
  }
}
