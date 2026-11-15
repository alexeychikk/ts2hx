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
	static inline final SINGLE_QUOTE = 0x27;
	static inline final DOUBLE_QUOTE = 0x22;
	static inline final BACKTICK = 0x60;
	static inline final BACKSLASH = 0x5C;

	static var indentation = 0;
	static var currentDepth = 0;

	/** Node `util.inspect` of a nested value: quoted strings, arrays and plain objects laid out like Node. */
	static function inspectValue(value:Dynamic, depth:Int):String {
		if (Std.isOfType(value, String))
			return quote(value);
		if (Std.isOfType(value, Array))
			return RegExp.isMatch(value) ? inspectMatch(value, depth) : inspectArray(value, depth);
		if (Reflect.isFunction(value))
			return "[Function (anonymous)]";
		if (isPlainObject(value))
			return inspectObject(value, depth);
		if (Std.isOfType(value, RegExp.MatchGroups))
			return inspectDict(value, depth, "[Object: null prototype] ");
		if (Std.isOfType(value, Promise.PromiseCore))
			return (value : Promise.PromiseCore).inspect(result -> inspectValue(result, depth + 1));
		if (Std.isOfType(value, Promise.SettledResult)) {
			var settled:Promise.SettledResult = value;
			return inspectFields(["status", settled.status == "fulfilled" ? "value" : "reason"],
				[settled.status, settled.status == "fulfilled" ? settled.value : settled.reason], depth);
		}
		return Ts2hx.string(value);
	}

	/**
	 * Node `strEscape`: single quotes, or double quotes or backticks when that
	 * spares escaping `'`; control characters, `\\` and lone surrogates escaped.
	 */
	public static function quote(s:String):String {
		var mark = SINGLE_QUOTE;
		if (s.indexOf("'") >= 0) {
			if (s.indexOf('"') < 0)
				mark = DOUBLE_QUOTE;
			else if (s.indexOf("`") < 0 && s.indexOf("${") < 0)
				mark = BACKTICK;
		}
		var buf = new StringBuf();
		var start = 0;
		var i = 0;
		while (i < s.length) {
			var unit = StringTools.fastCodeAt(s, i);
			if (JsString.isPairAt(s, i)) {
				i += 2;
				continue;
			}
			var escaped = unit == mark || unit == BACKSLASH || unit < 0x20 || (unit >= 0x7F && unit < 0xA0) ? escapeUnit(unit) : JsString.isSurrogate(unit) ? "\\u" + StringTools.hex(unit).toLowerCase() : null;
			if (escaped != null) {
				buf.add(s.substring(start, i));
				buf.add(escaped);
				start = i + 1;
			}
			i++;
		}
		buf.add(s.substring(start));
		var quote = String.fromCharCode(mark);
		return quote + buf.toString() + quote;
	}

	static function escapeUnit(unit:Int):String {
		return switch (unit) {
			case 0x08: "\\b";
			case 0x09: "\\t";
			case 0x0A: "\\n";
			case 0x0C: "\\f";
			case 0x0D: "\\r";
			case 0x27: "\\'";
			case 0x5C: "\\\\";
			default: "\\x" + StringTools.hex(unit, 2);
		}
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

	/** An `exec`/`match` result: its elements, then `index`, `input` and `groups` as Node prints them. */
	static function inspectMatch(match:Array<String>, depth:Int):String {
		if (depth > MAX_DEPTH)
			return "[Array]";
		var output = children(depth, [for (element in match) element]);
		currentDepth = depth + 1;
		indentation += 2;
		output = output.concat(RegExp.inspectExtras(match, value -> inspectValue(value, depth + 1)));
		indentation -= 2;
		var values:Array<Dynamic> = [for (element in match) element];
		values.push("");
		var grouped = output.length > 6 ? groupElements(output, values) : output;
		return reduceToSingleString(grouped, output.length, depth + 1, "[", "]");
	}

	/** A dictionary printed like the plain object holding its keys, after `prefix`. */
	static function inspectDict(dict:Dict<Dynamic>, depth:Int, prefix:String):String {
		var keys = dict.keys();
		if (keys.length == 0)
			return prefix + "{}";
		if (depth > MAX_DEPTH)
			return prefix == "" ? "[Object]" : StringTools.trim(prefix);
		var values = children(depth, [for (key in keys) dict.get(key)]);
		var output = [for (i in 0...keys.length) keys[i] + ": " + values[i]];
		return reduceToSingleString(output, output.length, depth + 1, prefix + "{", "}");
	}

	static function inspectObject(value:Dynamic, depth:Int):String {
		var fields = Reflect.fields(value);
		return inspectFields(fields, [for (field in fields) Reflect.field(value, field)], depth);
	}

	static function inspectFields(fields:Array<String>, fieldValues:Array<Dynamic>, depth:Int):String {
		if (fields.length == 0)
			return "{}";
		if (depth > MAX_DEPTH)
			return "[Object]";
		var values = children(depth, fieldValues);
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
		#elseif cpp
		Sys.println(JsString.toWellFormed(line));
		#else
		Sys.println(line);
		#end
	}
}
