package ts2hx;

/**
 * JS `Map<K, V>` (ADR 0002): insertion order and SameValueZero keys (primitives by
 * value, objects by identity, `NaN` equal to itself, `-0` equal to `0`). The same pure
 * Haxe on every target. An abstract over the untyped `MapCore`, so casts between
 * instantiations keep identity (C# would copy a generic class).
 */
abstract JsMap<K, V>(MapCore) from MapCore to MapCore {
	public var size(get, never):Int;

	public inline function new(?entries:Array<Array<Dynamic>>) {
		this = new MapCore();
		if (entries != null)
			for (entry in entries)
				this.set(entry[0], entry[1]);
	}

	inline function get_size():Int {
		return this.size;
	}

	public inline function get(key:K):Null<V> {
		return this.get(key);
	}

	/** JS `m.set(key, value)`: returns the map. */
	public inline function set(key:K, value:V):JsMap<K, V> {
		return this.set(key, value);
	}

	public inline function has(key:K):Bool {
		return this.has(key);
	}

	public inline function delete(key:K):Bool {
		return this.delete(key);
	}

	public inline function clear():Void {
		this.clear();
	}

	public inline function forEach(callback:(V, K, JsMap<K, V>) -> Void):Void {
		this.forEach(this, cast callback);
	}

	public inline function keys():JsIterator<K> {
		return this.keys();
	}

	public inline function values():JsIterator<V> {
		return this.values();
	}

	/** JS `m.entries()` and `for (const [k, v] of m)`: `[key, value]` pairs. */
	public inline function entries():JsIterator<Array<Dynamic>> {
		return this.entries();
	}
}

/** The iterator `keys`/`values`/`entries` of a `JsMap` or `JsSet` return; it sees entries added while it runs, like JS. */
abstract JsIterator<T>(IteratorCore) from IteratorCore to IteratorCore {
	public inline function next():{done:Bool, value:Null<T>} {
		return cast this.next();
	}

	/** The values left, as a fresh array (`[...it]`, `for…of`). */
	public inline function toArray():Array<T> {
		return cast this.toArray();
	}
}

/** The untyped map behind `JsMap<K, V>` and `JsSet<T>`. */
class MapCore {
	var entryKeys:Array<Dynamic> = [];
	var entryValues:Array<Dynamic> = [];
	var live:Array<Bool> = [];
	final index = new KeyIndex();

	public var size(default, null):Int = 0;

	public function new() {}

	public function get(key:Dynamic):Dynamic {
		var slot = index.get(key);
		return slot < 0 ? null : entryValues[slot];
	}

	/** JS `m.set(key, value)`: returns the map. */
	public function set(key:Dynamic, value:Dynamic):MapCore {
		var slot = index.get(key);
		if (slot >= 0) {
			entryValues[slot] = value;
			return this;
		}
		index.set(key, entryKeys.length);
		entryKeys.push(key);
		entryValues.push(value);
		live.push(true);
		size++;
		return this;
	}

	public function has(key:Dynamic):Bool {
		return index.get(key) >= 0;
	}

	public function delete(key:Dynamic):Bool {
		var slot = index.get(key);
		if (slot < 0)
			return false;
		index.remove(key);
		live[slot] = false;
		entryKeys[slot] = null;
		entryValues[slot] = null;
		size--;
		return true;
	}

	public function clear():Void {
		for (slot in 0...live.length)
			live[slot] = false;
		entryKeys = [];
		entryValues = [];
		live = [];
		index.clear();
		size = 0;
	}

	/** JS `m.forEach((value, key, map) => …)`; `owner` is the map the callback sees. */
	public function forEach(?owner:Dynamic, callback:(Dynamic, Dynamic, Dynamic) -> Void):Void {
		var slot = 0;
		var keys = entryKeys;
		while (slot < entryKeys.length && keys == entryKeys) {
			if (live[slot])
				callback(entryValues[slot], entryKeys[slot], owner == null ? this : owner);
			slot++;
		}
	}

	public function keys():IteratorCore {
		return new IteratorCore(cursor(), slot -> entryKeys[slot]);
	}

	public function values():IteratorCore {
		return new IteratorCore(cursor(), slot -> entryValues[slot]);
	}

	/** JS `m.entries()` and `for (const [k, v] of m)`: `[key, value]` pairs. */
	public function entries():IteratorCore {
		return new IteratorCore(cursor(), slot -> ([entryKeys[slot], entryValues[slot]] : Array<Dynamic>));
	}

	function cursor():Void->Int {
		var slot = 0;
		var keys = entryKeys;
		return () -> {
			if (keys != entryKeys)
				return -1;
			while (slot < live.length && !live[slot])
				slot++;
			return slot < live.length ? slot++ : -1;
		}
	}
}

/** The untyped iterator behind `JsIterator<T>`. */
class IteratorCore {
	final nextSlot:Void->Int;
	final read:Int->Dynamic;

	public function new(nextSlot:Void->Int, read:Int->Dynamic) {
		this.nextSlot = nextSlot;
		this.read = read;
	}

	public function next():{done:Bool, value:Dynamic} {
		var slot = nextSlot();
		return slot < 0 ? {done: true, value: null} : {done: false, value: read(slot)};
	}

	/** The values left, as a fresh array (`[...it]`, `Array.from(it)`). */
	public function toArray():Array<Dynamic> {
		var values = [];
		var slot = nextSlot();
		while (slot >= 0) {
			values.push(read(slot));
			slot = nextSlot();
		}
		return values;
	}
}

/** Entry slots by SameValueZero key: strings, numbers, booleans and `null` by value, objects by identity. */
private class KeyIndex {
	var strings = new haxe.ds.StringMap<Int>();
	var primitives = new haxe.ds.StringMap<Int>();
	var objects = new haxe.ds.ObjectMap<{}, Int>();

	public function new() {}

	public function get(key:Dynamic):Int {
		var slot:Null<Int> = if (key == null) primitives.get("u"); else if (Std.isOfType(key, String)) strings.get(key); else if (isPrimitive(key))
			primitives.get(primitiveKey(key)); else objects.get(key);
		return slot == null ? -1 : slot;
	}

	public function set(key:Dynamic, slot:Int):Void {
		if (key == null)
			primitives.set("u", slot);
		else if (Std.isOfType(key, String))
			strings.set(key, slot);
		else if (isPrimitive(key))
			primitives.set(primitiveKey(key), slot);
		else
			objects.set(key, slot);
	}

	public function remove(key:Dynamic):Void {
		if (key == null)
			primitives.remove("u");
		else if (Std.isOfType(key, String))
			strings.remove(key);
		else if (isPrimitive(key))
			primitives.remove(primitiveKey(key));
		else
			objects.remove(key);
	}

	public function clear():Void {
		strings = new haxe.ds.StringMap<Int>();
		primitives = new haxe.ds.StringMap<Int>();
		objects = new haxe.ds.ObjectMap<{}, Int>();
	}

	static inline function isPrimitive(key:Dynamic):Bool {
		return Std.isOfType(key, Bool) || Std.isOfType(key, Float);
	}

	static function primitiveKey(key:Dynamic):String {
		if (Std.isOfType(key, Bool))
			return key ? "t" : "f";
		var number:Float = key;
		return Math.isNaN(number) ? "NaN" : "n" + Num.toString(number == 0 ? 0.0 : number);
	}
}
