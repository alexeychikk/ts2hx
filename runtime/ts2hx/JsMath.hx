package ts2hx;

#if cpp
@:cppFileCode('#include <cmath>')
#end
/** `Math` functions whose JS semantics differ from Haxe `Math` or that Haxe lacks. */
class JsMath {
	/** JS `Math.max`: `-Infinity` without arguments, `NaN` if any argument is `NaN`. */
	public static function max(...values:Float):Float {
		var result = Math.NEGATIVE_INFINITY;
		for (value in values) {
			if (Math.isNaN(value))
				return Math.NaN;
			if (value > result || (value == 0 && result == 0 && 1 / result < 0))
				result = value;
		}
		return result;
	}

	/** JS `Math.min`: `Infinity` without arguments, `NaN` if any argument is `NaN`. */
	public static function min(...values:Float):Float {
		var result = Math.POSITIVE_INFINITY;
		for (value in values) {
			if (Math.isNaN(value))
				return Math.NaN;
			if (value < result || (value == 0 && result == 0 && 1 / value < 0))
				result = value;
		}
		return result;
	}

	/** JS `Math.round`: halves round up, `-0` and `NaN` are kept. */
	public static function round(x:Float):Float {
		#if js
		return js.Syntax.code("Math.round({0})", x);
		#else
		if (!Math.isFinite(x) || x == 0)
			return x;
		var floor = Math.ffloor(x);
		var result = x - floor >= 0.5 ? floor + 1 : floor;
		return result == 0 && x < 0 ? -0.0 : result;
		#end
	}

	public static function floor(x:Float):Float {
		return Math.ffloor(x);
	}

	public static function ceil(x:Float):Float {
		return Math.fceil(x);
	}

	public static function trunc(x:Float):Float {
		return x < 0 ? Math.fceil(x) : Math.ffloor(x);
	}

	/** JS `Math.sign`: keeps `-0`, `0` and `NaN`. */
	public static function sign(x:Float):Float {
		return x > 0 ? 1 : x < 0 ? -1 : x;
	}

	/** V8's `Math.hypot`: `Infinity` wins over `NaN`, scaled Kahan summation. */
	public static function hypot(...values:Float):Float {
		var max = 0.0;
		var hasNaN = false;
		for (value in values) {
			if (Math.isNaN(value))
				hasNaN = true;
			else if (Math.abs(value) > max)
				max = Math.abs(value);
		}
		if (max == Math.POSITIVE_INFINITY)
			return max;
		if (hasNaN)
			return Math.NaN;
		if (max == 0)
			return 0;
		var sum = 0.0;
		var compensation = 0.0;
		for (value in values) {
			var n = Math.abs(value) / max;
			var summand = n * n - compensation;
			var preliminary = sum + summand;
			compensation = (preliminary - sum) - summand;
			sum = preliminary;
		}
		return Math.sqrt(sum) * max;
	}

	/** fdlibm's `cbrt`, as in V8: libm's is not correctly rounded everywhere (`cbrt(27)` on aarch64 glibc). */
	public static function cbrt(x:Float):Float {
		#if js
		return js.Syntax.code("Math.cbrt({0})", x);
		#else
		var bits = haxe.io.FPHelper.doubleToI64(x);
		var sign = bits.high & 0x80000000;
		var hx = bits.high ^ sign;
		if (hx >= 0x7ff00000)
			return x + x;
		var t:Float;
		if (hx < 0x00100000) {
			if ((hx | bits.low) == 0)
				return x;
			t = 18014398509481984.0 * x;
			var high = haxe.io.FPHelper.doubleToI64(t).high & 0x7fffffff;
			t = haxe.io.FPHelper.i64ToDouble(0, sign | (Std.int(high / 3) + 696219795));
		} else {
			t = haxe.io.FPHelper.i64ToDouble(0, sign | (Std.int(hx / 3) + 715094163));
		}
		var r = (t * t) * (t / x);
		t = t * ((1.87595182427177009643 + r * (-1.88497979543377169875 + r * 1.621429720105354466140))
			+ ((r * r) * r) * (-0.758397934778766047437 + r * 0.145996192886612446982));
		var rounded = haxe.io.FPHelper.doubleToI64(t) + haxe.Int64.make(0, 0x80000000);
		t = haxe.io.FPHelper.i64ToDouble(rounded.low & 0xC0000000, rounded.high);
		var s = t * t;
		r = x / s;
		var w = t + t;
		r = (r - t) / (w + r);
		return t + t * r;
		#end
	}

	public static function log10(x:Float):Float {
		#if js
		return js.Syntax.code("Math.log10({0})", x);
		#elseif cs
		return untyped __cs__("System.Math.Log10({0})", x);
		#elseif cpp
		return untyped __cpp__("std::log10({0})", x);
		#else
		return Math.log(x) / Math.log(10);
		#end
	}

	public static function log2(x:Float):Float {
		#if js
		return js.Syntax.code("Math.log2({0})", x);
		#elseif cs
		return untyped __cs__("System.Math.Log2({0})", x);
		#elseif cpp
		return untyped __cpp__("std::log2({0})", x);
		#else
		return Math.log(x) / Math.log(2);
		#end
	}

	public static function log1p(x:Float):Float {
		#if js
		return js.Syntax.code("Math.log1p({0})", x);
		#elseif cpp
		return untyped __cpp__("std::log1p({0})", x);
		#else
		var u = 1 + x;
		return u == 1 ? x : Math.log(u) * x / (u - 1);
		#end
	}

	public static function expm1(x:Float):Float {
		#if js
		return js.Syntax.code("Math.expm1({0})", x);
		#elseif cpp
		return untyped __cpp__("std::expm1({0})", x);
		#else
		if (x == 0 || Math.isNaN(x))
			return x;
		var u = Math.exp(x);
		if (u == 1)
			return x;
		if (u - 1 == -1)
			return -1;
		return !Math.isFinite(u) ? u : (u - 1) * x / Math.log(u);
		#end
	}

	public static function sinh(x:Float):Float {
		#if js
		return js.Syntax.code("Math.sinh({0})", x);
		#elseif cs
		return untyped __cs__("System.Math.Sinh({0})", x);
		#elseif cpp
		return untyped __cpp__("std::sinh({0})", x);
		#else
		return (Math.exp(x) - Math.exp(-x)) / 2;
		#end
	}

	public static function cosh(x:Float):Float {
		#if js
		return js.Syntax.code("Math.cosh({0})", x);
		#elseif cs
		return untyped __cs__("System.Math.Cosh({0})", x);
		#elseif cpp
		return untyped __cpp__("std::cosh({0})", x);
		#else
		return (Math.exp(x) + Math.exp(-x)) / 2;
		#end
	}

	public static function tanh(x:Float):Float {
		#if js
		return js.Syntax.code("Math.tanh({0})", x);
		#elseif cs
		return untyped __cs__("System.Math.Tanh({0})", x);
		#elseif cpp
		return untyped __cpp__("std::tanh({0})", x);
		#else
		return sinh(x) / cosh(x);
		#end
	}

	public static function asinh(x:Float):Float {
		#if js
		return js.Syntax.code("Math.asinh({0})", x);
		#elseif cs
		return untyped __cs__("System.Math.Asinh({0})", x);
		#elseif cpp
		return untyped __cpp__("std::asinh({0})", x);
		#else
		return Math.log(x + Math.sqrt(x * x + 1));
		#end
	}

	public static function acosh(x:Float):Float {
		#if js
		return js.Syntax.code("Math.acosh({0})", x);
		#elseif cs
		return untyped __cs__("System.Math.Acosh({0})", x);
		#elseif cpp
		return untyped __cpp__("std::acosh({0})", x);
		#else
		return Math.log(x + Math.sqrt(x * x - 1));
		#end
	}

	public static function atanh(x:Float):Float {
		#if js
		return js.Syntax.code("Math.atanh({0})", x);
		#elseif cs
		return untyped __cs__("System.Math.Atanh({0})", x);
		#elseif cpp
		return untyped __cpp__("std::atanh({0})", x);
		#else
		return Math.log((1 + x) / (1 - x)) / 2;
		#end
	}

	/** JS `Math.fround`: rounds to the nearest 32-bit float. */
	public static function fround(x:Float):Float {
		#if js
		return js.Syntax.code("Math.fround({0})", x);
		#else
		return haxe.io.FPHelper.i32ToFloat(haxe.io.FPHelper.floatToI32(x));
		#end
	}

	/** JS `Math.imul`: 32-bit integer multiplication, wrapping. */
	public static function imul(a:Float, b:Float):Float {
		var ua = Num.toUint32(a);
		var ub = Num.toUint32(b);
		var aHigh = Math.ffloor(ua / 65536);
		var aLow = ua - aHigh * 65536;
		var bHigh = Math.ffloor(ub / 65536);
		var bLow = ub - bHigh * 65536;
		var middle = ((aHigh * bLow + aLow * bHigh) % 65536) * 65536;
		return Num.toInt32((aLow * bLow + middle) % 4294967296.0);
	}

	/** JS `Math.clz32`: leading zero bits of `ToUint32(x)`. */
	public static function clz32(x:Float):Float {
		var value = Num.toUint32(x);
		if (value == 0)
			return 32;
		var count = 0;
		while (value < 2147483648.0) {
			value *= 2;
			count++;
		}
		return count;
	}
}
