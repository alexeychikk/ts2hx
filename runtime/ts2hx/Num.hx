package ts2hx;

#if cpp
@:cppFileCode('
#include <cstdio>
#include <cstdlib>

static ::String ts2hx_shortest_exponential(double value) {
	char buffer[40];
	for (int precision = 0; precision < 17; precision++) {
		snprintf(buffer, sizeof(buffer), "%.*e", precision, value);
		if (strtod(buffer, nullptr) == value) {
			return ::String::create(buffer);
		}
	}
	snprintf(buffer, sizeof(buffer), "%.16e", value);
	return ::String::create(buffer);
}
')
#end
/** JS `Number` semantics on every target (ADR 0002). */
class Num {
	/** JS `Number.prototype.toString()`: the shortest string that round-trips. */
	public static function toString(value:Float):String {
		#if js
		return js.Syntax.code("String({0})", value);
		#else
		if (Math.isNaN(value))
			return "NaN";
		if (value == 0)
			return "0";
		if (!Math.isFinite(value))
			return value > 0 ? "Infinity" : "-Infinity";
		var sign = value < 0 ? "-" : "";
		return sign + formatShortest(shortestExponential(Math.abs(value)));
		#end
	}

	/** JS truthiness of a number: neither `0`, `-0` nor `NaN`. */
	public static function truthy(value:Float):Bool {
		return value != 0 && !Math.isNaN(value);
	}

	/** JS `ToInt32`: truncates and wraps modulo 2^32 into the signed range. */
	public static function toInt32(value:Float):Int {
		#if js
		return js.Syntax.code("{0} | 0", value);
		#else
		if (!Math.isFinite(value))
			return 0;
		var truncated = value < 0 ? Math.fceil(value) : Math.ffloor(value);
		var wrapped = truncated % TWO_POW_32;
		if (wrapped < 0)
			wrapped += TWO_POW_32;
		if (wrapped >= TWO_POW_31)
			wrapped -= TWO_POW_32;
		return Std.int(wrapped);
		#end
	}

	/** JS `ToUint32`, as a Float since it may exceed the Int range. */
	public static function toUint32(value:Float):Float {
		var signed:Float = toInt32(value);
		return signed < 0 ? signed + TWO_POW_32 : signed;
	}

	/** JS `a << b`. */
	public static function shl(a:Float, b:Float):Float {
		return toInt32(a) << (toInt32(b) & 31);
	}

	/** JS `a >> b`. */
	public static function shr(a:Float, b:Float):Float {
		return toInt32(a) >> (toInt32(b) & 31);
	}

	/** JS `a >>> b`. */
	public static function ushr(a:Float, b:Float):Float {
		var shift = toInt32(b) & 31;
		var result:Float = toInt32(a) >>> shift;
		return result < 0 ? result + TWO_POW_32 : result;
	}

	/** JS `a ** b`: unlike C# and C++ `pow`, `1 ** NaN` and `(-1) ** ±Infinity` are `NaN`. */
	public static function pow(base:Float, exponent:Float):Float {
		if (Math.isNaN(exponent))
			return Math.NaN;
		if (!Math.isFinite(exponent) && Math.abs(base) == 1)
			return Math.NaN;
		return Math.pow(base, exponent);
	}

	/** JS `Number(string)`: trimmed decimal, `0x`/`0o`/`0b` integers, `Infinity`; anything else is `NaN`. */
	public static function fromString(text:String):Float {
		var s = StringTools.trim(text);
		if (s == "")
			return 0;
		var sign = 1.0;
		var unsigned = s;
		if (s.charAt(0) == "+" || s.charAt(0) == "-") {
			sign = s.charAt(0) == "-" ? -1.0 : 1.0;
			unsigned = s.substr(1);
		}
		if (unsigned == "Infinity")
			return sign * Math.POSITIVE_INFINITY;
		if (unsigned != s)
			return DECIMAL.match(unsigned) ? sign * Std.parseFloat(unsigned) : Math.NaN;
		if (RADIX_INTEGER.match(s))
			return parseRadix(s.substr(2), radixOf(s.charAt(1)));
		return DECIMAL.match(s) ? Std.parseFloat(s) : Math.NaN;
	}

	static final TWO_POW_31 = 2147483648.0;
	static final TWO_POW_32 = 4294967296.0;
	static final DECIMAL = ~/^([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$/;
	static final RADIX_INTEGER = ~/^0([xX][0-9a-fA-F]+|[oO][0-7]+|[bB][01]+)$/;

	static function radixOf(marker:String):Int {
		return switch (marker.toLowerCase()) {
			case "x": 16;
			case "o": 8;
			default: 2;
		}
	}

	static function parseRadix(digits:String, radix:Int):Float {
		var result = 0.0;
		for (i in 0...digits.length) {
			result = result * radix + "0123456789abcdef".indexOf(digits.charAt(i).toLowerCase());
		}
		return result;
	}

	#if !js
	/** Shortest round-trip digits of a positive finite value as `d.ddde±x` (any case, any exponent padding). */
	static function shortestExponential(value:Float):String {
		#if cs
		return untyped __cs__("{0}.ToString(\"R\", System.Globalization.CultureInfo.InvariantCulture)", value);
		#elseif cpp
		return untyped __cpp__("ts2hx_shortest_exponential({0})", value);
		#else
		return Std.string(value);
		#end
	}

	/** Formats `digits × 10^exponent` per ECMA-262 Number::toString (radix 10). */
	static function formatShortest(text:String):String {
		var lower = text.toLowerCase();
		var ePos = lower.indexOf("e");
		var mantissa = ePos < 0 ? lower : lower.substr(0, ePos);
		var exponent = ePos < 0 ? 0 : Std.parseInt(StringTools.replace(lower.substr(ePos + 1), "+", ""));
		var dot = mantissa.indexOf(".");
		var digits = dot < 0 ? mantissa : mantissa.substr(0, dot) + mantissa.substr(dot + 1);
		var pointAt = (dot < 0 ? mantissa.length : dot) + exponent;
		var leadingZeros = 0;
		while (leadingZeros < digits.length - 1 && digits.charAt(leadingZeros) == "0")
			leadingZeros++;
		digits = digits.substr(leadingZeros);
		pointAt -= leadingZeros;
		var end = digits.length;
		while (end > 1 && digits.charAt(end - 1) == "0")
			end--;
		digits = digits.substr(0, end);
		return layout(digits, pointAt);
	}

	/** `digits` has no leading/trailing zeros; the value is `0.digits × 10^pointAt`. */
	static function layout(digits:String, n:Int):String {
		var k = digits.length;
		if (k <= n && n <= 21)
			return digits + StringTools.lpad("", "0", n - k);
		if (0 < n && n <= 21)
			return digits.substr(0, n) + "." + digits.substr(n);
		if (-6 < n && n <= 0)
			return "0." + StringTools.lpad("", "0", -n) + digits;
		var e = n - 1;
		var exponent = (e < 0 ? "-" : "+") + Std.string(e < 0 ? -e : e);
		if (k == 1)
			return digits + "e" + exponent;
		return digits.charAt(0) + "." + digits.substr(1) + "e" + exponent;
	}
	#end
}
