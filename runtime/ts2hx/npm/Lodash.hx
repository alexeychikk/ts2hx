package ts2hx.npm;

import ts2hx.Dict;
import ts2hx.JsArray;
import ts2hx.Ts2hx;

/**
 * Cross-target port of the lodash functions TS projects use most. Iteratees are
 * `Dynamic` (a function or a property-name shorthand); the frontend pads function
 * literals to the arity lodash calls them with, so dynamic calls match on every target.
 */
class Lodash {
	static function iteratee1(iteratee:Dynamic, value:Dynamic):Dynamic {
		if (iteratee == null)
			return value;
		if (Std.isOfType(iteratee, String))
			return Reflect.field(value, iteratee);
		return iteratee(value);
	}

	static function iteratee3(iteratee:Dynamic, value:Dynamic, key:Dynamic, collection:Dynamic):Dynamic {
		if (iteratee == null)
			return value;
		if (Std.isOfType(iteratee, String))
			return Reflect.field(value, iteratee);
		return iteratee(value, key, collection);
	}

	static function compareValues(a:Dynamic, b:Dynamic):Int {
		if (a == b)
			return 0;
		if (a == null)
			return 1;
		if (b == null)
			return -1;
		if (Std.isOfType(a, String) && Std.isOfType(b, String))
			return (a : String) < (b : String) ? -1 : 1;
		var x:Float = a;
		var y:Float = b;
		if (Math.isNaN(x))
			return Math.isNaN(y) ? 0 : 1;
		if (Math.isNaN(y))
			return -1;
		return x < y ? -1 : x > y ? 1 : 0;
	}

	static function sameValueZero(a:Dynamic, b:Dynamic):Bool {
		if (Std.isOfType(a, Float) && Std.isOfType(b, Float)) {
			var x:Float = a;
			var y:Float = b;
			return x == y || (Math.isNaN(x) && Math.isNaN(y));
		}
		return a == b;
	}

	static function indexOf<T>(array:Array<T>, value:T):Int {
		for (i in 0...array.length)
			if (sameValueZero(array[i], value))
				return i;
		return -1;
	}


	public static function chunk<T>(array:Array<T>, ?size:Float):Array<Array<T>> {
		var step = size == null ? 1 : Std.int(size);
		var result:Array<Array<T>> = [];
		if (array == null || step < 1)
			return result;
		var i = 0;
		while (i < array.length) {
			result.push(array.slice(i, i + step));
			i += step;
		}
		return result;
	}

	public static function first<T>(array:Array<T>):Null<T> {
		return array == null || array.length == 0 ? null : array[0];
	}

	public static function head<T>(array:Array<T>):Null<T> {
		return first(array);
	}

	public static function last<T>(array:Array<T>):Null<T> {
		return array == null || array.length == 0 ? null : array[array.length - 1];
	}

	public static function compact<T>(array:Array<T>):Array<T> {
		return array == null ? [] : [
			for (value in array)
				if (Ts2hx.truthy(value)) value
		];
	}

	public static function uniq<T>(array:Array<T>):Array<T> {
		return uniqBy(array, null);
	}

	public static function uniqBy<T>(array:Array<T>, iteratee:Dynamic):Array<T> {
		var result:Array<T> = [];
		var seen:Array<Dynamic> = [];
		if (array == null)
			return result;
		for (value in array) {
			var key = iteratee1(iteratee, value);
			if (indexOf(seen, key) == -1) {
				seen.push(key);
				result.push(value);
			}
		}
		return result;
	}

	public static function without<T>(array:Array<T>, ...values:T):Array<T> {
		var excluded = [for (item in values) item];
		return array == null ? [] : [
			for (value in array)
				if (indexOf(excluded, value) == -1) value
		];
	}

	public static function difference<T>(array:Array<T>, ...others:Array<T>):Array<T> {
		var excluded:Array<T> = [];
		for (other in others)
			excluded = excluded.concat(other);
		return array == null ? [] : [
			for (value in array)
				if (indexOf(excluded, value) == -1) value
		];
	}

	public static function dropRight<T>(array:Array<T>, ?n:Float):Array<T> {
		var count = n == null ? 1 : Std.int(Math.max(0, n));
		return array == null ? [] : array.slice(0, Std.int(Math.max(0, array.length - count)));
	}

	public static function pull<T>(array:Array<T>, ...values:T):Array<T> {
		var excluded = [for (item in values) item];
		var i = 0;
		while (i < array.length) {
			if (indexOf(excluded, array[i]) != -1)
				array.splice(i, 1);
			else
				i++;
		}
		return array;
	}

	public static function remove<T>(array:Array<T>, predicate:Dynamic):Array<T> {
		var removed:Array<T> = [];
		var kept:Array<T> = [];
		for (i in 0...array.length) {
			if (Ts2hx.truthy(iteratee3(predicate, array[i], i * 1.0, array)))
				removed.push(array[i]);
			else
				kept.push(array[i]);
		}
		array.splice(0, array.length);
		for (value in kept)
			array.push(value);
		return removed;
	}

	public static function times<R>(n:Float, iteratee:Dynamic):Array<R> {
		var result:Array<R> = [];
		for (i in 0...Std.int(Math.max(0, n)))
			result.push(iteratee == null ? cast(i * 1.0) : iteratee(i * 1.0));
		return result;
	}


	public static function forEach<T>(array:Array<T>, iteratee:Dynamic):Array<T> {
		if (array != null)
			for (i in 0...array.length)
				if (iteratee3(iteratee, array[i], i * 1.0, array) == false)
					break;
		return array;
	}

	public static function map<T, R>(array:Array<T>, iteratee:Dynamic):Array<R> {
		var result:Array<R> = [];
		if (array != null)
			for (i in 0...array.length)
				result.push(iteratee3(iteratee, array[i], i * 1.0, array));
		return result;
	}

	public static function filter<T>(array:Array<T>, predicate:Dynamic):Array<T> {
		var result:Array<T> = [];
		if (array != null)
			for (i in 0...array.length)
				if (Ts2hx.truthy(iteratee3(predicate, array[i], i * 1.0, array)))
					result.push(array[i]);
		return result;
	}

	public static function find<T>(array:Array<T>, predicate:Dynamic):Null<T> {
		if (array != null)
			for (i in 0...array.length)
				if (Ts2hx.truthy(iteratee3(predicate, array[i], i * 1.0, array)))
					return array[i];
		return null;
	}

	public static function some<T>(array:Array<T>, predicate:Dynamic):Bool {
		return find(array, predicate) != null;
	}

	public static function flatMap<T, R>(array:Array<T>, iteratee:Dynamic):Array<R> {
		var result:Array<R> = [];
		if (array != null)
			for (i in 0...array.length) {
				var mapped:Dynamic = iteratee3(iteratee, array[i], i * 1.0, array);
				if (Std.isOfType(mapped, Array))
					for (item in (mapped : Array<Dynamic>))
						result.push(item);
				else
					result.push(mapped);
			}
		return result;
	}

	public static function sum(array:Array<Float>):Float {
		return sumBy(array, null);
	}

	public static function sumBy<T>(array:Array<T>, iteratee:Dynamic):Float {
		var total = 0.0;
		if (array != null)
			for (value in array)
				total += (iteratee1(iteratee, value) : Float);
		return total;
	}

	public static function minBy<T>(array:Array<T>, iteratee:Dynamic):Null<T> {
		return extremumBy(array, iteratee, -1);
	}

	public static function maxBy<T>(array:Array<T>, iteratee:Dynamic):Null<T> {
		return extremumBy(array, iteratee, 1);
	}

	static function extremumBy<T>(array:Array<T>, iteratee:Dynamic, sign:Int):Null<T> {
		var best:Null<T> = null;
		var bestKey:Dynamic = null;
		if (array != null)
			for (value in array) {
				var key = iteratee1(iteratee, value);
				if (key != null && (bestKey == null || compareValues(key, bestKey) * sign > 0)) {
					best = value;
					bestKey = key;
				}
			}
		return best;
	}

	public static function sortBy<T>(array:Array<T>, ?iteratees:Dynamic):Array<T> {
		var list:Array<Dynamic> = iteratees == null ? [null] : Std.isOfType(iteratees, Array) ? iteratees : [iteratees];
		return orderBy(array, list, [for (_ in list) "asc"]);
	}

	public static function orderBy<T>(array:Array<T>, ?iteratees:Dynamic, ?orders:Dynamic):Array<T> {
		if (array == null)
			return [];
		var list:Array<Dynamic> = iteratees == null ? [null] : Std.isOfType(iteratees, Array) ? iteratees : [iteratees];
		var directions:Array<Dynamic> = orders == null ? [] : Std.isOfType(orders, Array) ? orders : [orders];
		var keyed = [
			for (i in 0...array.length)
				{
					index: i,
					value: array[i],
					keys: [
						for (it in list)
							iteratee1(it, array[i])
					]
				}
		];
		haxe.ds.ArraySort.sort(keyed, (a, b) -> {
			for (k in 0...list.length) {
				var order = compareValues(a.keys[k], b.keys[k]);
				if (order != 0)
					return directions[k] == "desc" ? -order : order;
			}
			return a.index - b.index;
		});
		return [for (entry in keyed) entry.value];
	}

	public static function groupBy<T>(array:Array<T>, ?iteratee:Dynamic):Dict<Array<T>> {
		var result = new Dict<Array<T>>();
		if (array != null)
			for (value in array) {
				var key = Ts2hx.string(iteratee1(iteratee, value));
				var group = result.get(key);
				if (group == null)
					result.set(key, [value]);
				else
					group.push(value);
			}
		return result;
	}

	public static function keyBy<T>(array:Array<T>, ?iteratee:Dynamic):Dict<T> {
		var result = new Dict<T>();
		if (array != null)
			for (value in array)
				result.set(Ts2hx.string(iteratee1(iteratee, value)), value);
		return result;
	}


	static function keysOf(object:Dynamic):Array<String> {
		if (object == null)
			return [];
		if (Std.isOfType(object, Dict))
			return (object : Dict<Dynamic>).keys();
		return Reflect.fields(object);
	}

	static function read(object:Dynamic, key:String):Dynamic {
		return Std.isOfType(object, Dict) ? (object : Dict<Dynamic>).get(key) : Reflect.field(object, key);
	}

	static function names(paths:Array<Dynamic>):Array<String> {
		var result:Array<String> = [];
		for (path in paths) {
			if (Std.isOfType(path, Array))
				result = result.concat(names(path));
			else
				result.push(Ts2hx.string(path));
		}
		return result;
	}

	static function copyWhere(object:Dynamic, keep:(String, Dynamic) -> Bool):Dynamic {
		var keys = keysOf(object);
		if (Std.isOfType(object, Dict)) {
			var dict = new Dict<Dynamic>();
			for (key in keys)
				if (keep(key, read(object, key)))
					dict.set(key, read(object, key));
			return dict;
		}
		var result = {};
		for (key in keys)
			if (keep(key, read(object, key)))
				Reflect.setField(result, key, read(object, key));
		return result;
	}

	public static function pick(object:Dynamic, ...paths:Dynamic):Dynamic {
		var keys = names([for (item in paths) item]);
		return copyWhere(object, (key, _) -> keys.indexOf(key) != -1);
	}

	public static function omit(object:Dynamic, ...paths:Dynamic):Dynamic {
		var keys = names([for (item in paths) item]);
		return copyWhere(object, (key, _) -> keys.indexOf(key) == -1);
	}

	public static function pickBy(object:Dynamic, ?predicate:Dynamic):Dynamic {
		return copyWhere(object, (key, value) -> Ts2hx.truthy(predicate == null ? value : predicate(value, key)));
	}

	public static function omitBy(object:Dynamic, ?predicate:Dynamic):Dynamic {
		return copyWhere(object, (key, value) -> !Ts2hx.truthy(predicate == null ? value : predicate(value, key)));
	}

	public static function mapValues(object:Dynamic, ?iteratee:Dynamic):Dynamic {
		var keys = keysOf(object);
		if (Std.isOfType(object, Dict)) {
			var dict = new Dict<Dynamic>();
			for (key in keys)
				dict.set(key, iteratee3(iteratee, read(object, key), key, object));
			return dict;
		}
		var result = {};
		for (key in keys)
			Reflect.setField(result, key, iteratee3(iteratee, read(object, key), key, object));
		return result;
	}

	public static function isEmpty(value:Dynamic):Bool {
		if (value == null)
			return true;
		if (Std.isOfType(value, String))
			return (value : String).length == 0;
		if (Std.isOfType(value, Array))
			return (value : Array<Dynamic>).length == 0;
		if (Std.isOfType(value, Float) || Std.isOfType(value, Bool))
			return true;
		return keysOf(value).length == 0;
	}

	public static function isEqual(a:Dynamic, b:Dynamic):Bool {
		if (sameValueZero(a, b))
			return true;
		if (a == null || b == null)
			return false;
		if (Std.isOfType(a, Array) || Std.isOfType(b, Array)) {
			if (!Std.isOfType(a, Array) || !Std.isOfType(b, Array))
				return false;
			var x:Array<Dynamic> = a;
			var y:Array<Dynamic> = b;
			if (x.length != y.length)
				return false;
			for (i in 0...x.length)
				if (!isEqual(x[i], y[i]))
					return false;
			return true;
		}
		if (Std.isOfType(a, String) || Std.isOfType(a, Float) || Std.isOfType(a, Bool) || Reflect.isFunction(a))
			return false;
		var keys = keysOf(a);
		if (keys.length != keysOf(b).length)
			return false;
		for (key in keys)
			if (!isEqual(read(a, key), read(b, key)))
				return false;
		return true;
	}

	public static function cloneDeep<T>(value:T):T {
		return cast cloneValue(value);
	}

	static function cloneValue(value:Dynamic):Dynamic {
		if (value == null || Std.isOfType(value, String) || Std.isOfType(value, Float) || Std.isOfType(value, Bool)
			|| Reflect.isFunction(value))
			return value;
		if (Std.isOfType(value, Array))
			return [for (item in (value : Array<Dynamic>)) cloneValue(item)];
		if (Std.isOfType(value, Dict)) {
			var dict = new Dict<Dynamic>();
			var source:Dict<Dynamic> = value;
			for (key in source.keys())
				dict.set(key, cloneValue(source.get(key)));
			return dict;
		}
		if (Type.getClass(value) != null)
			return value;
		var copy = {};
		for (field in Reflect.fields(value))
			Reflect.setField(copy, field, cloneValue(Reflect.field(value, field)));
		return copy;
	}


	public static function clamp(number:Float, lower:Float, ?upper:Float):Float {
		if (upper == null) {
			upper = lower;
			lower = Math.NEGATIVE_INFINITY;
		}
		return Math.min(Math.max(number, lower), upper);
	}

	public static function noop(...args:Dynamic):Void {}

	public static function identity<T>(value:T):T {
		return value;
	}

	/** Caches results by the first argument (lodash's default resolver). */
	public static function memoize(fn:Dynamic, ?resolver:Dynamic):Dynamic {
		var keys:Array<Dynamic> = [];
		var values:Array<Dynamic> = [];
		return Reflect.makeVarArgs(args -> {
			var key:Dynamic = resolver == null ? args[0] : Reflect.callMethod(null, resolver, args);
			var index = indexOf(keys, key);
			if (index != -1)
				return values[index];
			var result = Reflect.callMethod(null, fn, args);
			keys.push(key);
			values.push(result);
			return result;
		});
	}

	public static function escapeRegExp(text:String):String {
		var result = new StringBuf();
		for (i in 0...text.length) {
			var char = text.charAt(i);
			if ("^$.*+?()[]{}|\\".indexOf(char) != -1)
				result.add("\\");
			result.add(char);
		}
		return result.toString();
	}

	public static function capitalize(text:String):String {
		return text.length == 0 ? text : text.charAt(0).toUpperCase() + text.substr(1).toLowerCase();
	}
}
