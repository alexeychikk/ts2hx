package ts2hx;

/** `String.prototype` and `String` statics with JS semantics: indices are UTF-16 code units on every target. */
class JsString {
	/** JS `s[i]`: the code unit at `i`, or `undefined` out of range. */
	public static function index(s:String, i:Float):Null<String> {
		return i >= 0 && i < s.length && i == Math.ffloor(i) ? s.substr(Std.int(i), 1) : null;
	}

	public static function at(s:String, ?index:Float):Null<String> {
		var k = integerOf(index);
		if (k < 0)
			k += s.length;
		return k < 0 || k >= s.length ? null : s.substr(Std.int(k), 1);
	}

	public static function charAt(s:String, ?pos:Float):String {
		var k = integerOf(pos);
		return k < 0 || k >= s.length ? "" : s.substr(Std.int(k), 1);
	}

	/** JS `charCodeAt`: `NaN` out of range. */
	public static function charCodeAt(s:String, ?pos:Float):Float {
		var k = integerOf(pos);
		return k < 0 || k >= s.length ? Math.NaN : unitAt(s, Std.int(k));
	}

	public static function codePointAt(s:String, ?pos:Float):Null<Float> {
		var k = integerOf(pos);
		return k < 0 || k >= s.length ? null : codePointAtUnit(s, Std.int(k));
	}

	public static function concat(s:String, ...parts:String):String {
		var buf = new StringBuf();
		buf.add(s);
		for (part in parts)
			buf.add(part);
		return buf.toString();
	}

	public static function endsWith(s:String, search:String, ?endPosition:Float):Bool {
		var end = endPosition == null ? s.length : clamp(integerOf(endPosition), s.length);
		var start = end - search.length;
		return start >= 0 && s.substr(start, search.length) == search;
	}

	public static function startsWith(s:String, search:String, ?position:Float):Bool {
		var start = clamp(integerOf(position), s.length);
		return start + search.length <= s.length && s.substr(start, search.length) == search;
	}

	public static function includes(s:String, search:String, ?position:Float):Bool {
		return indexOf(s, search, position) >= 0;
	}

	public static function indexOf(s:String, search:String, ?position:Float):Float {
		return find(s, search, clamp(integerOf(position), s.length));
	}

	public static function lastIndexOf(s:String, search:String, ?position:Float):Float {
		var pos = position == null || Math.isNaN(position) ? Math.POSITIVE_INFINITY : integerOf(position);
		var start = clamp(pos, s.length);
		if (start > s.length - search.length)
			start = s.length - search.length;
		if (start < 0)
			return -1;
		if (search.length == 0)
			return start;
		return s.lastIndexOf(search, start);
	}

	/** JS `localeCompare` without locales: native on JS; elsewhere case-insensitive first, lower case before upper case, then code units (degraded, ADR 0005). */
	public static function localeCompare(s:String, that:String):Float {
		#if js
		return js.Syntax.code("{0}.localeCompare({1})", s, that);
		#else
		var primary = compareUnits(s.toLowerCase(), that.toLowerCase());
		if (primary != 0)
			return primary;
		for (i in 0...Std.int(Math.min(s.length, that.length))) {
			var a = unitAt(s, i);
			var b = unitAt(that, i);
			if (a != b)
				return isLower(a) ? -1 : 1;
		}
		return compareUnits(s, that);
		#end
	}

	/** JS `normalize`: native on JS; elsewhere only Latin-1 letters with combining accents (degraded, ADR 0005). */
	public static function normalize(s:String, ?form:String):String {
		var f = form == null ? "NFC" : form;
		if (f != "NFC" && f != "NFD" && f != "NFKC" && f != "NFKD")
			throw new haxe.Exception("RangeError: The normalization form should be one of NFC, NFD, NFKC, NFKD.");
		#if js
		return js.Syntax.code("{0}.normalize({1})", s, f);
		#else
		return f == "NFC" || f == "NFKC" ? Latin1Normalization.compose(s) : Latin1Normalization.decompose(s);
		#end
	}

	public static function padEnd(s:String, maxLength:Float, ?fill:String):String {
		return s + padding(s, maxLength, fill);
	}

	public static function padStart(s:String, maxLength:Float, ?fill:String):String {
		return padding(s, maxLength, fill) + s;
	}

	public static function repeat(s:String, count:Float):String {
		var n = integerOf(count);
		if (n < 0 || !Math.isFinite(n))
			throw new haxe.Exception("RangeError: Invalid count value: " + Num.toString(count));
		var buf = new StringBuf();
		for (_ in 0...Std.int(n))
			buf.add(s);
		return buf.toString();
	}

	/** JS `replace` with a string pattern: the first match, `$` patterns expanded. */
	public static function replace(s:String, pattern:String, replacement:String):String {
		var at = find(s, pattern, 0);
		if (at < 0)
			return s;
		return s.substr(0, at) + substitution(s, pattern, at, replacement) + s.substr(at + pattern.length);
	}

	/** JS `replace` with a string pattern and a replacer `(match, offset, string)`. */
	public static function replaceWith(s:String, pattern:String, replacer:(String, Float, String) -> String):String {
		var at = find(s, pattern, 0);
		if (at < 0)
			return s;
		return s.substr(0, at) + replacer(pattern, at, s) + s.substr(at + pattern.length);
	}

	public static function replaceAll(s:String, pattern:String, replacement:String):String {
		var buf = new StringBuf();
		var end = 0;
		for (at in matchPositions(s, pattern)) {
			buf.add(s.substr(end, at - end));
			buf.add(substitution(s, pattern, at, replacement));
			end = at + pattern.length;
		}
		buf.add(s.substr(end));
		return buf.toString();
	}

	public static function replaceAllWith(s:String, pattern:String, replacer:(String, Float, String) -> String):String {
		var buf = new StringBuf();
		var end = 0;
		for (at in matchPositions(s, pattern)) {
			buf.add(s.substr(end, at - end));
			buf.add(replacer(pattern, at, s));
			end = at + pattern.length;
		}
		buf.add(s.substr(end));
		return buf.toString();
	}

	public static function slice(s:String, ?start:Float, ?end:Float):String {
		var from = relative(start, s.length, 0);
		var to = relative(end, s.length, s.length);
		return from >= to ? "" : s.substr(from, to - from);
	}

	public static function substring(s:String, ?start:Float, ?end:Float):String {
		var from = clamp(integerOf(start), s.length);
		var to = end == null ? s.length : clamp(integerOf(end), s.length);
		if (from > to) {
			var swap = from;
			from = to;
			to = swap;
		}
		return s.substr(from, to - from);
	}

	public static function substr(s:String, ?start:Float, ?length:Float):String {
		var from = relative(start, s.length, 0);
		var count = length == null ? s.length - from : clamp(integerOf(length), s.length - from);
		return count <= 0 ? "" : s.substr(from, count);
	}

	/** JS `split` with a string separator (or none). */
	public static function split(s:String, ?separator:String, ?limit:Float):Array<String> {
		var max = limit == null ? 4294967295.0 : Num.toUint32(limit);
		if (max == 0)
			return [];
		if (separator == null)
			return [s];
		var result:Array<String> = [];
		if (separator.length == 0) {
			var i = 0;
			while (i < s.length && result.length < max) {
				result.push(s.substr(i, 1));
				i++;
			}
			return result;
		}
		if (s.length == 0)
			return [s];
		var start = 0;
		var at = find(s, separator, 0);
		while (at >= 0) {
			result.push(s.substr(start, at - start));
			if (result.length >= max)
				return result;
			start = at + separator.length;
			at = find(s, separator, start);
		}
		result.push(s.substr(start));
		return result;
	}

	public static function toUpperCase(s:String):String {
		#if js
		return js.Syntax.code("{0}.toUpperCase()", s);
		#else
		var upper = s.toUpperCase();
		for (special in UPPER_SPECIAL) {
			if (upper.indexOf(special.from) >= 0)
				upper = StringTools.replace(upper, special.from, special.to);
		}
		return upper;
		#end
	}

	public static function toLowerCase(s:String):String {
		#if js
		return js.Syntax.code("{0}.toLowerCase()", s);
		#else
		var source = s.indexOf("İ") >= 0 ? StringTools.replace(s, "İ", "i̇") : s;
		var lower = source.toLowerCase();
		return source.indexOf("Σ") >= 0 ? finalSigma(source, lower) : lower;
		#end
	}

	public static function trim(s:String):String {
		return trimEnd(trimStart(s));
	}

	public static function trimStart(s:String):String {
		var start = 0;
		while (start < s.length && isWhitespace(unitAt(s, start)))
			start++;
		return start == 0 ? s : s.substr(start);
	}

	public static function trimEnd(s:String):String {
		var end = s.length;
		while (end > 0 && isWhitespace(unitAt(s, end - 1)))
			end--;
		return end == s.length ? s : s.substr(0, end);
	}

	/** The string's code points as strings: what `for…of` and `[...s]` iterate. */
	public static function codePoints(s:String):Array<String> {
		var result:Array<String> = [];
		var i = 0;
		while (i < s.length) {
			var width = isPairAt(s, i) ? 2 : 1;
			result.push(s.substr(i, width));
			i += width;
		}
		return result;
	}

	/** JS `String.fromCharCode`: each argument is truncated to a UTF-16 code unit. */
	public static function fromCharCode(...codes:Float):String {
		var buf = new StringBuf();
		for (code in codes)
			buf.add(fromUnit(Num.toInt32(code) & 0xFFFF));
		return buf.toString();
	}

	public static function fromCodePoint(...codePoints:Float):String {
		var buf = new StringBuf();
		for (code in codePoints) {
			if (!(code >= 0 && code <= 0x10FFFF && code == Math.ffloor(code)))
				throw new haxe.Exception("RangeError: Invalid code point " + Num.toString(code));
			buf.add(fromCodePointInt(Std.int(code)));
		}
		return buf.toString();
	}

	/** One UTF-16 code unit, lone surrogates included, as a string. */
	public static function fromUnit(unit:Int):String {
		#if cs
		return untyped __cs__("new string((char){0}, 1)", unit);
		#else
		return String.fromCharCode(unit);
		#end
	}

	static function fromCodePointInt(code:Int):String {
		if (code < 0x10000)
			return fromUnit(code);
		var offset = code - 0x10000;
		return fromUnit(0xD800 + (offset >> 10)) + fromUnit(0xDC00 + (offset & 0x3FF));
	}

	static inline function unitAt(s:String, i:Int):Int {
		return StringTools.fastCodeAt(s, i);
	}

	static function isPairAt(s:String, i:Int):Bool {
		if (i + 1 >= s.length)
			return false;
		var high = unitAt(s, i);
		var low = unitAt(s, i + 1);
		return high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF;
	}

	static function codePointAtUnit(s:String, i:Int):Float {
		var high = unitAt(s, i);
		return isPairAt(s, i) ? (high - 0xD800) * 0x400 + (unitAt(s, i + 1) - 0xDC00) + 0x10000 : high;
	}

	/** JS `ToIntegerOrInfinity`; `undefined` and `NaN` are `0`. */
	static function integerOf(value:Null<Float>):Float {
		if (value == null)
			return 0;
		var v:Float = value;
		if (Math.isNaN(v))
			return 0;
		if (!Math.isFinite(v))
			return v;
		return v < 0 ? Math.fceil(v) : Math.ffloor(v);
	}

	static function clamp(value:Float, length:Int):Int {
		return value <= 0 ? 0 : value >= length ? length : Std.int(value);
	}

	/** A `slice`-style index: negative counts from the end. */
	static function relative(value:Null<Float>, length:Int, fallback:Int):Int {
		if (value == null)
			return fallback;
		var k = integerOf(value);
		return clamp(k < 0 ? k + length : k, length);
	}

	static function find(s:String, search:String, start:Int):Int {
		if (search.length == 0)
			return start <= s.length ? start : -1;
		if (start + search.length > s.length)
			return -1;
		return s.indexOf(search, start);
	}

	static function matchPositions(s:String, pattern:String):Array<Int> {
		var positions = [];
		var at = find(s, pattern, 0);
		while (at >= 0) {
			positions.push(at);
			at = find(s, pattern, at + (pattern.length == 0 ? 1 : pattern.length));
		}
		return positions;
	}

	/** ECMA-262 `GetSubstitution` for a string pattern (no capture groups). */
	static function substitution(s:String, matched:String, position:Int, replacement:String):String {
		if (replacement.indexOf("$") < 0)
			return replacement;
		var buf = new StringBuf();
		var i = 0;
		while (i < replacement.length) {
			var c = replacement.charAt(i);
			var next = i + 1 < replacement.length ? replacement.charAt(i + 1) : "";
			if (c == "$" && next == "$") {
				buf.add("$");
				i += 2;
			} else if (c == "$" && next == "&") {
				buf.add(matched);
				i += 2;
			} else if (c == "$" && next == "`") {
				buf.add(s.substr(0, position));
				i += 2;
			} else if (c == "$" && next == "'") {
				buf.add(s.substr(position + matched.length));
				i += 2;
			} else {
				buf.add(c);
				i++;
			}
		}
		return buf.toString();
	}

	static function padding(s:String, maxLength:Float, fill:Null<String>):String {
		var filler = fill == null ? " " : fill;
		var target = integerOf(maxLength);
		if (target <= s.length || filler.length == 0)
			return "";
		var needed = Std.int(target) - s.length;
		var buf = new StringBuf();
		var length = 0;
		while (length + filler.length <= needed) {
			buf.add(filler);
			length += filler.length;
		}
		buf.add(filler.substr(0, needed - length));
		return buf.toString();
	}

	/** JS `WhiteSpace` and `LineTerminator` code units. */
	static function isWhitespace(c:Int):Bool {
		return (c >= 0x09 && c <= 0x0D) || c == 0x20 || c == 0xA0 || c == 0x1680 || (c >= 0x2000 && c <= 0x200A) || c == 0x2028
			|| c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000 || c == 0xFEFF;
	}

	#if !js
	static final UPPER_SPECIAL = [
		{from: "ß", to: "SS"},
		{from: "ŉ", to: "ʼN"},
		{from: "ﬀ", to: "FF"},
		{from: "ﬁ", to: "FI"},
		{from: "ﬂ", to: "FL"},
		{from: "ﬃ", to: "FFI"},
		{from: "ﬄ", to: "FFL"},
		{from: "ﬅ", to: "ST"},
		{from: "ﬆ", to: "ST"},
	];

	static function isCased(c:Int):Bool {
		var ch = fromUnit(c);
		return ch.toLowerCase() != ch.toUpperCase();
	}

	/** `Σ` lowers to `ς` at the end of a word (Unicode Final_Sigma). */
	static function finalSigma(source:String, lower:String):String {
		var buf = new StringBuf();
		for (i in 0...source.length) {
			var isFinal = unitAt(source, i) == 0x3A3 && i > 0 && isCased(unitAt(source, i - 1))
				&& (i + 1 >= source.length || !isCased(unitAt(source, i + 1)));
			buf.add(isFinal ? "ς" : lower.substr(i, 1));
		}
		return buf.toString();
	}

	static function isLower(c:Int):Bool {
		var ch = fromUnit(c);
		return ch == ch.toLowerCase() && ch != ch.toUpperCase();
	}

	/** Compares two strings by UTF-16 code units, like JS `<`. */
	public static function compareUnits(a:String, b:String):Int {
		for (i in 0...Std.int(Math.min(a.length, b.length))) {
			var diff = unitAt(a, i) - unitAt(b, i);
			if (diff != 0)
				return diff < 0 ? -1 : 1;
		}
		return a.length == b.length ? 0 : a.length < b.length ? -1 : 1;
	}
	#end
}

#if !js
/** Canonical (de)composition of Latin-1 and Latin Extended-A letters: the `normalize` subset outside JS. */
private class Latin1Normalization {
	/** Triples of composed letter, base letter, combining mark. */
	static final TABLE = [
		192, 65, 768, 193, 65, 769, 194, 65, 770, 195, 65, 771, 196, 65, 776, 197, 65, 778, 199, 67, 807, 200, 69, 768,
		201, 69, 769, 202, 69, 770, 203, 69, 776, 204, 73, 768, 205, 73, 769, 206, 73, 770, 207, 73, 776, 209, 78, 771,
		210, 79, 768, 211, 79, 769, 212, 79, 770, 213, 79, 771, 214, 79, 776, 217, 85, 768, 218, 85, 769, 219, 85, 770,
		220, 85, 776, 221, 89, 769, 224, 97, 768, 225, 97, 769, 226, 97, 770, 227, 97, 771, 228, 97, 776, 229, 97, 778,
		231, 99, 807, 232, 101, 768, 233, 101, 769, 234, 101, 770, 235, 101, 776, 236, 105, 768, 237, 105, 769, 238, 105, 770,
		239, 105, 776, 241, 110, 771, 242, 111, 768, 243, 111, 769, 244, 111, 770, 245, 111, 771, 246, 111, 776, 249, 117, 768,
		250, 117, 769, 251, 117, 770, 252, 117, 776, 253, 121, 769, 255, 121, 776, 256, 65, 772, 257, 97, 772, 258, 65, 774,
		259, 97, 774, 260, 65, 808, 261, 97, 808, 262, 67, 769, 263, 99, 769, 264, 67, 770, 265, 99, 770, 266, 67, 775,
		267, 99, 775, 268, 67, 780, 269, 99, 780, 270, 68, 780, 271, 100, 780, 274, 69, 772, 275, 101, 772, 276, 69, 774,
		277, 101, 774, 278, 69, 775, 279, 101, 775, 280, 69, 808, 281, 101, 808, 282, 69, 780, 283, 101, 780, 284, 71, 770,
		285, 103, 770, 286, 71, 774, 287, 103, 774, 288, 71, 775, 289, 103, 775, 290, 71, 807, 291, 103, 807, 292, 72, 770,
		293, 104, 770, 296, 73, 771, 297, 105, 771, 298, 73, 772, 299, 105, 772, 300, 73, 774, 301, 105, 774, 302, 73, 808,
		303, 105, 808, 304, 73, 775, 308, 74, 770, 309, 106, 770, 310, 75, 807, 311, 107, 807, 313, 76, 769, 314, 108, 769,
		315, 76, 807, 316, 108, 807, 317, 76, 780, 318, 108, 780, 323, 78, 769, 324, 110, 769, 325, 78, 807, 326, 110, 807,
		327, 78, 780, 328, 110, 780, 332, 79, 772, 333, 111, 772, 334, 79, 774, 335, 111, 774, 336, 79, 779, 337, 111, 779,
		340, 82, 769, 341, 114, 769, 342, 82, 807, 343, 114, 807, 344, 82, 780, 345, 114, 780, 346, 83, 769, 347, 115, 769,
		348, 83, 770, 349, 115, 770, 350, 83, 807, 351, 115, 807, 352, 83, 780, 353, 115, 780, 354, 84, 807, 355, 116, 807,
		356, 84, 780, 357, 116, 780, 360, 85, 771, 361, 117, 771, 362, 85, 772, 363, 117, 772, 364, 85, 774, 365, 117, 774,
		366, 85, 778, 367, 117, 778, 368, 85, 779, 369, 117, 779, 370, 85, 808, 371, 117, 808, 372, 87, 770, 373, 119, 770,
		374, 89, 770, 375, 121, 770, 376, 89, 776, 377, 90, 769, 378, 122, 769, 379, 90, 775, 380, 122, 775, 381, 90, 780,
		382, 122, 780,
	];

	public static function decompose(s:String):String {
		var buf = new StringBuf();
		for (i in 0...s.length) {
			var unit = StringTools.fastCodeAt(s, i);
			var row = rowOf(unit, 0);
			if (row < 0) {
				buf.add(JsString.fromUnit(unit));
			} else {
				buf.add(JsString.fromUnit(TABLE[row + 1]));
				buf.add(JsString.fromUnit(TABLE[row + 2]));
			}
		}
		return buf.toString();
	}

	public static function compose(s:String):String {
		var decomposed = decompose(s);
		var buf = new StringBuf();
		var i = 0;
		while (i < decomposed.length) {
			var unit = StringTools.fastCodeAt(decomposed, i);
			var composed = i + 1 < decomposed.length ? composedOf(unit, StringTools.fastCodeAt(decomposed, i + 1)) : -1;
			buf.add(JsString.fromUnit(composed < 0 ? unit : composed));
			i += composed < 0 ? 1 : 2;
		}
		return buf.toString();
	}

	static function rowOf(value:Int, column:Int):Int {
		var row = 0;
		while (row < TABLE.length) {
			if (TABLE[row + column] == value)
				return row;
			row += 3;
		}
		return -1;
	}

	static function composedOf(base:Int, mark:Int):Int {
		if (mark < 0x300 || mark > 0x36F)
			return -1;
		var row = 0;
		while (row < TABLE.length) {
			if (TABLE[row + 1] == base && TABLE[row + 2] == mark)
				return TABLE[row];
			row += 3;
		}
		return -1;
	}
}
#end
