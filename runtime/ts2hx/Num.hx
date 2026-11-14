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
		return sign + formatShortest(Math.abs(value));
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

	/** JS `Number.prototype.toString(radix)`; V8's digit generation for fractions. */
	public static function toStringRadix(value:Float, ?radix:Float):String {
		var r = radix == null ? 10.0 : toIntegerOrInfinity(radix);
		if (!(r >= 2 && r <= 36))
			throw new haxe.Exception("RangeError: toString() radix must be between 2 and 36");
		if (r == 10)
			return toString(value);
		#if js
		return js.Syntax.code("{0}.toString({1})", value, r);
		#else
		if (Math.isNaN(value))
			return "NaN";
		if (!Math.isFinite(value))
			return value > 0 ? "Infinity" : "-Infinity";
		return radixString(value, Std.int(r));
		#end
	}

	/** JS `toFixed`: exact decimal value of the double, ties away from zero. */
	public static function toFixed(value:Float, ?fractionDigits:Float):String {
		var f = digitsArgument(fractionDigits, 0, 0, 100, "toFixed() digits");
		#if js
		return js.Syntax.code("{0}.toFixed({1})", value, f);
		#else
		if (Math.isNaN(value))
			return "NaN";
		if (Math.abs(value) >= 1e21 || !Math.isFinite(value))
			return toString(value);
		var sign = value < 0 ? "-" : "";
		var exact = exactDecimal(Math.abs(value));
		var n:String;
		if (f >= exact.scale) {
			n = exact.digits + zeros(f - exact.scale);
		} else {
			var keep = exact.digits.length - (exact.scale - f);
			n = keep <= 0 ? "0" : exact.digits.substr(0, keep);
			if (keep >= 0 && keep < exact.digits.length && exact.digits.charCodeAt(keep) >= "5".code)
				n = incrementDecimal(n);
		}
		if (f == 0)
			return sign + n;
		if (n.length <= f)
			n = zeros(f + 1 - n.length) + n;
		return sign + n.substr(0, n.length - f) + "." + n.substr(n.length - f);
		#end
	}

	/** JS `toPrecision`; without `precision` it is `toString()`. */
	public static function toPrecision(value:Float, ?precision:Float):String {
		if (precision == null)
			return toString(value);
		#if js
		if (!Math.isFinite(value))
			return toString(value);
		var p = digitsArgument(precision, 0, 1, 100, "toPrecision() argument");
		return js.Syntax.code("{0}.toPrecision({1})", value, p);
		#else
		if (Math.isNaN(value))
			return "NaN";
		if (!Math.isFinite(value))
			return value > 0 ? "Infinity" : "-Infinity";
		var p = digitsArgument(precision, 0, 1, 100, "toPrecision() argument");
		if (value == 0)
			return p == 1 ? "0" : "0." + zeros(p - 1);
		var sign = value < 0 ? "-" : "";
		var rounded = roundSignificant(Math.abs(value), p);
		var n = rounded.digits;
		var e = rounded.exponent;
		if (e < -6 || e >= p)
			return sign + n.charAt(0) + (p > 1 ? "." + n.substr(1) : "") + "e" + (e >= 0 ? "+" : "-") + Std.string(e < 0 ? -e : e);
		if (e == p - 1)
			return sign + n;
		if (e >= 0)
			return sign + n.substr(0, e + 1) + "." + n.substr(e + 1);
		return sign + "0." + zeros(-(e + 1)) + n;
		#end
	}

	/** JS `toExponential`; without `fractionDigits`, as many digits as needed to round-trip. */
	public static function toExponential(value:Float, ?fractionDigits:Float):String {
		#if js
		if (!Math.isFinite(value))
			return toString(value);
		return fractionDigits == null ? js.Syntax.code("{0}.toExponential()", value) : js.Syntax.code("{0}.toExponential({1})", value,
			digitsArgument(fractionDigits, 0, 0, 100, "toExponential() argument"));
		#else
		if (Math.isNaN(value))
			return "NaN";
		if (!Math.isFinite(value))
			return value > 0 ? "Infinity" : "-Infinity";
		var f = fractionDigits == null ? -1 : digitsArgument(fractionDigits, 0, 0, 100, "toExponential() argument");
		var sign = value < 0 ? "-" : "";
		var digits:String;
		var e:Int;
		if (value == 0) {
			digits = f < 0 ? "0" : zeros(f + 1);
			e = 0;
		} else if (f < 0) {
			var shortest = shortestDigits(Math.abs(value));
			digits = shortest.digits;
			e = shortest.pointAt - 1;
		} else {
			var rounded = roundSignificant(Math.abs(value), f + 1);
			digits = rounded.digits;
			e = rounded.exponent;
		}
		return sign + digits.charAt(0) + (digits.length > 1 ? "." + digits.substr(1) : "") + "e" + (e >= 0 ? "+" : "-")
			+ Std.string(e < 0 ? -e : e);
		#end
	}

	/** JS `parseInt`: leading whitespace, sign, `0x` prefix, the longest run of digits of `radix`. */
	public static function parseInt(text:String, ?radix:Float):Float {
		#if js
		return js.Syntax.code("parseInt({0}, {1})", text, radix);
		#else
		var s = JsString.trimStart(text);
		var sign = 1.0;
		if (s.length > 0 && (s.charAt(0) == "+" || s.charAt(0) == "-")) {
			sign = s.charAt(0) == "-" ? -1.0 : 1.0;
			s = s.substr(1);
		}
		var r = radix == null ? 0 : toInt32(radix);
		var stripPrefix = true;
		if (r != 0) {
			if (r < 2 || r > 36)
				return Math.NaN;
			stripPrefix = r == 16;
		} else {
			r = 10;
		}
		if (stripPrefix && s.length >= 2 && s.charAt(0) == "0" && (s.charAt(1) == "x" || s.charAt(1) == "X")) {
			s = s.substr(2);
			r = 16;
		}
		var end = 0;
		while (end < s.length && digitValue(StringTools.fastCodeAt(s, end)) < r)
			end++;
		if (end == 0)
			return Math.NaN;
		var digits = s.substr(0, end);
		if (r == 10)
			return sign * Std.parseFloat(digits);
		var result = 0.0;
		for (i in 0...end)
			result = result * r + digitValue(StringTools.fastCodeAt(digits, i));
		return sign * result;
		#end
	}

	/** JS `parseFloat`: the longest decimal prefix after leading whitespace. */
	public static function parseFloat(text:String):Float {
		#if js
		return js.Syntax.code("parseFloat({0})", text);
		#else
		var s = JsString.trimStart(text);
		if (!FLOAT_PREFIX.match(s))
			return Math.NaN;
		var sign = FLOAT_PREFIX.matched(1) == "-" ? -1.0 : 1.0;
		var body = FLOAT_PREFIX.matched(2);
		if (body == "Infinity")
			return sign * Math.POSITIVE_INFINITY;
		return sign * Std.parseFloat(body);
		#end
	}

	public static function isInteger(value:Float):Bool {
		return Math.isFinite(value) && Math.ffloor(value) == value;
	}

	public static function isSafeInteger(value:Float):Bool {
		return isInteger(value) && Math.abs(value) <= 9007199254740991.0;
	}

	static function digitsArgument(value:Null<Float>, fallback:Int, min:Int, max:Int, what:String):Int {
		var v:Float = value == null || Math.isNaN(value) ? fallback : toIntegerOrInfinity(value);
		if (v < min || v > max)
			throw new haxe.Exception("RangeError: " + what + " must be between " + min + " and " + max);
		return Std.int(v);
	}

	/** JS `ToIntegerOrInfinity`: truncates toward zero, NaN reads as 0. */
	static function toIntegerOrInfinity(value:Float):Float {
		if (Math.isNaN(value))
			return 0;
		return value < 0 ? Math.fceil(value) : Math.ffloor(value);
	}

	static function digitValue(code:Int):Int {
		if (code >= "0".code && code <= "9".code)
			return code - "0".code;
		if (code >= "a".code && code <= "z".code)
			return code - "a".code + 10;
		if (code >= "A".code && code <= "Z".code)
			return code - "A".code + 10;
		return 99;
	}

	static function zeros(count:Int):String {
		return count <= 0 ? "" : StringTools.lpad("", "0", count);
	}

	static final FLOAT_PREFIX = ~/^([+-]?)(Infinity|([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?)/;

	#if !js
	/** `value` (positive, finite) as `digits / 10^scale` exactly: a double is `m × 2^e`, and `2^-k = 5^k / 10^k`. */
	static function exactDecimal(value:Float):{digits:String, scale:Int} {
		var m = value;
		var twos = 0;
		while (m >= 9007199254740992.0) {
			m /= 2;
			twos++;
		}
		var halves = 0;
		while (m != Math.ffloor(m)) {
			m *= 2;
			halves++;
		}
		var big = BigDecimalDigits.fromFloat(m);
		BigDecimalDigits.multiplyPower(big, 2, twos);
		BigDecimalDigits.multiplyPower(big, 5, halves);
		return {digits: BigDecimalDigits.toDecimal(big), scale: halves};
	}

	/** `value` (positive, finite) rounded to `count` significant digits, ties up: `d.ddd × 10^exponent`. */
	static function roundSignificant(value:Float, count:Int):{digits:String, exponent:Int} {
		var exact = exactDecimal(value);
		var digits = exact.digits;
		var leading = 0;
		while (leading < digits.length - 1 && digits.charAt(leading) == "0")
			leading++;
		digits = digits.substr(leading);
		var exponent = digits.length - exact.scale - 1;
		var n = digits.length >= count ? digits.substr(0, count) : digits + zeros(count - digits.length);
		if (digits.length > count && digits.charCodeAt(count) >= "5".code) {
			n = incrementDecimal(n);
			if (n.length > count) {
				n = n.substr(0, count);
				exponent++;
			}
		}
		return {digits: n, exponent: exponent};
	}

	static function incrementDecimal(n:String):String {
		var chars = [for (i in 0...n.length) n.charCodeAt(i) - "0".code];
		var i = chars.length - 1;
		while (i >= 0) {
			if (chars[i] < 9) {
				chars[i]++;
				break;
			}
			chars[i] = 0;
			i--;
		}
		var result = (i < 0 ? "1" : "") + [for (c in chars) Std.string(c)].join("");
		return result;
	}

	static function shortestDigits(value:Float):{digits:String, pointAt:Int} {
		var lower = shortestExponential(value).toLowerCase();
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
		return {digits: digits.substr(0, end), pointAt: pointAt};
	}

	static function nextDouble(value:Float):Float {
		var bits = haxe.io.FPHelper.doubleToI64(value);
		return haxe.io.FPHelper.i64ToDouble(bits.low + 1, bits.low + 1 == 0 ? bits.high + 1 : bits.high);
	}

	/** V8's `DoubleToRadixCString`: fraction digits up to the double's precision, rounded to even. */
	static function radixString(input:Float, radix:Int):String {
		var chars = "0123456789abcdefghijklmnopqrstuvwxyz";
		var negative = input < 0;
		var value = negative ? -input : input;
		var integer = Math.ffloor(value);
		var fraction = value - integer;
		var delta = Math.max(nextDouble(0.0), 0.5 * (nextDouble(value) - value));
		var fractionDigits:Array<Int> = [];
		if (fraction >= delta) {
			do {
				fraction *= radix;
				delta *= radix;
				var digit = Std.int(fraction);
				fractionDigits.push(digit);
				fraction -= digit;
				if (fraction > 0.5 || (fraction == 0.5 && (digit & 1) == 1)) {
					if (fraction + delta > 1) {
						while (true) {
							if (fractionDigits.length == 0) {
								integer += 1;
								break;
							}
							var last = fractionDigits.pop();
							if (last + 1 < radix) {
								fractionDigits.push(last + 1);
								break;
							}
						}
						break;
					}
				}
			} while (fraction >= delta);
		}
		var integerDigits = "";
		while (integer / radix >= 9007199254740992.0) {
			integer /= radix;
			integerDigits = "0" + integerDigits;
		}
		do {
			var remainder = integer % radix;
			integerDigits = chars.charAt(Std.int(remainder)) + integerDigits;
			integer = (integer - remainder) / radix;
		} while (integer > 0);
		var result = (negative ? "-" : "") + integerDigits;
		if (fractionDigits.length > 0)
			result += "." + [for (d in fractionDigits) chars.charAt(d)].join("");
		return result;
	}
	#end

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

	/** ECMA-262 Number::toString (radix 10) of a positive finite value. */
	static function formatShortest(value:Float):String {
		var shortest = shortestDigits(value);
		return layout(shortest.digits, shortest.pointAt);
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

#if !js
/** Unbounded non-negative integers as base-10000 limbs, least significant first: exact decimal expansions of doubles. */
private class BigDecimalDigits {
	static inline final BASE = 10000;

	public static function fromFloat(value:Float):Array<Int> {
		var limbs = [];
		var rest = value;
		do {
			var limb = rest % BASE;
			limbs.push(Std.int(limb));
			rest = (rest - limb) / BASE;
		} while (rest > 0);
		return limbs;
	}

	/** Multiplies `limbs` in place by `base^exponent`, `base` being 2 or 5. */
	public static function multiplyPower(limbs:Array<Int>, base:Int, exponent:Int):Void {
		var chunk = base == 2 ? 13 : 5;
		var remaining = exponent;
		while (remaining > 0) {
			var step = remaining < chunk ? remaining : chunk;
			var factor = 1;
			for (_ in 0...step)
				factor *= base;
			multiply(limbs, factor);
			remaining -= step;
		}
	}

	static function multiply(limbs:Array<Int>, factor:Int):Void {
		var carry = 0;
		for (i in 0...limbs.length) {
			var product = limbs[i] * factor + carry;
			limbs[i] = product % BASE;
			carry = Std.int(product / BASE);
		}
		while (carry > 0) {
			limbs.push(carry % BASE);
			carry = Std.int(carry / BASE);
		}
	}

	public static function toDecimal(limbs:Array<Int>):String {
		var buf = new StringBuf();
		var i = limbs.length - 1;
		buf.add(Std.string(limbs[i]));
		while (--i >= 0)
			buf.add(StringTools.lpad(Std.string(limbs[i]), "0", 4));
		return buf.toString();
	}
}
#end
