package ts2hx;

/**
 * `Array.prototype` methods and `Array` statics with JS semantics (ADR 0005).
 * Callbacks get `(value, index, array)`; indices and lengths are `Float` like JS numbers.
 */
class JsArray {
	/** `new Array(n)` / `Array(n)`: `n` empty slots, read as the element type's default (ADR 0002). */
	public static function ofLength<T>(length:Float):Array<T> {
		var n = Std.int(length);
		if (n != length || n < 0)
			throw new haxe.Exception("RangeError: Invalid array length");
		var array:Array<T> = [];
		array.resize(n);
		return array;
	}

	/** `a.length = n`: truncates or grows with empty slots; evaluates to `n`. */
	public static function setLength<T>(array:Array<T>, length:Float):Float {
		var n = Std.int(length);
		if (n != length || n < 0)
			throw new haxe.Exception("RangeError: Invalid array length");
		array.resize(n);
		return length;
	}

	public static function push<T>(array:Array<T>, ...values:T):Float {
		for (value in values)
			array.push(value);
		return array.length;
	}

	public static function pop<T>(array:Array<T>):Null<T> {
		return array.length == 0 ? null : array.pop();
	}

	public static function shift<T>(array:Array<T>):Null<T> {
		return array.length == 0 ? null : array.shift();
	}

	public static function unshift<T>(array:Array<T>, ...values:T):Float {
		var i = values.length;
		while (--i >= 0)
			array.unshift(values[i]);
		return array.length;
	}

	public static function at<T>(array:Array<T>, ?index:Float):Null<T> {
		var k = integerOf(index);
		if (k < 0)
			k += array.length;
		return k < 0 || k >= array.length ? null : array[Std.int(k)];
	}

	public static function concat<T>(array:Array<T>, ...items:Array<T>):Array<T> {
		var result = array.copy();
		for (item in items)
			for (value in item)
				result.push(value);
		return result;
	}

	public static function slice<T>(array:Array<T>, ?start:Float, ?end:Float):Array<T> {
		var from = relative(start, array.length, 0);
		var to = relative(end, array.length, array.length);
		return from >= to ? [] : array.slice(from, to);
	}

	public static function splice<T>(array:Array<T>, ?start:Float, ?deleteCount:Float, ...items:T):Array<T> {
		var from = start == null ? array.length : relative(start, array.length, 0);
		var count = start == null ? 0 : deleteCount == null ? array.length - from : clamp(integerOf(deleteCount), array.length - from);
		var removed = array.splice(from, count);
		var i = items.length;
		while (--i >= 0)
			array.insert(from, items[i]);
		return removed;
	}

	public static function reverse<T>(array:Array<T>):Array<T> {
		array.reverse();
		return array;
	}

	public static function fill<T>(array:Array<T>, value:T, ?start:Float, ?end:Float):Array<T> {
		for (i in relative(start, array.length, 0)...relative(end, array.length, array.length))
			array[i] = value;
		return array;
	}

	public static function copyWithin<T>(array:Array<T>, target:Float, ?start:Float, ?end:Float):Array<T> {
		var length = array.length;
		var to = relative(target, length, 0);
		var from = relative(start, length, 0);
		var count = Std.int(Math.min(relative(end, length, length) - from, length - to));
		if (count > 0) {
			var values = array.slice(from, from + count);
			for (i in 0...count)
				array[to + i] = values[i];
		}
		return array;
	}

	public static function indexOf<T>(array:Array<T>, search:T, ?fromIndex:Float):Float {
		for (i in relative(fromIndex, array.length, 0)...array.length)
			if (strictEquals(array[i], search))
				return i;
		return -1;
	}

	public static function lastIndexOf<T>(array:Array<T>, search:T, ?fromIndex:Float):Float {
		var length = array.length;
		var start = fromIndex == null ? length - 1 : integerOf(fromIndex);
		if (start < 0)
			start += length;
		if (start < 0)
			return -1;
		var i = Std.int(Math.min(start, length - 1));
		while (i >= 0) {
			if (strictEquals(array[i], search))
				return i;
			i--;
		}
		return -1;
	}

	/** SameValueZero: unlike `indexOf`, finds `NaN`. */
	public static function includes<T>(array:Array<T>, search:T, ?fromIndex:Float):Bool {
		var searchNaN = isNaN(search);
		for (i in relative(fromIndex, array.length, 0)...array.length)
			if (strictEquals(array[i], search) || (searchNaN && isNaN(array[i])))
				return true;
		return false;
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

	public static function toString<T>(array:Array<T>):String {
		return join(array, ",");
	}

	public static function forEach<T>(array:Array<T>, callback:(T, Float, Array<T>) -> Void):Void {
		for (i in 0...array.length)
			if (i < array.length)
				callback(array[i], i, array);
	}

	public static function map<T, S>(array:Array<T>, callback:(T, Float, Array<T>) -> S):Array<S> {
		var length = array.length;
		var result:Array<S> = [];
		for (i in 0...length)
			result.push(i < array.length ? callback(array[i], i, array) : null);
		return result;
	}

	public static function filter<T>(array:Array<T>, predicate:(T, Float, Array<T>) -> Bool):Array<T> {
		var result = [];
		for (i in 0...array.length) {
			if (i >= array.length)
				break;
			var value = array[i];
			if (predicate(value, i, array))
				result.push(value);
		}
		return result;
	}

	public static function every<T>(array:Array<T>, predicate:(T, Float, Array<T>) -> Bool):Bool {
		for (i in 0...array.length)
			if (i < array.length && !predicate(array[i], i, array))
				return false;
		return true;
	}

	public static function some<T>(array:Array<T>, predicate:(T, Float, Array<T>) -> Bool):Bool {
		for (i in 0...array.length)
			if (i < array.length && predicate(array[i], i, array))
				return true;
		return false;
	}

	public static function find<T>(array:Array<T>, predicate:(T, Float, Array<T>) -> Bool):Null<T> {
		var i = findIndex(array, predicate);
		return i < 0 ? null : array[Std.int(i)];
	}

	public static function findIndex<T>(array:Array<T>, predicate:(T, Float, Array<T>) -> Bool):Float {
		for (i in 0...array.length)
			if (predicate(array[i], i, array))
				return i;
		return -1;
	}

	public static function findLast<T>(array:Array<T>, predicate:(T, Float, Array<T>) -> Bool):Null<T> {
		var i = findLastIndex(array, predicate);
		return i < 0 ? null : array[Std.int(i)];
	}

	public static function findLastIndex<T>(array:Array<T>, predicate:(T, Float, Array<T>) -> Bool):Float {
		var i = array.length;
		while (--i >= 0)
			if (predicate(array[i], i, array))
				return i;
		return -1;
	}

	public static function reduce<T, A>(array:Array<T>, callback:(A, T, Float, Array<T>) -> A, initial:A):A {
		var accumulator = initial;
		for (i in 0...array.length)
			if (i < array.length)
				accumulator = callback(accumulator, array[i], i, array);
		return accumulator;
	}

	/** `reduce` without an initial value: starts from the first element. */
	public static function reduceFirst<T>(array:Array<T>, callback:(T, T, Float, Array<T>) -> T):T {
		if (array.length == 0)
			throw new haxe.Exception("TypeError: Reduce of empty array with no initial value");
		var accumulator = array[0];
		for (i in 1...array.length)
			if (i < array.length)
				accumulator = callback(accumulator, array[i], i, array);
		return accumulator;
	}

	public static function reduceRight<T, A>(array:Array<T>, callback:(A, T, Float, Array<T>) -> A, initial:A):A {
		var accumulator = initial;
		var i = array.length;
		while (--i >= 0)
			accumulator = callback(accumulator, array[i], i, array);
		return accumulator;
	}

	/** `reduceRight` without an initial value: starts from the last element. */
	public static function reduceRightFirst<T>(array:Array<T>, callback:(T, T, Float, Array<T>) -> T):T {
		if (array.length == 0)
			throw new haxe.Exception("TypeError: Reduce of empty array with no initial value");
		var i = array.length - 1;
		var accumulator = array[i];
		while (--i >= 0)
			accumulator = callback(accumulator, array[i], i, array);
		return accumulator;
	}

	/** Stable merge sort; without a comparator, elements compare as strings by code units and `undefined` goes last. */
	public static function sort<T>(array:Array<T>, ?compare:(T, T) -> Float):Array<T> {
		var defined:Array<T> = [];
		var undefinedCount = 0;
		for (value in array) {
			var element:Dynamic = value;
			if (element == null)
				undefinedCount++;
			else
				defined.push(value);
		}
		var before:(T, T) -> Bool = compare == null ? (a, b) -> stringAfter(Ts2hx.string(a), Ts2hx.string(b)) : (a, b) -> compare(a,
			b) > 0;
		var sorted = mergeSort(defined, before);
		for (i in 0...sorted.length)
			array[i] = sorted[i];
		for (i in sorted.length...array.length)
			array[i] = null;
		return array;
	}

	/** `flat(depth)`: nested arrays are spliced in up to `depth` levels. */
	public static function flat<T, S>(array:Array<T>, ?depth:Float):Array<S> {
		var result:Array<Dynamic> = [];
		flatten(result, array, depth == null ? 1 : integerOf(depth));
		var typed:Array<S> = [];
		for (value in result)
			typed.push(value);
		return typed;
	}

	public static function flatMap<T, S>(array:Array<T>, callback:(T, Float, Array<T>) -> Dynamic):Array<S> {
		var result:Array<S> = [];
		for (i in 0...array.length) {
			var value:Dynamic = callback(array[i], i, array);
			if (Std.isOfType(value, Array))
				for (element in (value : Array<Dynamic>))
					result.push(element);
			else
				result.push(value);
		}
		return result;
	}

	public static function entries<T>(array:Array<T>):ArrayIterator<Array<Dynamic>> {
		return new ArrayIterator(() -> array.length, i -> ([(i : Float), array[i]] : Array<Dynamic>));
	}

	public static function keys<T>(array:Array<T>):ArrayIterator<Float> {
		return new ArrayIterator(() -> array.length, i -> (i : Float));
	}

	public static function values<T>(array:Array<T>):ArrayIterator<T> {
		return new ArrayIterator(() -> array.length, i -> array[i]);
	}

	/** `Array.from(array, mapFn)`: a copy, mapped with `(value, index)`. */
	public static function from<T, S>(source:Array<T>, ?mapFn:(T, Float) -> S):Array<S> {
		var result:Array<S> = [];
		for (i in 0...source.length) {
			var value:Dynamic = source[i];
			result.push(mapFn == null ? value : mapFn(value, i));
		}
		return result;
	}

	/** `Array.from({ length }, mapFn)`: an array-like object read by index. */
	public static function fromArrayLike<S>(source:Dynamic, ?mapFn:(Dynamic, Float) -> S):Array<S> {
		var length = Reflect.field(source, "length");
		var n = length == null ? 0 : Std.int(Math.max(0, integerOf(length)));
		var result:Array<S> = [];
		for (i in 0...n) {
			var value:Dynamic = Reflect.field(source, Std.string(i));
			result.push(mapFn == null ? value : mapFn(value, i));
		}
		return result;
	}

	/** Wraps a callback whose result JS tests for truthiness. */
	public static function truthyCallback<T, R>(callback:(T, Float, Array<T>) -> R):(T, Float, Array<T>) -> Bool {
		return (value, index, array) -> Ts2hx.truthy(callback(value, index, array));
	}

	static function flatten(result:Array<Dynamic>, array:Array<Dynamic>, depth:Float):Void {
		for (value in array) {
			if (depth >= 1 && Std.isOfType(value, Array))
				flatten(result, value, depth - 1);
			else
				result.push(value);
		}
	}

	static function mergeSort<T>(values:Array<T>, before:(T, T) -> Bool):Array<T> {
		if (values.length <= 1)
			return values;
		var middle = values.length >> 1;
		var left = mergeSort(values.slice(0, middle), before);
		var right = mergeSort(values.slice(middle), before);
		var result:Array<T> = [];
		var i = 0;
		var j = 0;
		while (i < left.length && j < right.length)
			result.push(before(left[i], right[j]) ? right[j++] : left[i++]);
		while (i < left.length)
			result.push(left[i++]);
		while (j < right.length)
			result.push(right[j++]);
		return result;
	}

	static function stringAfter(a:String, b:String):Bool {
		#if js
		return a > b;
		#else
		return JsString.compareUnits(a, b) > 0;
		#end
	}

	static function strictEquals(a:Dynamic, b:Dynamic):Bool {
		if (a == null || b == null)
			return a == null && b == null;
		if (Std.isOfType(a, Float) && Std.isOfType(b, Float))
			return (a : Float) == (b : Float);
		if (Std.isOfType(a, String) && Std.isOfType(b, String))
			return (a : String) == (b : String);
		if (Std.isOfType(a, Bool) && Std.isOfType(b, Bool))
			return (a : Bool) == (b : Bool);
		return a == b;
	}

	static function isNaN(value:Dynamic):Bool {
		return value != null && Std.isOfType(value, Float) && Math.isNaN(value);
	}

	static function integerOf(value:Null<Float>):Float {
		if (value == null)
			return 0;
		var v:Float = value;
		if (Math.isNaN(v))
			return 0;
		if (!Math.isFinite(v))
			return v;
		return v < 0 ? Math.fceil(v) : Math.ffloor(v);
	}

	static function clamp(value:Float, max:Int):Int {
		return value < 0 ? 0 : value > max ? max : Std.int(value);
	}

	/** A relative index (negative counts from the end) clamped to `[0, length]`. */
	static function relative(value:Null<Float>, length:Int, fallback:Int):Int {
		if (value == null)
			return fallback;
		var k = integerOf(value);
		return clamp(k < 0 ? k + length : k, length);
	}
}

/** The iterator `entries`/`keys`/`values` return: the JS iterator protocol over a live array. */
class ArrayIterator<T> {
	final length:() -> Int;
	final get:Int->T;
	var index = 0;

	public function new(length:() -> Int, get:Int->T) {
		this.length = length;
		this.get = get;
	}

	public function next():{done:Bool, value:Null<T>} {
		if (index >= length())
			return {done: true, value: null};
		return {done: false, value: get(index++)};
	}
}
