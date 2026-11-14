package ts2hx;

/** Single-threaded event loop `Main` drains after module initialisation (ADR 0002). */
class EventLoop {
	static var microtasks:Array<() -> Void> = [];

	public static function queueMicrotask(task:() -> Void):Void {
		microtasks.push(task);
	}

	/** Runs queued work until nothing is left. */
	public static function run():Void {
		while (microtasks.length > 0) {
			microtasks.shift()();
		}
	}
}
