package ts2hx;

import ts2hx.Error.TypeError;

/**
 * JS `Object.*` and own-key enumeration (ADR 0002). Anonymous structures keep no key
 * order on C# and C++, so object literals record theirs (`literal`) and project classes
 * declare their instance fields (`declareClass`); every enumeration goes through `keys`.
 */
class Obj {
	/** An object literal whose keys enumerate in `keys` order; on JS the native order already is. */
	public static inline function literal<T>(object:T, keys:Array<String>):T {
		#if !js
		KeyOrder.record(object, keys);
		#end
		return object;
	}

	/** Records the class name and own instance fields (JS definition order) of a project class. */
	public static function declareClass(cls:Class<Dynamic>, name:String, keys:Array<String>):Bool {
		if (classes == null)
			classes = new haxe.ds.StringMap<ClassInfo>();
		classes.set(Type.getClassName(cls), new ClassInfo(name, keys));
		return true;
	}

	/** Created on first use: classes declare themselves from static initialisers, which may run first. */
	static var classes:Null<haxe.ds.StringMap<ClassInfo>>;

	static function classInfo(cls:Class<Dynamic>):Null<ClassInfo> {
		return classes == null ? null : classes.get(Type.getClassName(cls));
	}

	/** The JS class name of a project class instance, `null` for other values. */
	public static function className(value:Dynamic):Null<String> {
		var cls = Type.getClass(value);
		var info = cls == null ? null : classInfo(cls);
		return info == null ? null : info.name;
	}

	/** JS `Object.keys(o)`: own enumerable string keys in JS order. */
	public static function keys(object:Dynamic):Array<String> {
		if (object == null)
			throw new TypeError("Cannot convert undefined or null to object");
		if (Std.isOfType(object, Dict))
			return (object : Dict<Dynamic>).keys();
		if (Std.isOfType(object, String))
			return [for (i in 0...(object : String).length) Std.string(i)];
		if (Std.isOfType(object, Array))
			return [for (i in 0...(object : Array<Dynamic>).length) Std.string(i)];
		if (Std.isOfType(object, Bool) || Std.isOfType(object, Float) || Reflect.isFunction(object))
			return [];
		var cls = Type.getClass(object);
		if (cls != null)
			return classKeys(cls);
		return anonymousKeys(object);
	}

	/** JS `Object.values(o)`. */
	public static function values<V>(object:Dynamic):Array<V> {
		return [for (key in keys(object)) get(object, key)];
	}

	/** JS `Object.entries(o)`: `[key, value]` pairs. */
	public static function entries(object:Dynamic):Array<Array<Dynamic>> {
		return [for (key in keys(object)) ([key, get(object, key)] : Array<Dynamic>)];
	}

	/** JS `o[key]` for an own key `keys` returned. */
	public static function get(object:Dynamic, key:String):Dynamic {
		if (Std.isOfType(object, Dict))
			return (object : Dict<Dynamic>).get(key);
		if (Std.isOfType(object, String))
			return (object : String).charAt(Std.parseInt(key));
		if (Std.isOfType(object, Array))
			return (object : Array<Dynamic>)[Std.parseInt(key)];
		return Reflect.field(object, key);
	}

	/** JS `o[key] = value` on a value of unknown type: evaluates to `value`. */
	public static function set(object:Dynamic, key:String, value:Dynamic):Dynamic {
		if (Std.isOfType(object, Dict))
			return (object : Dict<Dynamic>).set(key, value);
		if (Type.getClass(object) == null)
			appendKey(object, key);
		Reflect.setField(object, key, value);
		return value;
	}

	/** JS `key in o` on a value that is not a dictionary. */
	public static function has(object:Dynamic, key:String):Bool {
		if (object == null)
			throw new TypeError("Cannot use 'in' operator to search for '" + key + "' in undefined");
		if (Std.isOfType(object, Dict))
			return (object : Dict<Dynamic>).exists(key);
		if (Std.isOfType(object, Array)) {
			var index = Num.fromString(key);
			return key == "length" || (index >= 0 && index < (object : Array<Dynamic>).length && Num.toString(index) == key);
		}
		var cls = Type.getClass(object);
		if (cls != null)
			return classKeys(cls).indexOf(key) >= 0 || Reflect.isFunction(Reflect.field(object, key));
		return Reflect.hasField(object, key);
	}

	/** JS `delete o[key]`: always `true`. */
	public static function delete(object:Dynamic, key:String):Bool {
		if (Std.isOfType(object, Dict))
			return (object : Dict<Dynamic>).remove(key);
		Reflect.deleteField(object, key);
		return true;
	}

	/** JS `Object.assign(target, ...sources)`: copies own keys in order and returns `target`. */
	public static function assign(target:Dynamic, sources:Array<Dynamic>):Dynamic {
		for (source in sources) {
			if (source == null)
				continue;
			for (key in keys(source))
				set(target, key, get(source, key));
		}
		return target;
	}

	/** JS `Object.fromEntries(pairs)`: a dictionary, since its keys are only known at run time. */
	public static function fromEntries<V>(pairs:Array<Array<Dynamic>>):Dict<V> {
		var dict = new Dict<V>();
		for (pair in pairs)
			dict.set(Ts2hx.string(pair[0]), pair[1]);
		return dict;
	}

	/** JS `Object.freeze(o)`: a no-op (ADR 0005). */
	public static inline function freeze<T>(object:T):T {
		return object;
	}

	/** A fresh plain object holding `values[i]` under `keys[i]`, in that order. */
	public static function fromFields(keys:Array<String>, values:Array<Dynamic>):Dynamic {
		var object:Dynamic = {};
		for (i in 0...keys.length)
			Reflect.setField(object, keys[i], values[i]);
		#if !js
		KeyOrder.record(object, keys.copy());
		#end
		return object;
	}

	static function classKeys(cls:Class<Dynamic>):Array<String> {
		var chain = [];
		var current = cls;
		while (current != null) {
			chain.unshift(current);
			current = Type.getSuperClass(current);
		}
		var keys = [];
		for (c in chain) {
			var info = classInfo(c);
			if (info != null)
				for (key in info.keys)
					if (keys.indexOf(key) < 0)
						keys.push(key);
		}
		return keys;
	}

	static function anonymousKeys(object:Dynamic):Array<String> {
		var fields = Reflect.fields(object);
		#if js
		fields.remove("__id__");
		return fields;
		#else
		var order = KeyOrder.of(object);
		if (order == null)
			return fields;
		var keys = [for (key in order) if (fields.indexOf(key) >= 0) key];
		for (field in fields)
			if (order.indexOf(field) < 0)
				keys.push(field);
		return keys;
		#end
	}

	static inline function appendKey(object:Dynamic, key:String):Void {
		#if !js
		if (!Reflect.hasField(object, key))
			KeyOrder.append(object, key);
		#end
	}
}

private class ClassInfo {
	public final name:String;
	public final keys:Array<String>;

	public function new(name:String, keys:Array<String>) {
		this.name = name;
		this.keys = keys;
	}
}

#if !js
/** Key order of anonymous objects, attached without keeping them alive (C# and C++ sort `Reflect.fields`). */
class KeyOrder {
	#if cs
	static final table:Dynamic = untyped __cs__("new global::System.Runtime.CompilerServices.ConditionalWeakTable<object, object>()");

	public static function record(object:Dynamic, keys:Array<String>):Void {
		untyped __cs__("((global::System.Runtime.CompilerServices.ConditionalWeakTable<object, object>){0}).AddOrUpdate({1}, {2})", table, object, keys);
	}

	public static function of(object:Dynamic):Null<Array<String>> {
		var keys:Dynamic = untyped __cs__("(((global::System.Runtime.CompilerServices.ConditionalWeakTable<object, object>){0}).TryGetValue({1}, out var ts2hxKeys) ? ts2hxKeys : null)",
			table, object);
		return cast keys;
	}
	#else
	static var table:Null<haxe.ds.WeakMap<{}, Array<String>>>;

	public static function record(object:Dynamic, keys:Array<String>):Void {
		if (table == null)
			table = new haxe.ds.WeakMap<{}, Array<String>>();
		table.set(object, keys);
	}

	public static function of(object:Dynamic):Null<Array<String>> {
		return table == null ? null : table.get(object);
	}
	#end

	public static function append(object:Dynamic, key:String):Void {
		var keys = of(object);
		if (keys == null) {
			keys = Reflect.fields(object);
			record(object, keys);
		}
		if (keys.indexOf(key) < 0)
			keys.push(key);
	}
}
#end
