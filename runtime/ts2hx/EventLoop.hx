package ts2hx;

/**
 * Single-threaded event loop `Main` drains after module initialisation (ADR 0002), the
 * same pure Haxe on every target: the microtask queue, then timers by due time and then
 * by creation, with the microtasks drained after each timer like Node. Time is virtual
 * (a timer runs at its due time, however long callbacks took), and the loop waits for
 * real until that time is reached.
 */
class EventLoop {
	/** Node's `TIMEOUT_MAX`: longer or invalid delays become 1 ms. */
	static inline final TIMEOUT_MAX = 2147483647.0;

	static var microtasks:Array<() -> Void> = [];
	static var nextMicrotask = 0;
	static var timers:Array<Timeout> = [];
	static var now = 0.0;
	static var origin:Null<Float>;
	static var unhandled:Array<Promise.PromiseCore> = [];

	public static function queueMicrotask(task:() -> Void):Void {
		microtasks.push(task);
	}

	/** JS `setTimeout(callback, delay, ...args)`. */
	public static function setTimeout(callback:Dynamic, ?delay:Float, ?args:Array<Dynamic>):Timeout {
		return schedule(new Timeout(callback, args == null ? [] : args, clampDelay(delay), false));
	}

	/** JS `setInterval(callback, delay, ...args)`. */
	public static function setInterval(callback:Dynamic, ?delay:Float, ?args:Array<Dynamic>):Timeout {
		return schedule(new Timeout(callback, args == null ? [] : args, clampDelay(delay), true));
	}

	/** JS `clearTimeout`/`clearInterval`: ignores anything but a pending timer. */
	public static function clearTimeout(timer:Dynamic):Void {
		if (Std.isOfType(timer, Timeout)) {
			var timeout:Timeout = timer;
			timeout.cleared = true;
			timers.remove(timeout);
		}
	}

	/** Runs queued work until nothing is left. */
	public static function run():Void {
		if (origin == null)
			origin = haxe.Timer.stamp();
		drainMicrotasks();
		while (timers.length > 0) {
			var timer = timers[0];
			#if js
			var wait = timer.due - elapsed();
			if (wait > 0) {
				js.Syntax.code("setTimeout({0}, {1})", resume, Math.ceil(wait));
				return;
			}
			#else
			waitUntil(timer.due);
			#end
			timers.shift();
			now = timer.due;
			fire(timer);
			drainMicrotasks();
		}
	}

	#if js
	static function resume():Void {
		try {
			run();
		} catch (error:Dynamic) {
			Ts2hx.uncaught(error);
		}
	}
	#end

	/** A rejected promise without handlers: reported like Node unless one is added before the microtasks drain. */
	public static function trackRejection(promise:Promise.PromiseCore):Void {
		unhandled.push(promise);
	}

	public static function rejectionHandled(promise:Promise.PromiseCore):Void {
		unhandled.remove(promise);
	}

	static function fire(timer:Timeout):Void {
		var callback = timer.callback;
		if (timer.args.length == 0)
			callback();
		else
			Reflect.callMethod(null, callback, timer.args);
		if (timer.repeat && !timer.cleared)
			schedule(timer);
	}

	static function schedule(timer:Timeout):Timeout {
		timer.due = now + timer.delay;
		var low = 0;
		var high = timers.length;
		while (low < high) {
			var middle = (low + high) >> 1;
			if (timers[middle].due <= timer.due)
				low = middle + 1;
			else
				high = middle;
		}
		timers.insert(low, timer);
		return timer;
	}

	static function drainMicrotasks():Void {
		while (true) {
			while (nextMicrotask < microtasks.length) {
				var task = microtasks[nextMicrotask];
				microtasks[nextMicrotask++] = null;
				task();
			}
			microtasks = [];
			nextMicrotask = 0;
			if (unhandled.length == 0)
				return;
			var rejected = unhandled[0];
			unhandled = [];
			Ts2hx.uncaught(rejected.result);
		}
	}

	static function clampDelay(delay:Null<Float>):Float {
		if (delay == null || Math.isNaN(delay) || !(delay >= 1 && delay <= TIMEOUT_MAX))
			return 1;
		return delay;
	}

	static function elapsed():Float {
		return (haxe.Timer.stamp() - origin) * 1000;
	}

	#if !js
	static function waitUntil(due:Float):Void {
		var wait = due - elapsed();
		if (wait > 0)
			Sys.sleep(wait / 1000);
	}
	#end
}

/** Node's `Timeout`, as `setTimeout`/`setInterval` return it. */
class Timeout {
	public final callback:Dynamic;
	public final args:Array<Dynamic>;
	public final delay:Float;
	public final repeat:Bool;
	public var due = 0.0;
	public var cleared = false;

	public function new(callback:Dynamic, args:Array<Dynamic>, delay:Float, repeat:Bool) {
		this.callback = callback;
		this.args = args;
		this.delay = delay;
		this.repeat = repeat;
	}
}
