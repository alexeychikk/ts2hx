package ts2hx.npm;

/** Cross-target port of nanoid's API; ids come from `Math.random`, not a CSPRNG. */
class Nanoid {
	public static final urlAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

	public static function nanoid(?size:Float):String {
		return generate(urlAlphabet, size == null ? 21 : Std.int(size));
	}

	/** A generator `(size?) => string` over `alphabet`. */
	public static function customAlphabet(alphabet:String, ?defaultSize:Float):Dynamic {
		var fallback = defaultSize == null ? 21 : Std.int(defaultSize);
		return Reflect.makeVarArgs(args -> generate(alphabet, args.length > 0 && args[0] != null ? Std.int(args[0]) : fallback));
	}

	/** A generator using `random(bytes)` as its source of random bytes. */
	public static function customRandom(alphabet:String, size:Float, random:Dynamic):Dynamic {
		return Reflect.makeVarArgs(_ -> {
			var count = Std.int(size);
			var bytes:Array<Dynamic> = random(count * 1.0);
			var result = new StringBuf();
			for (i in 0...count)
				result.add(alphabet.charAt(Std.int(Math.abs(bytes[i])) % alphabet.length));
			return result.toString();
		});
	}

	static function generate(alphabet:String, size:Int):String {
		var result = new StringBuf();
		for (_ in 0...size)
			result.add(alphabet.charAt(Std.int(Math.random() * alphabet.length)));
		return result.toString();
	}
}
