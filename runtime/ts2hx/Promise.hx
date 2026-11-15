package ts2hx;

/**
 * JS `Promise<T>` (ADR 0002). An abstract over the untyped `PromiseCore`, so a cast
 * between instantiations keeps the promise's identity on every target. Callbacks are
 * `Dynamic` and must take exactly the arguments they are called with: one value, or
 * none for `finally`.
 */
abstract Promise<T>(PromiseCore) from PromiseCore to PromiseCore {
	/** `new Promise(executor)`: `executor(resolve, reject)` runs synchronously. */
	public inline function new(executor:Dynamic) {
		this = PromiseCore.create(executor);
	}

	public inline function then(?onFulfilled:Dynamic, ?onRejected:Dynamic):Promise<Dynamic> {
		return this.then(onFulfilled, onRejected);
	}

	public inline function catchError(?onRejected:Dynamic):Promise<Dynamic> {
		return this.then(null, onRejected);
	}

	public inline function finally(?onFinally:Dynamic):Promise<Dynamic> {
		return this.finally(onFinally);
	}

	public static inline function resolve<T>(?value:Dynamic):Promise<T> {
		return PromiseCore.resolve(value);
	}

	public static inline function reject<T>(?reason:Dynamic):Promise<T> {
		return PromiseCore.reject(reason);
	}

	public static inline function all(values:Array<Dynamic>):Promise<Array<Dynamic>> {
		return PromiseCore.all(values);
	}

	public static inline function allSettled(values:Array<Dynamic>):Promise<Array<Dynamic>> {
		return PromiseCore.allSettled(values);
	}

	public static inline function race<T>(values:Array<Dynamic>):Promise<T> {
		return PromiseCore.race(values);
	}

	public static inline function any<T>(values:Array<Dynamic>):Promise<T> {
		return PromiseCore.any(values);
	}
}

/** The untyped promise state machine, following the ECMAScript algorithms step by step so microtask ordering matches Node. */
class PromiseCore {
	static inline final PENDING = 0;
	static inline final FULFILLED = 1;
	static inline final REJECTED = 2;

	public var state(default, null) = PENDING;
	public var result(default, null):Dynamic;

	var reactions:Array<Reaction> = [];
	var handled = false;

	function new() {}

	public static function create(executor:Dynamic):PromiseCore {
		var promise = new PromiseCore();
		var resolving = new Resolving(promise);
		try {
			executor(resolving.resolve, resolving.reject);
		} catch (error:Dynamic) {
			resolving.reject(Error.caught(error));
		}
		return promise;
	}

	/** `Promise.resolve`: a promise is returned as is. */
	public static function resolve(value:Dynamic):PromiseCore {
		if (Std.isOfType(value, PromiseCore))
			return value;
		var promise = new PromiseCore();
		promise.resolveWith(value);
		return promise;
	}

	public static function reject(reason:Dynamic):PromiseCore {
		var promise = new PromiseCore();
		promise.settle(REJECTED, reason);
		return promise;
	}

	public function then(onFulfilled:Dynamic, onRejected:Dynamic):PromiseCore {
		var derived = new PromiseCore();
		var reaction = new Reaction(derived, Reflect.isFunction(onFulfilled) ? onFulfilled : null, Reflect.isFunction(onRejected) ? onRejected : null);
		switch (state) {
			case PENDING:
				reactions.push(reaction);
			case REJECTED:
				if (!handled)
					EventLoop.rejectionHandled(this);
				enqueue(reaction, REJECTED, result);
			default:
				enqueue(reaction, FULFILLED, result);
		}
		handled = true;
		return derived;
	}

	public function finally(onFinally:Dynamic):PromiseCore {
		if (!Reflect.isFunction(onFinally))
			return then(onFinally, onFinally);
		return then(function(value:Dynamic):Dynamic {
			return resolve(onFinally()).then(function(_:Dynamic):Dynamic return value, null);
		}, function(reason:Dynamic):Dynamic {
			return resolve(onFinally()).then(function(_:Dynamic):Dynamic throw reason, null);
		});
	}

	public static function all(values:Array<Dynamic>):PromiseCore {
		var promise = new PromiseCore();
		var resolving = new Resolving(promise);
		var results:Array<Dynamic> = [];
		var remaining = new Countdown(() -> resolving.resolve(results));
		for (index in 0...values.length) {
			results.push(null);
			var settle = remaining.add();
			resolve(values[index]).then(once(value -> {
				results[index] = value;
				settle();
			}), resolving.reject);
		}
		remaining.release();
		return promise;
	}

	public static function allSettled(values:Array<Dynamic>):PromiseCore {
		var promise = new PromiseCore();
		var resolving = new Resolving(promise);
		var results:Array<Dynamic> = [];
		var remaining = new Countdown(() -> resolving.resolve(results));
		for (index in 0...values.length) {
			results.push(null);
			var settle = remaining.add();
			var called = false;
			function record(status:String, outcome:Dynamic):Void {
				if (called)
					return;
				called = true;
				results[index] = new SettledResult(status, outcome);
				settle();
			}
			resolve(values[index]).then(value -> record("fulfilled", value), reason -> record("rejected", reason));
		}
		remaining.release();
		return promise;
	}

	public static function any(values:Array<Dynamic>):PromiseCore {
		var promise = new PromiseCore();
		var resolving = new Resolving(promise);
		var errors:Array<Dynamic> = [];
		var remaining = new Countdown(() -> resolving.reject(new Error.AggregateError(errors, "All promises were rejected")));
		for (index in 0...values.length) {
			errors.push(null);
			var settle = remaining.add();
			resolve(values[index]).then(resolving.resolve, once(reason -> {
				errors[index] = reason;
				settle();
			}));
		}
		remaining.release();
		return promise;
	}

	public static function race(values:Array<Dynamic>):PromiseCore {
		var promise = new PromiseCore();
		var resolving = new Resolving(promise);
		for (value in values)
			resolve(value).then(resolving.resolve, resolving.reject);
		return promise;
	}

	static function once(callback:Dynamic->Void):Dynamic {
		var called = false;
		return function(value:Dynamic):Void {
			if (called)
				return;
			called = true;
			callback(value);
		}
	}

	/** The spec's promise resolve function: adopts promises and thenables a microtask later. */
	@:allow(ts2hx.Resolving)
	function resolveWith(resolution:Dynamic):Void {
		if (resolution == this) {
			rejectWith(new Error.TypeError("Chaining cycle detected for promise #<Promise>"));
			return;
		}
		var then:Dynamic;
		try {
			then = thenOf(resolution);
		} catch (error:Dynamic) {
			rejectWith(Error.caught(error));
			return;
		}
		if (then == null) {
			settle(FULFILLED, resolution);
			return;
		}
		var promise = this;
		EventLoop.queueMicrotask(function() {
			var resolving = new Resolving(promise);
			try {
				Reflect.callMethod(resolution, then, [resolving.resolve, resolving.reject]);
			} catch (error:Dynamic) {
				resolving.reject(Error.caught(error));
			}
		});
	}

	@:allow(ts2hx.Resolving)
	function rejectWith(reason:Dynamic):Void {
		settle(REJECTED, reason);
	}

	/** The callable `then` of a thenable, `null` for any other value. */
	static function thenOf(value:Dynamic):Dynamic {
		if (Std.isOfType(value, PromiseCore)) {
			var promise:PromiseCore = value;
			return promise.thenFunction;
		}
		if (value == null || !Reflect.isObject(value) || Std.isOfType(value, String) || Std.isOfType(value, Array) || Std.isOfType(value, Error))
			return null;
		var then:Dynamic = Reflect.field(value, "then");
		return Reflect.isFunction(then) ? then : null;
	}

	function thenFunction(onFulfilled:Dynamic, onRejected:Dynamic):PromiseCore {
		return then(onFulfilled, onRejected);
	}

	function settle(newState:Int, value:Dynamic):Void {
		if (state != PENDING)
			return;
		state = newState;
		result = value;
		var pending = reactions;
		reactions = null;
		if (newState == REJECTED && !handled)
			EventLoop.trackRejection(this);
		for (reaction in pending)
			enqueue(reaction, newState, value);
	}

	static function enqueue(reaction:Reaction, state:Int, argument:Dynamic):Void {
		EventLoop.queueMicrotask(function() {
			var handler = state == FULFILLED ? reaction.onFulfilled : reaction.onRejected;
			var derived = reaction.derived;
			if (handler == null) {
				if (state == FULFILLED)
					derived.resolveWith(argument);
				else
					derived.rejectWith(argument);
				return;
			}
			var value:Dynamic;
			try {
				value = handler(argument);
			} catch (error:Dynamic) {
				derived.rejectWith(Error.caught(error));
				return;
			}
			derived.resolveWith(value);
		});
	}

	/** Node `util.inspect` of a promise: `Promise { value }`. */
	public function inspect(inspectValue:Dynamic->String):String {
		return switch (state) {
			case PENDING: "Promise { <pending> }";
			case FULFILLED: "Promise { " + inspectValue(result) + " }";
			default: "Promise { <rejected> " + inspectValue(result) + " }";
		}
	}
}

/** The spec's resolving functions of one promise: only the first call of either counts. */
private class Resolving {
	final promise:PromiseCore;
	var done = false;

	public function new(promise:PromiseCore) {
		this.promise = promise;
	}

	public function resolve(?value:Dynamic):Void {
		if (done)
			return;
		done = true;
		promise.resolveWith(value);
	}

	public function reject(?reason:Dynamic):Void {
		if (done)
			return;
		done = true;
		promise.rejectWith(reason);
	}
}

private class Reaction {
	public final derived:PromiseCore;
	public final onFulfilled:Dynamic;
	public final onRejected:Dynamic;

	public function new(derived:PromiseCore, onFulfilled:Dynamic, onRejected:Dynamic) {
		this.derived = derived;
		this.onFulfilled = onFulfilled;
		this.onRejected = onRejected;
	}
}

/** An element of `Promise.allSettled`'s result: `{ status, value }` or `{ status, reason }`. */
class SettledResult {
	public var status:String;
	public var value:Dynamic;
	public var reason:Dynamic;

	public function new(status:String, outcome:Dynamic) {
		this.status = status;
		if (status == "fulfilled")
			value = outcome;
		else
			reason = outcome;
	}
}

/** The spec's remaining-elements count of `Promise.all` and its siblings: starts at one, `release` drops that one. */
private class Countdown {
	var remaining = 1;
	final complete:() -> Void;

	public function new(complete:() -> Void) {
		this.complete = complete;
	}

	public function add():() -> Void {
		remaining++;
		return release;
	}

	public function release():Void {
		if (--remaining == 0)
			complete();
	}
}
