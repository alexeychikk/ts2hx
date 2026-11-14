package ts2hx;

/** Core helpers the generated code calls with explicit static calls. */
class Ts2hx {
	/** Placeholder for a construct ts2hx cannot convert: always throws when reached. */
	public static function unsupported(message:String):Dynamic {
		throw new haxe.Exception("ts2hx: unsupported: " + message);
	}

	/** Reports an error that escaped the program like Node: message on stderr, exit code 1. */
	public static function uncaught(error:Dynamic):Void {
		var message = Std.isOfType(error, haxe.Exception) ? (error : haxe.Exception).message : string(error);
		#if js
		js.Syntax.code("process.stderr.write({0})", "Uncaught " + message + "\n");
		js.Syntax.code("process.exit(1)");
		#else
		Sys.stderr().writeString("Uncaught " + message + "\n");
		Sys.exit(1);
		#end
	}

	/** JS `String(value)` for primitives; other values fall back to `Std.string`. */
	public static function string(value:Dynamic):String {
		if (value == null)
			return "undefined";
		if (Std.isOfType(value, String))
			return value;
		if (Std.isOfType(value, Bool))
			return value ? "true" : "false";
		if (Std.isOfType(value, Float))
			return Num.toString(value);
		return Std.string(value);
	}
}
