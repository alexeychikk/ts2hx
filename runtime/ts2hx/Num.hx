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
