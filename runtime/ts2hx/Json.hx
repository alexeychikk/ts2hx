package ts2hx;

import ts2hx.Error.SyntaxError;
import ts2hx.Error.TypeError;

/**
 * JS `JSON` (ADR 0005). `stringify` enumerates keys through `Obj.keys`, so they follow
 * JS order on every target; `null` and `undefined` are merged (ADR 0002), so a field
 * holding either prints `null`. `parse` builds plain objects in source key order.
 */
class Json {
	/** JS `JSON.stringify(value, replacer, space)`; `null` where JS returns `undefined`. */
	public static function stringify(value:Dynamic, ?replacer:Dynamic, ?space:Dynamic):Null<String> {
		var writer = new JsonWriter(replacer, gapOf(space));
		return writer.write(null, "", value, "");
	}

	/** JS `JSON.parse(text, reviver)`; malformed text throws a `SyntaxError`. */
	public static function parse(text:String, ?reviver:(String, Dynamic) -> Dynamic):Dynamic {
		#if js
		try {
			return js.Syntax.code("JSON.parse({0}, {1})", text, reviver);
		} catch (error:Dynamic) {
			throw new SyntaxError(Ts2hx.string(Reflect.field(error, "message")));
		}
		#else
		var value = new JsonParser(text).parseDocument();
		return reviver == null ? value : revive(reviver, Obj.fromFields([""], [value]), "");
		#end
	}

	static function revive(reviver:(String, Dynamic) -> Dynamic, holder:Dynamic, key:String):Dynamic {
		var value:Dynamic = Obj.get(holder, key);
		if (Std.isOfType(value, Array)) {
			var array:Array<Dynamic> = value;
			for (i in 0...array.length)
				array[i] = revive(reviver, array, Std.string(i));
		} else if (isPlainObject(value)) {
			for (field in Obj.keys(value))
				Reflect.setField(value, field, revive(reviver, value, field));
		}
		return reviver(key, value);
	}

	static function gapOf(space:Dynamic):String {
		if (Std.isOfType(space, String))
			return (space : String).substr(0, 10);
		if (Std.isOfType(space, Float)) {
			var count = Std.int(Math.min(10, Math.max(0, Math.ffloor(space))));
			return StringTools.lpad("", " ", count);
		}
		return "";
	}

	/** JSON string literal of `s`: `"`, `\\` and control characters escaped, lone surrogates as `\uXXXX`. */
	public static function quote(s:String):String {
		var buf = new StringBuf();
		buf.add('"');
		var start = 0;
		var i = 0;
		while (i < s.length) {
			if (JsString.isPairAt(s, i)) {
				i += 2;
				continue;
			}
			var unit = StringTools.fastCodeAt(s, i);
			var escaped = switch (unit) {
				case 0x22: '\\"';
				case 0x5C: "\\\\";
				case 0x08: "\\b";
				case 0x0C: "\\f";
				case 0x0A: "\\n";
				case 0x0D: "\\r";
				case 0x09: "\\t";
				case _ if (unit < 0x20 || JsString.isSurrogate(unit)): "\\u" + StringTools.hex(unit, 4).toLowerCase();
				case _: null;
			}
			if (escaped != null) {
				buf.add(s.substring(start, i));
				buf.add(escaped);
				start = i + 1;
			}
			i++;
		}
		buf.add(s.substring(start));
		buf.add('"');
		return buf.toString();
	}

	public static function isPlainObject(value:Dynamic):Bool {
		return value != null && Reflect.isObject(value) && Type.getClass(value) == null && !Std.isOfType(value, String)
			&& !Std.isOfType(value, Bool) && !Std.isOfType(value, Float) && !Reflect.isFunction(value);
	}
}

private class JsonWriter {
	final replacer:Null<(String, Dynamic) -> Dynamic>;
	final allowed:Null<Array<String>>;
	final gap:String;
	final stack:Array<Dynamic> = [];

	public function new(replacer:Dynamic, gap:String) {
		this.gap = gap;
		if (Std.isOfType(replacer, Array)) {
			allowed = [];
			for (item in (replacer : Array<Dynamic>)) {
				var key = Std.isOfType(item, String) ? item : Std.isOfType(item, Float) ? Num.toString(item) : null;
				if (key != null && allowed.indexOf(key) < 0)
					allowed.push(key);
			}
			this.replacer = null;
		} else {
			allowed = null;
			this.replacer = Reflect.isFunction(replacer) ? replacer : null;
		}
	}

	/** The JSON text of `holder[key]`, or `null` when JS omits it (`undefined`, functions). */
	public function write(holder:Dynamic, key:String, value:Dynamic, indent:String):Null<String> {
		value = toJson(value, key);
		if (replacer != null)
			value = replacer(key, value);
		if (value == null)
			return "null";
		if (Std.isOfType(value, String))
			return Json.quote(value);
		if (Std.isOfType(value, Bool))
			return value ? "true" : "false";
		if (Std.isOfType(value, Float)) {
			var number:Float = value;
			return Math.isFinite(number) ? Num.toString(number == 0 ? 0.0 : number) : "null";
		}
		if (Reflect.isFunction(value))
			return null;
		if (stack.indexOf(value) >= 0)
			throw new TypeError("Converting circular structure to JSON");
		stack.push(value);
		var text = Std.isOfType(value, Array) ? writeArray(value, indent) : writeObject(value, indent);
		stack.pop();
		return text;
	}

	function writeArray(array:Array<Dynamic>, indent:String):String {
		if (array.length == 0)
			return "[]";
		var inner = indent + gap;
		var parts = [];
		for (i in 0...array.length) {
			var part = write(array, Std.string(i), array[i], inner);
			parts.push(part == null ? "null" : part);
		}
		return wrap("[", parts, "]", indent);
	}

	function writeObject(object:Dynamic, indent:String):String {
		var keys = Obj.keys(object);
		if (allowed != null)
			keys = allowed.filter(key -> keys.indexOf(key) >= 0);
		var inner = indent + gap;
		var parts = [];
		for (key in keys) {
			var part = write(object, key, Obj.get(object, key), inner);
			if (part != null)
				parts.push(Json.quote(key) + (gap == "" ? ":" : ": ") + part);
		}
		if (parts.length == 0)
			return "{}";
		return wrap("{", parts, "}", indent);
	}

	function wrap(open:String, parts:Array<String>, close:String, indent:String):String {
		if (gap == "")
			return open + parts.join(",") + close;
		var inner = indent + gap;
		return open + "\n" + inner + parts.join(",\n" + inner) + "\n" + indent + close;
	}

	static function toJson(value:Dynamic, key:String):Dynamic {
		if (value == null || Std.isOfType(value, String) || Std.isOfType(value, Bool) || Std.isOfType(value, Float) || Std.isOfType(value, Array))
			return value;
		if (Type.getClass(value) == null && (!Reflect.isObject(value) || Reflect.isFunction(value) || !Reflect.hasField(value, "toJSON")))
			return value;
		var method = Reflect.field(value, "toJSON");
		return Reflect.isFunction(method) ? Reflect.callMethod(value, method, []) : value;
	}
}

#if !js
private class JsonParser {
	final text:String;
	var pos = 0;

	public function new(text:String) {
		this.text = text;
	}

	public function parseDocument():Dynamic {
		skipSpace();
		var value = parseValue();
		skipSpace();
		if (pos < text.length)
			fail();
		return value;
	}

	function parseValue():Dynamic {
		if (pos >= text.length)
			throw new SyntaxError("Unexpected end of JSON input");
		return switch (code()) {
			case "{".code: parseObject();
			case "[".code: parseArray();
			case '"'.code: parseString();
			case "t".code: literal("true", true);
			case "f".code: literal("false", false);
			case "n".code: literal("null", null);
			case c if (c == "-".code || (c >= "0".code && c <= "9".code)): parseNumber();
			case _: fail();
		}
	}

	function parseObject():Dynamic {
		pos++;
		var keys = [];
		var values:Array<Dynamic> = [];
		skipSpace();
		if (peek("}")) {
			pos++;
			return Obj.fromFields(keys, values);
		}
		while (true) {
			skipSpace();
			if (!peek('"'))
				fail();
			var key = parseString();
			skipSpace();
			expect(":");
			skipSpace();
			var value = parseValue();
			var existing = keys.indexOf(key);
			if (existing >= 0)
				values[existing] = value;
			else {
				keys.push(key);
				values.push(value);
			}
			skipSpace();
			if (peek(",")) {
				pos++;
				continue;
			}
			expect("}");
			return Obj.fromFields(keys, values);
		}
	}

	function parseArray():Array<Dynamic> {
		pos++;
		var values:Array<Dynamic> = [];
		skipSpace();
		if (peek("]")) {
			pos++;
			return values;
		}
		while (true) {
			skipSpace();
			values.push(parseValue());
			skipSpace();
			if (peek(",")) {
				pos++;
				continue;
			}
			expect("]");
			return values;
		}
	}

	function parseString():String {
		pos++;
		var buf = new StringBuf();
		var start = pos;
		while (true) {
			if (pos >= text.length)
				throw new SyntaxError("Unterminated string in JSON at position " + pos);
			var c = code();
			if (c == '"'.code) {
				buf.add(text.substring(start, pos));
				pos++;
				return buf.toString();
			}
			if (c < 0x20)
				fail();
			if (c != "\\".code) {
				pos++;
				continue;
			}
			buf.add(text.substring(start, pos));
			pos++;
			if (pos >= text.length)
				fail();
			var escape = code();
			pos++;
			switch (escape) {
				case '"'.code:
					buf.add('"');
				case "\\".code:
					buf.add("\\");
				case "/".code:
					buf.add("/");
				case "b".code:
					buf.add("\x08");
				case "f".code:
					buf.add("\x0C");
				case "n".code:
					buf.add("\n");
				case "r".code:
					buf.add("\r");
				case "t".code:
					buf.add("\t");
				case "u".code:
					buf.add(unicodeEscape());
				case _:
					pos--;
					fail();
			}
			start = pos;
		}
	}

	function unicodeEscape():String {
		var unit = hex4();
		if (unit >= 0xD800 && unit <= 0xDBFF && text.substr(pos, 2) == "\\u") {
			var save = pos;
			pos += 2;
			var low = hex4();
			if (low >= 0xDC00 && low <= 0xDFFF)
				return JsString.fromCodePoint(0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00));
			pos = save;
		}
		return JsString.fromUnit(unit);
	}

	function hex4():Int {
		var digits = text.substr(pos, 4);
		if (digits.length < 4 || !~/^[0-9a-fA-F]{4}$/.match(digits))
			fail();
		pos += 4;
		return Std.parseInt("0x" + digits);
	}

	function parseNumber():Float {
		var start = pos;
		if (peek("-"))
			pos++;
		if (peek("0"))
			pos++;
		else if (!digits())
			fail();
		if (peek(".")) {
			pos++;
			if (!digits())
				fail();
		}
		if (peek("e") || peek("E")) {
			pos++;
			if (peek("+") || peek("-"))
				pos++;
			if (!digits())
				fail();
		}
		return Num.fromString(text.substring(start, pos));
	}

	function digits():Bool {
		var start = pos;
		while (pos < text.length && code() >= "0".code && code() <= "9".code)
			pos++;
		return pos > start;
	}

	function literal(word:String, value:Dynamic):Dynamic {
		if (text.substr(pos, word.length) != word)
			fail();
		pos += word.length;
		return value;
	}

	function skipSpace():Void {
		while (pos < text.length) {
			var c = code();
			if (c != " ".code && c != "\t".code && c != "\n".code && c != "\r".code)
				return;
			pos++;
		}
	}

	inline function code():Int {
		return StringTools.fastCodeAt(text, pos);
	}

	inline function peek(s:String):Bool {
		return pos < text.length && StringTools.fastCodeAt(text, pos) == StringTools.fastCodeAt(s, 0);
	}

	function expect(s:String):Void {
		if (!peek(s))
			fail();
		pos++;
	}

	function fail():Dynamic {
		if (pos >= text.length)
			throw new SyntaxError("Unexpected end of JSON input");
		throw new SyntaxError("Unexpected token '" + text.charAt(pos) + "', \"" + text + "\" is not valid JSON");
	}
}
#end
