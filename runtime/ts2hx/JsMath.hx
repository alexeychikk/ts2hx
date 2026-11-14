package ts2hx;

/** `Math` functions whose JS semantics differ from Haxe `Math`. */
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
}
