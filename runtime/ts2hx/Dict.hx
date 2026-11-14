package ts2hx;

/**
 * A JS object used as a dictionary (index signatures, `Record<string, V>`, ADR 0002):
 * own keys enumerate in JS order, array indices ascending, then strings by insertion.
 */
class Dict<V> {
	final map = new haxe.ds.StringMap<V>();
	final order:Array<String> = [];

	public function new() {}

	/** A dictionary holding `values[i]` under `keys[i]`, in that order. */
	public static function of<V>(keys:Array<String>, values:Array<V>):Dict<V> {
		var dict = new Dict<V>();
		for (i in 0...keys.length) {
			dict.set(keys[i], values[i]);
		}
		return dict;
	}

	public function get(key:String):Null<V> {
		return map.get(key);
	}

	/** JS `d[key] = value`: evaluates to `value`. */
	public function set(key:String, value:V):V {
		if (!map.exists(key)) {
			order.push(key);
		}
		map.set(key, value);
		return value;
	}

	/** JS `key in d`. */
	public function exists(key:String):Bool {
		return map.exists(key);
	}

	/** JS `delete d[key]`: always `true`. */
	public function remove(key:String):Bool {
		if (map.remove(key)) {
			order.remove(key);
		}
		return true;
	}

	/** JS `Object.keys(d)`. */
	public function keys():Array<String> {
		var indices = [for (key in order) if (isArrayIndex(key)) key];
		if (indices.length == 0) {
			return order.copy();
		}
		indices.sort((a, b) -> {
			var x = Std.parseFloat(a);
			var y = Std.parseFloat(b);
			x < y ? -1 : x > y ? 1 : 0;
		});
		return indices.concat([for (key in order) if (!isArrayIndex(key)) key]);
	}

	/** JS `Object.values(d)`. */
	public function values():Array<V> {
		return [for (key in keys()) map.get(key)];
	}

	/** JS `Object.entries(d)`: `[key, value]` pairs. */
	public function entries():Array<Array<Dynamic>> {
		return [for (key in keys()) ([key, map.get(key)] : Array<Dynamic>)];
	}

	/** Whether `key` is a canonical array index (`0` to `2^32 - 2`), which JS enumerates first. */
	static function isArrayIndex(key:String):Bool {
		if (key.length == 0 || key.length > 10 || (key.length > 1 && key.charAt(0) == "0")) {
			return false;
		}
		for (i in 0...key.length) {
			var code = key.charCodeAt(i);
			if (code < "0".code || code > "9".code) {
				return false;
			}
		}
		return Std.parseFloat(key) < 4294967295.0;
	}
}
