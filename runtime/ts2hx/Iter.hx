package ts2hx;

import ts2hx.Error.TypeError;
import ts2hx.Generator.GeneratorCore;

/** A JS iterable or iterator of `T`: generators, project classes with `[Symbol.iterator]()`, iterator objects. */
abstract JsIterable<T>(Dynamic) from Dynamic to Dynamic {
	/** JS `it.next(value)`: `{ value, done }`. */
	public inline function next(?value:Dynamic):Dynamic {
		return Iter.step(this, value);
	}

	/** The values left, as a fresh array (`[...it]`, `Array.from(it)`). */
	public inline function toArray():Array<T> {
		return cast Iter.toArray(this);
	}
}

/** The JS iteration protocol over any iterable (ADR 0005): `for…of`, spread, `yield*`, `Array.from`. */
class Iter {
	/** Haxe name of a `[Symbol.iterator]()` method. */
	public static inline final ITERATOR_METHOD = "__ts2hx_iterator";

	/** A JS iterator result `{ value, done }`, keys in JS order. */
	public static function result(value:Dynamic, done:Bool):Dynamic {
		return Obj.literal({value: value, done: done}, ["value", "done"]);
	}

	/** JS `GetIterator(iterable)`. */
	public static function iterator(iterable:Dynamic):Dynamic {
		if (iterable == null)
			throw new TypeError("undefined is not iterable");
		if (Std.isOfType(iterable, Array))
			return arrayIterator(iterable);
		if (Std.isOfType(iterable, String))
			return arrayIterator(JsString.codePoints(iterable));
		if (Std.isOfType(iterable, JsMap.MapCore))
			return (iterable : JsMap.MapCore).entries();
		if (Std.isOfType(iterable, JsSet.SetCore))
			return (iterable : JsSet.SetCore).map.keys();
		if (Std.isOfType(iterable, GeneratorCore) || Std.isOfType(iterable, JsMap.IteratorCore)
			|| Std.isOfType(iterable, JsArray.ArrayIterator) || Std.isOfType(iterable, RegExp.RegExpStringIterator))
			return iterable;
		var method = Reflect.field(iterable, ITERATOR_METHOD);
		if (method != null)
			return Reflect.callMethod(iterable, method, []);
		if (Reflect.field(iterable, "next") != null)
			return iterable;
		throw new TypeError("object is not iterable");
	}

	static function arrayIterator(array:Array<Dynamic>):Dynamic {
		return new JsArray.ArrayIterator(() -> array.length, i -> array[i]);
	}

	/** JS `iterator.next(value)`. */
	public static function step(iterator:Dynamic, ?value:Dynamic):Dynamic {
		if (Std.isOfType(iterator, GeneratorCore))
			return (iterator : GeneratorCore).next(value);
		var next = Reflect.field(iterator, "next");
		if (next == null)
			throw new TypeError("iterator.next is not a function");
		var result:Dynamic = Reflect.callMethod(iterator, next, value == null ? [] : [value]);
		if (result == null || Std.isOfType(result, Bool) || Std.isOfType(result, Float) || Std.isOfType(result, String))
			throw new TypeError("Iterator result " + Ts2hx.string(result) + " is not an object");
		return result;
	}

	/** JS `IteratorClose`: `iterator.return()` when it has one (loops left early). */
	public static function close(iterator:Dynamic):Void {
		if (Std.isOfType(iterator, GeneratorCore)) {
			(iterator : GeneratorCore).doReturn();
			return;
		}
		var method = Reflect.field(iterator, "return_");
		if (method != null)
			Reflect.callMethod(iterator, method, []);
	}

	/** Whether a step of `step` ended the iteration. */
	public static inline function done(result:Dynamic):Bool {
		return result.done == true;
	}

	/** The values an iterable yields, as a fresh array. */
	public static function toArray(iterable:Dynamic):Array<Dynamic> {
		if (Std.isOfType(iterable, Array))
			return (iterable : Array<Dynamic>).copy();
		var source = iterator(iterable);
		var values:Array<Dynamic> = [];
		while (true) {
			var result:Dynamic = step(source);
			if (done(result))
				return values;
			values.push(result.value);
		}
	}
}
