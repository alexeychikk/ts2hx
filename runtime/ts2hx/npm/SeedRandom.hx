package ts2hx.npm;

import ts2hx.Ts2hx;

/**
 * Cross-target port of seedrandom's default ARC4 generator: the same seed gives the
 * same sequence as the npm package. Only the `() => number` call form is supported.
 */
class SeedRandom {
	static inline final WIDTH = 256;
	static inline final MASK = 255;
	static inline final CHUNKS = 6;

	/** `seedrandom(seed)`: a generator of doubles in [0, 1). */
	public static function seedrandom(?seed:Dynamic):Dynamic {
		var text = seed == null ? Std.string(Math.random()) : Ts2hx.string(seed);
		var arc4 = new Arc4(mixKey(text));
		var startDenom = Math.pow(WIDTH, CHUNKS);
		var significance = Math.pow(2, 52);
		var overflow = significance * 2;
		return Reflect.makeVarArgs(_ -> {
			var n = arc4.next(CHUNKS);
			var d = startDenom;
			var x = 0.0;
			while (n < significance) {
				n = (n + x) * WIDTH;
				d *= WIDTH;
				x = arc4.next(1);
			}
			while (n >= overflow) {
				n /= 2;
				d /= 2;
				x = Math.ffloor(x / 2);
			}
			return (n + x) / d;
		});
	}

	static function mixKey(seed:String):Array<Int> {
		var key:Array<Int> = [];
		var smear = 0;
		for (j in 0...seed.length) {
			var slot = MASK & j;
			var current = slot < key.length ? key[slot] : 0;
			smear ^= current * 19;
			var code:Int = StringTools.fastCodeAt(seed, j);
			var value = MASK & (smear + code);
			if (slot < key.length)
				key[slot] = value;
			else
				key.push(value);
		}
		return key;
	}
}

private class Arc4 {
	var i = 0;
	var j = 0;
	final s:Array<Int> = [];

	public function new(key:Array<Int>) {
		if (key.length == 0)
			key = [0];
		for (n in 0...256)
			s.push(n);
		var jj = 0;
		for (n in 0...256) {
			var t = s[n];
			jj = 255 & (jj + key[n % key.length] + t);
			s[n] = s[jj];
			s[jj] = t;
		}
		next(256);
	}

	public function next(count:Int):Float {
		var r = 0.0;
		for (_ in 0...count) {
			i = 255 & (i + 1);
			var t = s[i];
			j = 255 & (j + t);
			s[i] = s[j];
			s[j] = t;
			r = r * 256 + s[255 & (s[i] + s[j])];
		}
		return r;
	}
}
