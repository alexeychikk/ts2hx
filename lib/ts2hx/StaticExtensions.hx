package ts2hx;

class StaticExtensions {
	static public function or<T>(value: T, defaultValue: T): T {
		return value == null ? defaultValue : value;
	}
}
