package ts2hx;

import haxe.Constraints.Function;

class Ts2hx {
	static public function typeof<T>(value:T):String {
		if (Std.isOfType(value, String))
			return "string";
		if (Std.isOfType(value, Int) || Std.isOfType(value, Float))
			return "number";
		if (Std.isOfType(value, Bool))
			return "boolean";
		if (Std.isOfType(value, Function))
			return "function";
		if (value == null)
			return "undefined";
		return "object";
	}
}
