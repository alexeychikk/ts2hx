package ts2hx;

class Ts2hx {
	static public function typeof<T>(value:T):String {
		switch (Type.typeof(value)) {
			case TInt, TFloat, TEnum(_):
				return "number";
			case TBool:
				return "boolean";
			case TClass(String):
				return "string";
			case TFunction:
				return "function";
			case TNull:
				// In JS `typeof null === "object"` but since there is no `undefined`
				// in Haxe, we convert JS's `undefined` to Haxe's `null`.
				return "undefined";
			case _:
				if (Type.getClassName((value : Dynamic)) != null)
					return "function";
				return "object";
		}
	}
}
