package ts2hx;

/**
 * JS `Error` (ADR 0002). A plain class rather than a `haxe.Exception`, so `message`,
 * `name` and `stack` are writable fields and subclasses may declare any field name.
 */
class Error {
	public var name:String;
	public var message:String;

	/** Stub: the `name: message` header Node starts its stack with, without frames. */
	public var stack:Null<String>;

	public var cause:Dynamic;

	public function new(?message:String, ?options:Dynamic) {
		this.message = message == null ? "" : message;
		if (options != null && Reflect.hasField(options, "cause"))
			cause = Reflect.field(options, "cause");
		named("Error");
	}

	function named(name:String):Void {
		this.name = name;
		stack = toString();
	}

	public function toString():String {
		var name = Ts2hx.string(this.name);
		var message = Ts2hx.string(this.message);
		if (message.length == 0)
			return name;
		return name.length == 0 ? message : name + ": " + message;
	}

	/** The value a `catch` binds: a native runtime error of the target becomes its JS error. */
	public static function caught(value:Dynamic):Dynamic {
		#if js
		if (Std.isOfType(value, js.lib.Error)) {
			var native:js.lib.Error = value;
			return switch (native.name) {
				case "TypeError": new TypeError(native.message);
				case "RangeError": new RangeError(native.message);
				case "SyntaxError": new SyntaxError(native.message);
				case "ReferenceError": new ReferenceError(native.message);
				default: new Error(native.message);
			}
		}
		#elseif cs
		if (Std.isOfType(value, cs.system.NullReferenceException))
			return new TypeError("Cannot read properties of null");
		if (Std.isOfType(value, cs.system.InvalidCastException))
			return new TypeError((value : cs.system.Exception).Message);
		if (Std.isOfType(value, cs.system.Exception))
			return new Error((value : cs.system.Exception).Message);
		#elseif cpp
		if (value == "Null Object Reference")
			return new TypeError("Cannot read properties of null");
		#end
		if (Std.isOfType(value, haxe.Exception))
			return new Error((value : haxe.Exception).message);
		return value;
	}
}

class TypeError extends Error {
	public function new(?message:String, ?options:Dynamic) {
		super(message, options);
		named("TypeError");
	}
}

class RangeError extends Error {
	public function new(?message:String, ?options:Dynamic) {
		super(message, options);
		named("RangeError");
	}
}

class SyntaxError extends Error {
	public function new(?message:String, ?options:Dynamic) {
		super(message, options);
		named("SyntaxError");
	}
}

class ReferenceError extends Error {
	public function new(?message:String, ?options:Dynamic) {
		super(message, options);
		named("ReferenceError");
	}
}

class EvalError extends Error {
	public function new(?message:String, ?options:Dynamic) {
		super(message, options);
		named("EvalError");
	}
}

class URIError extends Error {
	public function new(?message:String, ?options:Dynamic) {
		super(message, options);
		named("URIError");
	}
}

class AggregateError extends Error {
	public var errors:Array<Dynamic>;

	public function new(errors:Dynamic, ?message:String, ?options:Dynamic) {
		super(message, options);
		this.errors = Iter.toArray(errors);
		named("AggregateError");
	}
}
