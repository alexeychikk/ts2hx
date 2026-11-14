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
		return Std.isOfType(value, String) ? value : inspectNested(value);
	}

	/** Node `util.inspect` of a value: single-line arrays and plain objects, quoted strings. */
	static function inspectNested(value:Dynamic):String {
		if (Std.isOfType(value, String))
			return "'" + value + "'";
		if (Std.isOfType(value, Array)) {
			var array:Array<Dynamic> = value;
			return array.length == 0 ? "[]" : "[ " + [for (element in array) inspectNested(element)].join(", ") + " ]";
		}
		if (Reflect.isFunction(value))
			return "[Function (anonymous)]";
		if (value != null && Reflect.isObject(value) && Type.getClass(value) == null && !Std.isOfType(value, Bool)
			&& !Std.isOfType(value, Float)) {
			var fields = Reflect.fields(value);
			return fields.length == 0 ? "{}" : "{ " + [for (field in fields) field + ": " + inspectNested(Reflect.field(value, field))].join(", ") + " }";
		}
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
