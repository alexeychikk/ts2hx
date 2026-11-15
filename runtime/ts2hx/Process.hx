package ts2hx;

/** Node's `process.argv`, `process.exit` and `process.stdout`/`stderr.write` on every target. */
class Process {
	/** `[node, script, ...args]` on every target: native targets name their own executable twice. */
	public static var argv(get, null):Array<String>;

	/** An opaque handle of the standard output stream for `write`. */
	public static var stdout(default, null):Dynamic = #if js js.Syntax.code("process.stdout") #else 1 #end;

	/** An opaque handle of the standard error stream for `write`. */
	public static var stderr(default, null):Dynamic = #if js js.Syntax.code("process.stderr") #else 2 #end;

	static var args:Null<Array<String>>;

	static function get_argv():Array<String> {
		if (args == null) {
			#if js
			args = js.Syntax.code("process.argv");
			#else
			var program = Sys.programPath();
			args = [program, program].concat(Sys.args());
			#end
		}
		return args;
	}

	public static function exit(?code:Float):Void {
		var status = code == null ? 0 : Std.int(code);
		#if js
		js.Syntax.code("process.exit({0})", status);
		#else
		Sys.exit(status);
		#end
	}

	/** `stream.write(text)`: always `true`, as nothing is buffered. */
	public static function write(stream:Dynamic, text:String):Bool {
		#if js
		return stream.write(text);
		#else
		#if cpp
		text = JsString.toWellFormed(text);
		#end
		if (stream == 2)
			Sys.stderr().writeString(text);
		else
			Sys.print(text);
		return true;
		#end
	}
}
