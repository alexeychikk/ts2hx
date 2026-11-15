package ts2hx;

import ts2hx.JsMap.JsIterator;
import ts2hx.JsMap.MapCore;

/** JS `Set<T>`: a `MapCore` holding each value under itself; an abstract like `JsMap`. */
abstract JsSet<T>(SetCore) from SetCore to SetCore {
	public var size(get, never):Int;

	public inline function new(?values:Array<T>) {
		this = new SetCore();
		if (values != null)
			for (value in values)
				this.map.set(value, value);
	}

	inline function get_size():Int {
		return this.map.size;
	}

	/** JS `s.add(value)`: returns the set. */
	public inline function add(value:T):JsSet<T> {
		this.map.set(value, value);
		return cast this;
	}

	public inline function has(value:T):Bool {
		return this.map.has(value);
	}

	public inline function delete(value:T):Bool {
		return this.map.delete(value);
	}

	public inline function clear():Void {
		this.map.clear();
	}

	/** JS `s.forEach((value, value2, set) => …)`. */
	public inline function forEach(callback:(T, T, JsSet<T>) -> Void):Void {
		this.map.forEach(this, cast callback);
	}

	public inline function values():JsIterator<T> {
		return this.map.values();
	}

	public inline function keys():JsIterator<T> {
		return this.map.values();
	}

	/** JS `s.entries()`: `[value, value]` pairs. */
	public inline function entries():JsIterator<Array<Dynamic>> {
		return this.map.entries();
	}
}

/** The untyped set behind `JsSet<T>`. */
class SetCore {
	public final map = new MapCore();

	public function new() {}
}
