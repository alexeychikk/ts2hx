package ts2hx;

import ts2hx.Error.TypeError;

/**
 * A JS generator object (ADR 0005). The `lowerGenerators` pass turns a generator
 * body into a `step` function: a state machine over `GeneratorCore.state` that
 * returns through `yieldTo`, `delegateTo` or `finish`.
 */
abstract Generator<T>(GeneratorCore) from GeneratorCore to GeneratorCore {
	public inline function new(step:GeneratorCore->Dynamic) {
		this = new GeneratorCore(step);
	}

	/** JS `g.next(value)`: `{ value, done }`. */
	public inline function next(?value:Dynamic):Dynamic {
		return this.next(value);
	}

	/** JS `g.return(value)`: runs the pending `finally` blocks and finishes. */
	public inline function doReturn(?value:Dynamic):Dynamic {
		return this.doReturn(value);
	}

	/** JS `g.throw(error)`: throws `error` where the generator is suspended. */
	public inline function doThrow(error:Dynamic):Dynamic {
		return this.doThrow(error);
	}

	/** The values left, as a fresh array (`[...g]`, `Array.from(g)`). */
	public inline function toArray():Array<T> {
		return cast Iter.toArray(this);
	}
}

/** The `return()` of a generator, thrown where it is suspended so that only `finally` blocks see it. */
class GeneratorReturn {
	public final value:Dynamic;

	public function new(value:Dynamic) {
		this.value = value;
	}
}

/** The untyped generator behind `Generator<T>`, and the context its `step` function drives. */
class GeneratorCore {
	static inline final NEXT = 0;
	static inline final THROW = 1;
	static inline final RETURN = 2;
	static inline final YIELDED = 0;
	static inline final DELEGATED = 1;
	static inline final FINISHED = 2;

	/** The state `step` runs next. */
	public var state:Int = 0;

	final step:GeneratorCore->Dynamic;
	var started = false;
	var running = false;
	var finished = false;
	var resumeMode = NEXT;
	var resumeValue:Dynamic = null;
	var outcome = FINISHED;
	var delegated:Dynamic = null;

	public function new(step:GeneratorCore->Dynamic) {
		this.step = step;
	}

	/** Whether a caught value is the `return()` signal, which `catch` clauses let through. */
	public static function isReturn(error:Dynamic):Bool {
		return Std.isOfType(error, GeneratorReturn);
	}

	public function next(?value:Dynamic):Dynamic {
		return resume(NEXT, value);
	}

	public function doReturn(?value:Dynamic):Dynamic {
		return resume(RETURN, value);
	}

	public function doThrow(error:Dynamic):Dynamic {
		return resume(THROW, error);
	}

	/** At a resume point: the value `next(value)` sent, or the error `throw`/`return` inject there. */
	public function sent():Dynamic {
		var mode = resumeMode;
		var value = resumeValue;
		resumeMode = NEXT;
		resumeValue = null;
		if (mode == THROW)
			throw value;
		if (mode == RETURN)
			throw new GeneratorReturn(value);
		return value;
	}

	/** `yield value`, resuming at `next`. */
	public function yieldTo(next:Int, value:Dynamic):Dynamic {
		state = next;
		outcome = YIELDED;
		return value;
	}

	/** `yield* iterable`, resuming at `next` with the delegate's return value. */
	public function delegateTo(next:Int, iterable:Dynamic):Dynamic {
		delegated = Iter.iterator(iterable);
		state = next;
		outcome = DELEGATED;
		return null;
	}

	/** `return value` (or the end of the body). */
	public function finish(value:Dynamic):Dynamic {
		state = -1;
		outcome = FINISHED;
		return value;
	}

	function resume(mode:Int, value:Dynamic):Dynamic {
		if (running)
			throw new TypeError("Generator is already running");
		if (!finished && !started && mode != NEXT)
			finished = true;
		if (finished) {
			if (mode == THROW)
				throw value;
			return Iter.result(mode == RETURN ? value : null, true);
		}
		started = true;
		running = true;
		try {
			var result = run(mode, value);
			running = false;
			return result;
		} catch (error:Dynamic) {
			running = false;
			finished = true;
			delegated = null;
			if (isReturn(error))
				return Iter.result((error : GeneratorReturn).value, true);
			throw error;
		}
	}

	function run(mode:Int, value:Dynamic):Dynamic {
		while (true) {
			if (delegated != null) {
				var inner:Dynamic = null;
				try {
					inner = delegateStep(mode, value);
				} catch (error:Dynamic) {
					delegated = null;
					mode = THROW;
					value = error;
				}
				if (inner != null) {
					if (!inner.done)
						return Iter.result(inner.value, false);
					delegated = null;
					value = inner.value;
					if (mode != RETURN)
						mode = NEXT;
				}
			}
			resumeMode = mode;
			resumeValue = value;
			var result:Dynamic = step(this);
			switch (outcome) {
				case YIELDED:
					return Iter.result(result, false);
				case DELEGATED:
					mode = NEXT;
					value = null;
				default:
					finished = true;
					return Iter.result(result, true);
			}
		}
	}

	/** Forwards a resumption to the `yield*` delegate; `null` when it has no `return` and the generator returns itself. */
	function delegateStep(mode:Int, value:Dynamic):Dynamic {
		var iterator:Dynamic = delegated;
		if (mode == NEXT)
			return Iter.step(iterator, value);
		if (Std.isOfType(iterator, GeneratorCore))
			return mode == THROW ? (iterator : GeneratorCore).doThrow(value) : (iterator : GeneratorCore).doReturn(value);
		delegated = null;
		Iter.close(iterator);
		if (mode == THROW)
			throw new TypeError("The iterator does not provide a 'throw' method");
		return null;
	}
}
