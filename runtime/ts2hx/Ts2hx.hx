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

	/** Copies the fields of `source` onto `target`, like a spread of a value whose type is not known statically. */
	public static function assign(target:Dynamic, source:Dynamic):Void {
		if (source == null)
			return;
		for (field in Reflect.fields(source))
			Reflect.setField(target, field, Reflect.field(source, field));
	}

	/** JS `o[key] = value` for a computed key: runs a setter and evaluates to `value`. */
	public static function setProperty<T>(o:Dynamic, key:String, value:T):T {
		Reflect.setProperty(o, key, value);
		return value;
	}

	/** JS `String(value)`; `null` reads as `undefined` (ADR 0002 merges them). */
	public static function string(value:Dynamic):String {
		if (value == null)
			return "undefined";
		if (Std.isOfType(value, String))
			return value;
		if (Std.isOfType(value, Bool))
			return value ? "true" : "false";
		if (Std.isOfType(value, Float))
			return Num.toString(value);
		if (Std.isOfType(value, Array))
			return JsArray.join(value, ",");
		if (Reflect.isFunction(value))
			return "function () { [native code] }";
		if (Reflect.isObject(value) && Type.getClass(value) == null)
			return "[object Object]";
		return Std.string(value);
	}

	/** JS truthiness of a value whose static type is not known. */
	public static function truthy(value:Dynamic):Bool {
		if (value == null)
			return false;
		if (Std.isOfType(value, Bool))
			return value;
		if (Std.isOfType(value, Float))
			return Num.truthy(value);
		if (Std.isOfType(value, String))
			return (value : String).length > 0;
		return true;
	}

	/** JS truthiness of a string: neither `undefined` nor empty. */
	public static function truthyString(value:Null<String>):Bool {
		return value != null && value.length > 0;
	}

	/** JS `typeof` of a value whose static type is not known; `null` reads as `undefined`. */
	public static function typeOf(value:Dynamic):String {
		if (value == null)
			return "undefined";
		if (Std.isOfType(value, Bool))
			return "boolean";
		if (Std.isOfType(value, Float))
			return "number";
		if (Std.isOfType(value, String))
			return "string";
		if (Reflect.isFunction(value))
			return "function";
		return "object";
	}

	/** JS loose equality `a == b` for primitives; objects compare by identity. */
	public static function looseEq(a:Dynamic, b:Dynamic):Bool {
		if (a == null || b == null)
			return a == null && b == null;
		if (Std.isOfType(a, Bool))
			return looseEq(a ? 1.0 : 0.0, b);
		if (Std.isOfType(b, Bool))
			return looseEq(a, b ? 1.0 : 0.0);
		var aNumber = Std.isOfType(a, Float);
		var bNumber = Std.isOfType(b, Float);
		if (aNumber && Std.isOfType(b, String))
			return (a : Float) == Num.fromString(b);
		if (bNumber && Std.isOfType(a, String))
			return Num.fromString(a) == (b : Float);
		if (aNumber && bNumber)
			return (a : Float) == (b : Float);
		if (Std.isOfType(a, String) && Std.isOfType(b, String))
			return (a : String) == (b : String);
		return a == b;
	}
}
