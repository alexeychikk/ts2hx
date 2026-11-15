package ts2hx;

import ts2hx.Error.TypeError;
import ts2hx.Generator.GeneratorCore;
import ts2hx.Promise.PromiseCore;

/**
 * Async functions (ADR 0005): `lowerGenerators` turns the body into a generator
 * `step` whose resume points are its `await`s, and `run` drives it on promises.
 */
class Async {
	static inline final NEXT = 0;
	static inline final THROW = 1;
	static inline final RETURN = 2;

	/** Starts an async function body: it runs synchronously up to its first `await`. */
	public static function run(step:GeneratorCore->Dynamic):PromiseCore {
		var core = new GeneratorCore(step);
		var resolve:Dynamic = null;
		var reject:Dynamic = null;
		var promise = PromiseCore.create(function(onResolve:Dynamic, onReject:Dynamic):Void {
			resolve = onResolve;
			reject = onReject;
		});
		function resume(mode:Int, value:Dynamic):Void {
			var result:Dynamic = null;
			try {
				result = mode == THROW ? core.doThrow(value) : core.next(value);
			} catch (error:Dynamic) {
				reject(Error.caught(error));
				return;
			}
			if (result.done == true)
				resolve(result.value);
			else
				await(result.value, value -> resume(NEXT, value), reason -> resume(THROW, reason));
		}
		resume(NEXT, null);
		return promise;
	}

	/** The spec's `Await`: continues a microtask after `value` settles. */
	public static function await(value:Dynamic, onFulfilled:Dynamic->Void, onRejected:Dynamic->Void):Void {
		var settled:PromiseCore = null;
		try {
			settled = PromiseCore.resolve(value);
		} catch (error:Dynamic) {
			settled = PromiseCore.reject(Error.caught(error));
		}
		settled.then(function(result:Dynamic):Dynamic {
			onFulfilled(result);
			return null;
		}, function(reason:Dynamic):Dynamic {
			onRejected(reason);
			return null;
		});
	}

	/** JS `GetIterator(iterable, async)` for `for await`: the async iterator, or the sync one wrapped. */
	public static function iterator(iterable:Dynamic):Dynamic {
		if (Std.isOfType(iterable, AsyncGeneratorCore))
			return iterable;
		if (iterable != null) {
			var method = Reflect.field(iterable, ASYNC_ITERATOR_METHOD);
			if (method != null)
				return Reflect.callMethod(iterable, method, []);
		}
		return new AsyncFromSyncIterator(Iter.iterator(iterable));
	}

	/** Haxe name of a `[Symbol.asyncIterator]()` method. */
	public static inline final ASYNC_ITERATOR_METHOD = "__ts2hx_asyncIterator";

	/** JS `asyncIterator.next()`: a promise of `{ value, done }`. */
	public static function step(iterator:Dynamic):Dynamic {
		if (Std.isOfType(iterator, AsyncGeneratorCore))
			return (iterator : AsyncGeneratorCore).next();
		if (Std.isOfType(iterator, AsyncFromSyncIterator))
			return (iterator : AsyncFromSyncIterator).next();
		var next = Reflect.field(iterator, "next");
		if (next == null)
			throw new TypeError("iterator.next is not a function");
		return Reflect.callMethod(iterator, next, []);
	}

	/** The awaited step of `step`: throws unless it is an object. */
	public static function result(value:Dynamic):Dynamic {
		if (value == null || Std.isOfType(value, Bool) || Std.isOfType(value, Float) || Std.isOfType(value, String))
			throw new TypeError("Iterator result " + Ts2hx.string(value) + " is not an object");
		return value;
	}

	/** JS `AsyncIteratorClose`: `iterator.return()` when it has one, to be awaited. */
	public static function close(iterator:Dynamic):Dynamic {
		if (Std.isOfType(iterator, AsyncGeneratorCore))
			return (iterator : AsyncGeneratorCore).doReturn();
		if (Std.isOfType(iterator, AsyncFromSyncIterator))
			return (iterator : AsyncFromSyncIterator).doReturn();
		var method = Reflect.field(iterator, "return_");
		return method == null ? null : Reflect.callMethod(iterator, method, []);
	}
}

/** JS `AsyncGenerator<T>`: `next`, `return` and `throw` return promises of `{ value, done }`. */
abstract AsyncGenerator<T>(AsyncGeneratorCore) from AsyncGeneratorCore to AsyncGeneratorCore {
	public inline function new(step:GeneratorCore->Dynamic) {
		this = new AsyncGeneratorCore(step);
	}

	public inline function next(?value:Dynamic):Promise<Dynamic> {
		return this.next(value);
	}

	public inline function doReturn(?value:Dynamic):Promise<Dynamic> {
		return this.doReturn(value);
	}

	public inline function doThrow(error:Dynamic):Promise<Dynamic> {
		return this.doThrow(error);
	}
}

private class AsyncRequest {
	public final mode:Int;
	public final value:Dynamic;
	public final promise:PromiseCore;
	public var resolve:Dynamic = null;
	public var reject:Dynamic = null;

	public function new(mode:Int, value:Dynamic) {
		this.mode = mode;
		this.value = value;
		promise = PromiseCore.create(function(onResolve:Dynamic, onReject:Dynamic):Void {
			resolve = onResolve;
			reject = onReject;
		});
	}
}

/** The spec's async generator: a queue of `next`/`return`/`throw` requests served by a generator `step` driven on promises. */
class AsyncGeneratorCore {
	static inline final NEXT = 0;
	static inline final THROW = 1;
	static inline final RETURN = 2;
	static inline final SUSPENDED_START = 0;
	static inline final SUSPENDED_YIELD = 1;
	static inline final EXECUTING = 2;
	static inline final AWAITING_RETURN = 3;
	static inline final COMPLETED = 4;

	final core:GeneratorCore;
	final queue:Array<AsyncRequest> = [];
	var state = SUSPENDED_START;

	public function new(step:GeneratorCore->Dynamic) {
		core = new GeneratorCore(step);
	}

	public function next(?value:Dynamic):PromiseCore {
		var request = new AsyncRequest(NEXT, value);
		if (state == COMPLETED) {
			request.resolve(Iter.result(null, true));
			return request.promise;
		}
		queue.push(request);
		if (state == SUSPENDED_START || state == SUSPENDED_YIELD)
			resume(NEXT, value);
		return request.promise;
	}

	public function doReturn(?value:Dynamic):PromiseCore {
		var request = new AsyncRequest(RETURN, value);
		queue.push(request);
		if (state == SUSPENDED_START || state == COMPLETED) {
			state = AWAITING_RETURN;
			awaitReturn();
		} else if (state == SUSPENDED_YIELD) {
			resumeReturn(value);
		}
		return request.promise;
	}

	public function doThrow(error:Dynamic):PromiseCore {
		var request = new AsyncRequest(THROW, error);
		if (state == SUSPENDED_START)
			state = COMPLETED;
		if (state == COMPLETED) {
			request.reject(error);
			return request.promise;
		}
		queue.push(request);
		if (state == SUSPENDED_YIELD)
			resume(THROW, error);
		return request.promise;
	}

	function resumeReturn(value:Dynamic):Void {
		state = EXECUTING;
		Async.await(value, result -> resume(RETURN, result), reason -> resume(THROW, reason));
	}

	function resume(mode:Int, value:Dynamic):Void {
		state = EXECUTING;
		var result:Dynamic = null;
		try {
			result = switch (mode) {
				case THROW: core.doThrow(value);
				case RETURN: core.doReturn(value);
				default: core.next(value);
			}
		} catch (error:Dynamic) {
			state = COMPLETED;
			completeStep(THROW, Error.caught(error), true);
			drainQueue();
			return;
		}
		if (core.awaiting) {
			Async.await(result.value, value -> resume(NEXT, value), reason -> resume(THROW, reason));
			return;
		}
		if (result.done == true) {
			state = COMPLETED;
			completeStep(NEXT, result.value, true);
			drainQueue();
			return;
		}
		completeStep(NEXT, result.value, false);
		if (queue.length == 0) {
			state = SUSPENDED_YIELD;
			return;
		}
		var pending = queue[0];
		if (pending.mode == RETURN)
			resumeReturn(pending.value);
		else
			resume(pending.mode, pending.value);
	}

	function completeStep(mode:Int, value:Dynamic, done:Bool):Void {
		var request = queue.shift();
		if (mode == THROW)
			request.reject(value);
		else
			request.resolve(Iter.result(value, done));
	}

	function drainQueue():Void {
		while (queue.length > 0) {
			var pending = queue[0];
			switch (pending.mode) {
				case RETURN:
					state = AWAITING_RETURN;
					awaitReturn();
					return;
				case THROW:
					completeStep(THROW, pending.value, true);
				default:
					completeStep(NEXT, null, true);
			}
		}
	}

	function awaitReturn():Void {
		var value = queue[0].value;
		Async.await(value, function(result:Dynamic):Void {
			state = COMPLETED;
			completeStep(NEXT, result, true);
			drainQueue();
		}, function(reason:Dynamic):Void {
			state = COMPLETED;
			completeStep(THROW, reason, true);
			drainQueue();
		});
	}
}

/** The spec's `CreateAsyncFromSyncIterator`: `for await` over a sync iterable awaits each value. */
class AsyncFromSyncIterator {
	final iterator:Dynamic;

	public function new(iterator:Dynamic) {
		this.iterator = iterator;
	}

	public function next():PromiseCore {
		try {
			return continuation(Iter.step(iterator));
		} catch (error:Dynamic) {
			return PromiseCore.reject(Error.caught(error));
		}
	}

	public function doReturn():PromiseCore {
		try {
			if (Std.isOfType(iterator, GeneratorCore))
				return continuation((iterator : GeneratorCore).doReturn());
			var method = Reflect.field(iterator, "return_");
			if (method == null)
				return PromiseCore.resolve(Iter.result(null, true));
			return continuation(Reflect.callMethod(iterator, method, []));
		} catch (error:Dynamic) {
			return PromiseCore.reject(Error.caught(error));
		}
	}

	function continuation(result:Dynamic):PromiseCore {
		var done = result.done == true;
		return PromiseCore.resolve(result.value).then(function(value:Dynamic):Dynamic {
			return Iter.result(value, done);
		}, null);
	}
}
