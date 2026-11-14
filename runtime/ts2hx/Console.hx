package ts2hx;

/** `console.*` output (ADR 0002); v0 prints primitives like Node. */
class Console {
	public static function log(...args:Dynamic):Void {
		writeLine([for (arg in args) inspect(arg)].join(" "));
	}

	/**
	 * Node `util.inspect` of a number: like `Num.toString`, but `-0` keeps its sign.
	 * Called on statically typed numbers, since boxing into `Dynamic` drops the sign on C++.
	 */
	public static function inspectNumber(value:Float):String {
		return value == 0 && 1 / value < 0 ? "-0" : Num.toString(value);
	}

	/** Node `util.inspect` of a top-level argument: strings print raw. */
	static function inspect(value:Dynamic):String {
		return Ts2hx.string(value);
	}

	static function writeLine(line:String):Void {
		#if js
		js.Syntax.code("process.stdout.write({0})", line + "\n");
		#else
		Sys.println(line);
		#end
	}
}
