package ts2hx;

/** Minimal runtime shim for the nanoid package (Math.random based) */
class Nanoid {
  public static final urlAlphabet = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

  public static function nanoid(size: Int = 21): String {
    return generate(urlAlphabet, size, null);
  }

  /** Returns a generator bound to the given alphabet */
  public static function customAlphabet(alphabet: String, defaultSize: Int = 21): Dynamic {
    return function(?size: Int): String {
      return generate(alphabet, size != null ? size : defaultSize, null);
    };
  }

  /**
   * Returns a generator using a custom source of randomness —
   * random(size) must return an (array-like) list of numbers
   */
  public static function customRandom(alphabet: String, size: Int, random: Dynamic): Dynamic {
    return function(): String {
      return generate(alphabet, size, random);
    };
  }

  static function generate(alphabet: String, size: Int, random: Dynamic): String {
    final result = new StringBuf();
    final bytes: Dynamic = random != null ? untyped random(size) : null;
    for (i in 0...size) {
      final byte: Float = bytes != null ? bytes[i] : Math.floor(Math.random() * alphabet.length);
      final index = Std.int(Math.abs(byte)) % alphabet.length;
      result.add(alphabet.charAt(index));
    }
    return result.toString();
  }
}
