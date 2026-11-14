package ts2hx;

/** `console.*` output (ADR 0002); v0 prints primitives like Node. */
class Console {
	public static function log(...args:Dynamic):Void {
		writeLine([for (arg in args) inspect(arg)].join(" "));
	}

	/**
	 * Node `util.inspect` of a number: like `Num.toString`, but `-0` keeps its sign.
	 * Called on statically typed numbers, since boxing into `Dynamic` drops the sign on C++.
	 */
	public static function inspectNumber(value:Float):String {
		return value == 0 && 1 / value < 0 ? "-0" : Num.toString(value);
	}

	/** Node `util.inspect` of a top-level argument: strings print raw. */
	static function inspect(value:Dynamic):String {
		if (Std.isOfType(value, String))
			return value;
		indentation = 0;
		currentDepth = 0;
		return inspectValue(value, 0);
	}

	static inline final BREAK_LENGTH = 80;
	static inline final COMPACT = 3;
	static inline final MAX_DEPTH = 2;

	static var indentation = 0;
	static var currentDepth = 0;

	/** Node `util.inspect` of a nested value: quoted strings, arrays and plain objects laid out like Node. */
	static function inspectValue(value:Dynamic, depth:Int):String {
		if (Std.isOfType(value, String))
			return "'" + value + "'";
		if (Std.isOfType(value, Array))
			return inspectArray(value, depth);
		if (Reflect.isFunction(value))
			return "[Function (anonymous)]";
		if (isPlainObject(value))
			return inspectObject(value, depth);
		return Ts2hx.string(value);
	}

	static function isPlainObject(value:Dynamic):Bool {
		return value != null && Reflect.isObject(value) && Type.getClass(value) == null && !Std.isOfType(value, Bool) && !Std.isOfType(value, Float);
	}

	static function inspectArray(array:Array<Dynamic>, depth:Int):String {
		if (array.length == 0)
			return "[]";
		if (depth > MAX_DEPTH)
			return "[Array]";
		var output = children(depth, [for (element in array) element]);
		var grouped = output.length > 6 ? groupElements(output, array) : output;
		return reduceToSingleString(grouped, output.length, depth + 1, "[", "]");
	}

	static function inspectObject(value:Dynamic, depth:Int):String {
		var fields = Reflect.fields(value);
		if (fields.length == 0)
			return "{}";
		if (depth > MAX_DEPTH)
			return "[Object]";
		var values = children(depth, [for (field in fields) Reflect.field(value, field)]);
		var output = [for (i in 0...fields.length) fields[i] + ": " + values[i]];
		return reduceToSingleString(output, output.length, depth + 1, "{", "}");
	}

	static function children(depth:Int, values:Array<Dynamic>):Array<String> {
		currentDepth = depth + 1;
		indentation += 2;
		var output = [for (value in values) inspectValue(value, depth + 1)];
		indentation -= 2;
		return output;
	}

	/** Node `reduceToSingleString`: one line when the entries fit, else one entry (or group) per line. */
	static function reduceToSingleString(output:Array<String>, entries:Int, depth:Int, open:String, close:String):String {
		if (currentDepth - depth < COMPACT && entries == output.length) {
			var start = output.length + indentation + open.length + 10;
			if (isBelowBreakLength(output, start)) {
				var joined = output.join(", ");
				if (joined.indexOf("\n") < 0)
					return open + " " + joined + " " + close;
			}
		}
		var lineBreak = "\n" + StringTools.lpad("", " ", indentation);
		return open + lineBreak + "  " + output.join("," + lineBreak + "  ") + lineBreak + close;
	}

	static function isBelowBreakLength(output:Array<String>, start:Int):Bool {
		var total = output.length + start;
		if (total + output.length > BREAK_LENGTH)
			return false;
		for (entry in output) {
			total += entry.length;
			if (total > BREAK_LENGTH)
				return false;
		}
		return true;
	}

	/** Node `groupArrayElements`: more than six short entries are laid out in aligned columns. */
	static function groupElements(output:Array<String>, values:Array<Dynamic>):Array<String> {
		var separatorSpace = 2;
		var totalLength = 0;
		var maxLength = 0;
		for (entry in output) {
			totalLength += entry.length + separatorSpace;
			if (entry.length > maxLength)
				maxLength = entry.length;
		}
		var actualMax = maxLength + separatorSpace;
		if (actualMax * 3 + indentation >= BREAK_LENGTH || (totalLength / actualMax <= 5 && maxLength > 6))
			return output;
		var averageBias = Math.sqrt(actualMax - totalLength / output.length);
		var biasedMax = Math.max(actualMax - 3 - averageBias, 1);
		var columns = Std.int(Math.min(Math.min(Math.round(Math.sqrt(2.5 * biasedMax * output.length) / biasedMax),
			Math.floor((BREAK_LENGTH - indentation) / actualMax)), Math.min(COMPACT * 4, 15)));
		if (columns <= 1)
			return output;
		var maxLineLength = [];
		for (i in 0...columns) {
			var lineLength = 0;
			var j = i;
			while (j < output.length) {
				if (output[j].length > lineLength)
					lineLength = output[j].length;
				j += columns;
			}
			maxLineLength.push(lineLength + separatorSpace);
		}
		var padStart = true;
		for (value in values)
			if (!Std.isOfType(value, Float)) {
				padStart = false;
				break;
			}
		var grouped = [];
		var i = 0;
		while (i < output.length) {
			var max = Std.int(Math.min(i + columns, output.length));
			var line = new StringBuf();
			var j = i;
			while (j < max - 1) {
				var cell = output[j] + ", ";
				line.add(padStart ? StringTools.lpad(cell, " ", maxLineLength[j - i]) : StringTools.rpad(cell, " ", maxLineLength[j - i]));
				j++;
			}
			line.add(padStart ? StringTools.lpad(output[j], " ", maxLineLength[j - i] - separatorSpace) : output[j]);
			grouped.push(line.toString());
			i += columns;
		}
		return grouped;
	}

	static function writeLine(line:String):Void {
		#if js
		js.Syntax.code("process.stdout.write({0})", line + "\n");
		#else
		Sys.println(line);
		#end
	}
}
