package ts2hx;

/** `Array.prototype` methods with JS semantics; callbacks get `(value, index, array)`. */
class JsArray {
	public static function push<T>(array:Array<T>, ...values:T):Float {
		for (value in values) {
			array.push(value);
		}
		return array.length;
	}

	public static function map<T, S>(array:Array<T>, callback:(T, Float, Array<T>) -> S):Array<S> {
		return [for (i in 0...array.length) callback(array[i], i, array)];
	}

	public static function reduce<T, A>(array:Array<T>, callback:(A, T, Float, Array<T>) -> A, initial:A):A {
		var accumulator = initial;
		for (i in 0...array.length) {
			accumulator = callback(accumulator, array[i], i, array);
		}
		return accumulator;
	}

	/** JS `join`: `null` elements are empty, everything else goes through `String()`. */
	public static function join<T>(array:Array<T>, ?separator:String):String {
		var parts = [];
		for (value in array) {
			var element:Dynamic = value;
			parts.push(element == null ? "" : Ts2hx.string(element));
		}
		return parts.join(separator == null ? "," : separator);
	}
}
