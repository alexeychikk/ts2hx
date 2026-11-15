package ts2hx;

import ts2hx.Error.SyntaxError;
import ts2hx.Error.TypeError;

/** JS `RegExp` (ADR 0002): native on JS, elsewhere an `EReg` on the pattern rewritten by `RegExpPattern`. */
class RegExp {
	public var source(default, null):String;
	public var flags(default, null):String;
	public var global(get, never):Bool;
	public var ignoreCase(get, never):Bool;
	public var multiline(get, never):Bool;
	public var dotAll(get, never):Bool;
	public var unicode(get, never):Bool;
	public var sticky(get, never):Bool;
	public var hasIndices(get, never):Bool;
	public var lastIndex(get, set):Float;

	#if js
	final native:Dynamic;
	#else
	final pattern:String;
	final compiled:CompiledPattern;
	var lastIndexValue:Float = 0;
	#end

	public function new(pattern:String, ?flags:String) {
		if (flags == null)
			flags = "";
		#if js
		native = js.Syntax.code("new RegExp({0}, {1})", pattern, flags);
		source = native.source;
		this.flags = native.flags;
		#else
		this.pattern = pattern;
		this.flags = canonicalFlags(flags);
		source = escapeSource(pattern);
		compiled = CompiledPattern.of(pattern, this.flags);
		#end
	}

	/** `new RegExp(re, flags)`: a copy of `re`, with other flags when given. */
	public static function from(re:RegExp, ?flags:String):RegExp {
		#if js
		return new RegExp(re.native.source, flags == null ? re.flags : flags);
		#else
		return new RegExp(re.pattern, flags == null ? re.flags : flags);
		#end
	}

	public function toString():String {
		return "/" + source + "/" + flags;
	}

	inline function has(flag:String):Bool {
		return flags.indexOf(flag) >= 0;
	}

	function get_global():Bool
		return has("g");

	function get_ignoreCase():Bool
		return has("i");

	function get_multiline():Bool
		return has("m");

	function get_dotAll():Bool
		return has("s");

	function get_unicode():Bool
		return has("u");

	function get_sticky():Bool
		return has("y");

	function get_hasIndices():Bool
		return has("d");

	#if js
	function get_lastIndex():Float
		return native.lastIndex;

	function set_lastIndex(value:Float):Float {
		native.lastIndex = value;
		return value;
	}

	public function exec(s:String):Null<Array<String>> {
		return native.exec(s);
	}

	public function test(s:String):Bool {
		return native.test(s);
	}

	public static function match(s:String, re:RegExp):Null<Array<String>> {
		return js.Syntax.code("{0}.match({1})", s, re.native);
	}

	public static function matchAll(s:String, re:RegExp):RegExpStringIterator {
		requireGlobal(re, "String.prototype.matchAll");
		return new RegExpStringIterator(js.Syntax.code("Array.from({0}.matchAll({1}))", s, re.native));
	}

	public static function replace(s:String, re:RegExp, replacement:String):String {
		return js.Syntax.code("{0}.replace({1}, {2})", s, re.native, replacement);
	}

	/** `s.replace(re, fn)`: `fn` receives the JS replacer arguments as one array. */
	public static function replaceWith(s:String, re:RegExp, replacer:Array<Dynamic>->String):String {
		var hasGroups = re.native.source.indexOf("(?<") >= 0;
		var call = (args:Array<Dynamic>) -> {
			var last = args.length - 1;
			if (hasGroups && args[last] != null && !Std.isOfType(args[last], String))
				args[last] = MatchGroups.ofNative(args[last]);
			return replacer(args);
		};
		return js.Syntax.code("{0}.replace({1}, function() { return {2}(Array.prototype.slice.call(arguments)); })", s, re.native, call);
	}

	public static function split(s:String, re:RegExp, ?limit:Float):Array<String> {
		return limit == null ? js.Syntax.code("{0}.split({1})", s, re.native) : js.Syntax.code("{0}.split({1}, {2})", s, re.native, limit);
	}

	public static function search(s:String, re:RegExp):Float {
		return js.Syntax.code("{0}.search({1})", s, re.native);
	}

	/** JS `m.index` of a match result, `undefined` for a plain array. */
	public static function matchIndex(match:Array<String>):Null<Float> {
		return isMatch(match) ? js.Syntax.code("{0}.index", match) : null;
	}

	public static function matchInput(match:Array<String>):Null<String> {
		return isMatch(match) ? js.Syntax.code("{0}.input", match) : null;
	}

	public static function matchGroups(match:Array<String>):Null<MatchGroups> {
		var groups:Dynamic = isMatch(match) ? js.Syntax.code("{0}.groups", match) : null;
		return groups == null ? null : MatchGroups.ofNative(groups);
	}

	/** Whether an array is an `exec`/`match` result carrying `index`, `input` and `groups`. */
	public static function isMatch(array:Array<Dynamic>):Bool {
		return js.Syntax.code("Object.prototype.hasOwnProperty.call({0}, 'index')", array);
	}
	#else
	function get_lastIndex():Float
		return lastIndexValue;

	function set_lastIndex(value:Float):Float
		return lastIndexValue = value;

	public function exec(s:String):Null<Array<String>> {
		if (!run(s))
			return null;
		return compiled.result(s);
	}

	public function test(s:String):Bool {
		return run(s);
	}

	/** RegExpBuiltinExec up to the captures: matches from `lastIndex` for `g`/`y`, else from 0. */
	function run(s:String):Bool {
		var usesLastIndex = global || sticky;
		var start = usesLastIndex ? toLength(lastIndexValue) : 0;
		if (start > s.length || !compiled.matchFrom(s, start, sticky)) {
			if (usesLastIndex)
				lastIndexValue = 0;
			return false;
		}
		if (usesLastIndex)
			lastIndexValue = compiled.end();
		return true;
	}

	static function toLength(value:Float):Int {
		if (Math.isNaN(value) || value <= 0)
			return 0;
		return value > 2147483647 ? 2147483647 : Std.int(value);
	}

	/** The index after an empty match at `index`: past a whole surrogate pair for `u` (and on PCRE, which is always in UTF mode). */
	function advance(s:String, index:Int):Int {
		#if cpp
		var byCodePoint = true;
		#else
		var byCodePoint = unicode;
		#end
		if (byCodePoint && index + 1 < s.length) {
			var high = s.charCodeAt(index);
			var low = s.charCodeAt(index + 1);
			if (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF)
				return index + 2;
		}
		return index + 1;
	}

	/** Every match of a global regex from 0, as `exec` reports them, stepping over empty matches. */
	function allMatches(s:String):Array<Array<String>> {
		lastIndexValue = 0;
		var results = [];
		while (true) {
			var result = exec(s);
			if (result == null)
				return results;
			results.push(result);
			if (result[0].length == 0)
				lastIndexValue = advance(s, toLength(lastIndexValue));
		}
	}

	public static function match(s:String, re:RegExp):Null<Array<String>> {
		if (!re.global)
			return re.exec(s);
		var matches = [for (result in re.allMatches(s)) result[0]];
		return matches.length == 0 ? null : matches;
	}

	public static function matchAll(s:String, re:RegExp):RegExpStringIterator {
		requireGlobal(re, "String.prototype.matchAll");
		var matcher = from(re);
		matcher.lastIndexValue = re.lastIndexValue;
		var results = [];
		while (true) {
			var result = matcher.exec(s);
			if (result == null)
				break;
			results.push(result);
			if (result[0].length == 0)
				matcher.lastIndexValue = matcher.advance(s, toLength(matcher.lastIndexValue));
		}
		return new RegExpStringIterator(results);
	}

	public static function replace(s:String, re:RegExp, replacement:String):String {
		return replaceMatches(s, re, (result, position, groups) -> substitution(s, result, position, groups, replacement));
	}

	/** `s.replace(re, fn)`: `fn` receives the JS replacer arguments as one array. */
	public static function replaceWith(s:String, re:RegExp, replacer:Array<Dynamic>->String):String {
		return replaceMatches(s, re, (result, position, groups) -> {
			var args:Array<Dynamic> = [for (value in result) value];
			args.push((position : Float));
			args.push(s);
			if (groups != null)
				args.push(groups);
			return replacer(args);
		});
	}

	static function replaceMatches(s:String, re:RegExp, replacement:(Array<String>, Int, Null<MatchGroups>) -> String):String {
		var results = if (re.global) re.allMatches(s) else {
			var result = re.exec(s);
			result == null ? [] : [result];
		}
		var buffer = new StringBuf();
		var next = 0;
		for (result in results) {
			var info = MatchInfo.of(result);
			var position = Std.int(info.index);
			var replaced = replacement(result, position, info.groups);
			if (position >= next) {
				buffer.add(s.substring(next, position));
				buffer.add(replaced);
				next = position + result[0].length;
			}
		}
		buffer.add(s.substring(next));
		return buffer.toString();
	}

	/** JS GetSubstitution: `$$`, `$&`, `` $` ``, `$'`, `$n`/`$nn` and `$<name>`. */
	static function substitution(s:String, result:Array<String>, position:Int, groups:Null<MatchGroups>, template:String):String {
		var matched = result[0];
		var captures = result.length - 1;
		var buffer = new StringBuf();
		var i = 0;
		while (i < template.length) {
			var c = template.charCodeAt(i);
			if (c != "$".code || i + 1 >= template.length) {
				buffer.addChar(c);
				i++;
				continue;
			}
			var next = template.charCodeAt(i + 1);
			if (next == "$".code) {
				buffer.add("$");
				i += 2;
			} else if (next == "&".code) {
				buffer.add(matched);
				i += 2;
			} else if (next == "`".code) {
				buffer.add(s.substring(0, position));
				i += 2;
			} else if (next == "'".code) {
				buffer.add(s.substring(Std.int(Math.min(position + matched.length, s.length))));
				i += 2;
			} else if (isDigit(next)) {
				var single = next - "0".code;
				var double = i + 2 < template.length && isDigit(template.charCodeAt(i + 2)) ? single * 10 + template.charCodeAt(i + 2) - "0".code : -1;
				if (double >= 1 && double <= captures) {
					addCapture(buffer, result[double]);
					i += 3;
				} else if (single >= 1 && single <= captures) {
					addCapture(buffer, result[single]);
					i += 2;
				} else {
					buffer.add("$");
					i++;
				}
			} else if (next == "<".code && groups != null) {
				var close = template.indexOf(">", i + 2);
				if (close < 0) {
					buffer.add("$<");
					i += 2;
				} else {
					var capture:Dynamic = groups.get(template.substring(i + 2, close));
					addCapture(buffer, capture);
					i = close + 1;
				}
			} else {
				buffer.add("$");
				i++;
			}
		}
		return buffer.toString();
	}

	static inline function isDigit(c:Int):Bool {
		return c >= "0".code && c <= "9".code;
	}

	static inline function addCapture(buffer:StringBuf, capture:String):Void {
		if (capture != null)
			buffer.add(capture);
	}

	/** JS `@@split`: captures are spliced in, empty matches at the previous split point are skipped. */
	public static function split(s:String, re:RegExp, ?limit:Float):Array<String> {
		var max = limit == null ? 4294967295.0 : toUint32(limit);
		var parts:Array<String> = [];
		if (max == 0)
			return parts;
		var compiled = re.compiled;
		if (s.length == 0)
			return compiled.matchFrom(s, 0, true) ? parts : [s];
		var p = 0;
		var q = 0;
		while (q < s.length) {
			if (!compiled.matchFrom(s, q, false))
				break;
			var start = compiled.start();
			if (start >= s.length)
				break;
			var end = compiled.end();
			if (end == p) {
				q = re.advance(s, start);
				continue;
			}
			var captures = compiled.captures();
			parts.push(s.substring(p, start));
			if (parts.length == max)
				return parts;
			for (i in 1...captures.length) {
				parts.push(captures[i]);
				if (parts.length == max)
					return parts;
			}
			p = end;
			q = p;
		}
		parts.push(s.substring(p));
		return parts;
	}

	static function toUint32(value:Float):Float {
		if (Math.isNaN(value) || !Math.isFinite(value))
			return 0;
		var truncated = value < 0 ? Math.ceil(value) : Math.floor(value);
		var modulo = truncated % 4294967296.0;
		return modulo < 0 ? modulo + 4294967296.0 : modulo;
	}

	public static function search(s:String, re:RegExp):Float {
		var previous = re.lastIndexValue;
		re.lastIndexValue = 0;
		var result = re.exec(s);
		re.lastIndexValue = previous;
		return result == null ? -1 : MatchInfo.of(result).index;
	}

	/** JS `m.index` of a match result, `undefined` for a plain array. */
	public static function matchIndex(match:Array<String>):Null<Float> {
		var info = MatchInfo.of(match);
		return info == null ? null : info.index;
	}

	public static function matchInput(match:Array<String>):Null<String> {
		var info = MatchInfo.of(match);
		return info == null ? null : info.input;
	}

	public static function matchGroups(match:Array<String>):Null<MatchGroups> {
		var info = MatchInfo.of(match);
		return info == null ? null : info.groups;
	}

	/** Whether an array is an `exec`/`match` result carrying `index`, `input` and `groups`. */
	public static function isMatch(array:Array<Dynamic>):Bool {
		return MatchInfo.of(array) != null;
	}

	static function canonicalFlags(flags:String):String {
		var canonical = "";
		for (flag in ["d", "g", "i", "m", "s", "u", "y"])
			if (flags.indexOf(flag) >= 0)
				canonical += flag;
		var seen = new Map<String, Bool>();
		for (i in 0...flags.length) {
			var flag = flags.charAt(i);
			if ("dgimsuy".indexOf(flag) < 0 || seen.exists(flag))
				throw new SyntaxError("Invalid flags supplied to RegExp constructor '" + flags + "'");
			seen.set(flag, true);
		}
		return canonical;
	}

	/** JS EscapeRegExpPattern: `/` outside classes and line terminators are escaped, `""` is `(?:)`. */
	static function escapeSource(pattern:String):String {
		if (pattern.length == 0)
			return "(?:)";
		var buffer = new StringBuf();
		var inClass = false;
		var i = 0;
		while (i < pattern.length) {
			var c = pattern.charCodeAt(i);
			if (c == "\\".code && i + 1 < pattern.length) {
				buffer.addChar(c);
				buffer.addChar(pattern.charCodeAt(i + 1));
				i += 2;
				continue;
			}
			if (c == "[".code)
				inClass = true;
			else if (c == "]".code)
				inClass = false;
			if (c == "/".code && !inClass)
				buffer.add("\\/");
			else if (c == "\n".code)
				buffer.add("\\n");
			else if (c == "\r".code)
				buffer.add("\\r");
			else if (c == 0x2028)
				buffer.add("\\u2028");
			else if (c == 0x2029)
				buffer.add("\\u2029");
			else
				buffer.addChar(c);
			i++;
		}
		return buffer.toString();
	}
	#end

	static function requireGlobal(re:RegExp, method:String):Void {
		if (!re.global)
			throw new TypeError(method + " called with a non-global RegExp argument");
	}

	/** `s.replaceAll(re, replacement)`: `re` must be global. */
	public static function replaceAll(s:String, re:RegExp, replacement:String):String {
		requireGlobal(re, "replaceAll");
		return replace(s, re, replacement);
	}

	public static function replaceAllWith(s:String, re:RegExp, replacer:Array<Dynamic>->String):String {
		requireGlobal(re, "replaceAll");
		return replaceWith(s, re, replacer);
	}

	/** Node `util.inspect` entries a match result prints after its elements. */
	public static function inspectExtras(match:Array<String>, inspect:Dynamic->String):Array<String> {
		var index = matchIndex(match);
		var groups = matchGroups(match);
		return [
			"index: " + (index == null ? "undefined" : Num.toString(index)),
			"input: " + inspect(matchInput(match)),
			"groups: " + (groups == null ? "undefined" : inspect(groups))
		];
	}
}

/** The `groups` object of a match: a dictionary Node prints as `[Object: null prototype]`. */
class MatchGroups extends Dict<String> {
	#if js
	public static function ofNative(groups:Dynamic):MatchGroups {
		var dict = new MatchGroups();
		for (name in Reflect.fields(groups))
			dict.set(name, Reflect.field(groups, name));
		return dict;
	}
	#end
}

/** What `s.matchAll(re)` returns: the JS iterator protocol plus Haxe iteration via `iterator()`. */
class RegExpStringIterator {
	final results:Array<Array<String>>;
	var position = 0;

	public function new(results:Array<Array<String>>) {
		this.results = results;
	}

	public function next():{done:Bool, value:Null<Array<String>>} {
		if (position >= results.length)
			return {done: true, value: null};
		return {done: false, value: results[position++]};
	}

	/** The matches not iterated yet, consumed. */
	public function toArray():Array<Array<String>> {
		var rest = results.slice(position);
		position = results.length;
		return rest;
	}

	public function iterator():Iterator<Array<String>> {
		return toArray().iterator();
	}
}

#if !js
/** `index`, `input` and `groups` of a match result, attached to the array without keeping it alive. */
class MatchInfo {
	public final index:Float;
	public final input:String;
	public final groups:Null<MatchGroups>;

	public function new(index:Float, input:String, groups:Null<MatchGroups>) {
		this.index = index;
		this.input = input;
		this.groups = groups;
	}

	#if cs
	static final table:Dynamic = untyped __cs__("new global::System.Runtime.CompilerServices.ConditionalWeakTable<object, object>()");

	public static function attach(match:Array<String>, info:MatchInfo):Void {
		untyped __cs__("((global::System.Runtime.CompilerServices.ConditionalWeakTable<object, object>){0}).AddOrUpdate({1}, {2})", table, match, info);
	}

	public static function of(match:{}):Null<MatchInfo> {
		var info:Dynamic = untyped __cs__("(((global::System.Runtime.CompilerServices.ConditionalWeakTable<object, object>){0}).TryGetValue({1}, out var ts2hxInfo) ? ts2hxInfo : null)",
			table, match);
		return cast info;
	}
	#else
	static final table = new haxe.ds.WeakMap<{}, MatchInfo>();

	public static function attach(match:Array<String>, info:MatchInfo):Void {
		table.set(match, info);
	}

	public static function of(match:{}):Null<MatchInfo> {
		return table.get(match);
	}
	#end
}

/** A JS pattern compiled for the target's `EReg`, shared by every `RegExp` with the same source and flags. */
class CompiledPattern {
	static final cache = new haxe.ds.StringMap<CompiledPattern>();

	final ereg:EReg;
	final groupCount:Int;
	final names:Array<Null<String>>;
	var matchStart = 0;
	var matchEnd = 0;

	function new(translated:RegExpPattern) {
		ereg = new EReg(translated.pattern, translated.ignoreCase ? "i" : "");
		groupCount = translated.groupCount;
		names = translated.names;
	}

	public static function of(source:String, flags:String):CompiledPattern {
		var key = flags + "/" + source;
		var compiled = cache.get(key);
		if (compiled == null) {
			var translated = RegExpPattern.translate(source, flags);
			try {
				compiled = new CompiledPattern(translated);
			} catch (e:Dynamic) {
				throw new SyntaxError("Invalid regular expression: /" + source + "/" + flags);
			}
			cache.set(key, compiled);
		}
		return compiled;
	}

	/** Finds the leftmost match at or after `from` (only at `from` when `sticky`). */
	public function matchFrom(s:String, from:Int, sticky:Bool):Bool {
		if (!ereg.matchSub(s, from))
			return false;
		var pos = ereg.matchedPos();
		if (sticky && pos.pos != from)
			return false;
		matchStart = pos.pos;
		matchEnd = pos.pos + pos.len;
		return true;
	}

	public inline function start():Int
		return matchStart;

	public inline function end():Int
		return matchEnd;

	/** The last match and its groups; `null` for a group that did not participate. */
	public function captures():Array<String> {
		return [for (i in 0...groupCount + 1) ereg.matched(i)];
	}

	/** The last match as a JS match result. */
	public function result(input:String):Array<String> {
		var captures = captures();
		var groups:Null<MatchGroups> = null;
		for (i in 1...names.length) {
			if (names[i] != null) {
				if (groups == null)
					groups = new MatchGroups();
				groups.set(names[i], captures[i]);
			}
		}
		MatchInfo.attach(captures, new MatchInfo(matchStart, input, groups));
		return captures;
	}
}

/** A JS pattern rewritten so .NET and PCRE2 match like JS (ADR 0002). */
class RegExpPattern {
	public final pattern:String;
	public final groupCount:Int;

	/** Name of each group by index, `null` for unnamed ones. */
	public final names:Array<Null<String>>;

	public final ignoreCase:Bool;

	function new(pattern:String, groupCount:Int, names:Array<Null<String>>, ignoreCase:Bool) {
		this.pattern = pattern;
		this.groupCount = groupCount;
		this.names = names;
		this.ignoreCase = ignoreCase;
	}

	public static final WORD = "A-Za-z0-9_";

	public static function lineTerminators():String {
		return escape(0x0A) + escape(0x0D) + escape(0x2028) + escape(0x2029);
	}

	public static function whitespace():String {
		var buffer = new StringBuf();
		for (code in [0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680])
			buffer.add(escape(code));
		buffer.add(escape(0x2000) + "-" + escape(0x200A));
		for (code in [0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF])
			buffer.add(escape(code));
		return buffer.toString();
	}

	/** One character, escaped for the target's regex syntax. */
	public static function escape(code:Int):String {
		#if cs
		if (code > 0xFFFF) {
			var offset = code - 0x10000;
			return "\\u" + StringTools.hex(0xD800 + (offset >> 10), 4) + "\\u" + StringTools.hex(0xDC00 + (offset & 0x3FF), 4);
		}
		return "\\u" + StringTools.hex(code, 4);
		#else
		return "\\x{" + StringTools.hex(code) + "}";
		#end
	}

	public static function translate(source:String, flags:String):RegExpPattern {
		var names:Array<Null<String>> = [null];
		var groupCount = countGroups(source, names);
		var translator = new Translator(source, flags, groupCount, names);
		return new RegExpPattern(translator.run(), groupCount, names, flags.indexOf("i") >= 0);
	}

	static function countGroups(source:String, names:Array<Null<String>>):Int {
		var count = 0;
		var inClass = false;
		var i = 0;
		while (i < source.length) {
			var c = source.charCodeAt(i);
			if (c == "\\".code) {
				i += 2;
				continue;
			}
			if (inClass) {
				if (c == "]".code)
					inClass = false;
			} else if (c == "[".code) {
				inClass = true;
			} else if (c == "(".code) {
				if (source.charCodeAt(i + 1) != "?".code) {
					count++;
					names.push(null);
				} else if (source.charCodeAt(i + 2) == "<".code
					&& source.charCodeAt(i + 3) != "=".code
					&& source.charCodeAt(i + 3) != "!".code) {
					var close = source.indexOf(">", i + 3);
					count++;
					names.push(source.substring(i + 3, close));
				}
			}
			i++;
		}
		return count;
	}

}

private class Translator {
	final source:String;
	final groupCount:Int;
	final names:Array<Null<String>>;
	final multiline:Bool;
	final dotAll:Bool;
	final unicode:Bool;
	final out = new StringBuf();
	var i = 0;

	public function new(source:String, flags:String, groupCount:Int, names:Array<Null<String>>) {
		this.source = source;
		this.groupCount = groupCount;
		this.names = names;
		multiline = flags.indexOf("m") >= 0;
		dotAll = flags.indexOf("s") >= 0;
		unicode = flags.indexOf("u") >= 0;
	}

	public function run():String {
		while (i < source.length) {
			var c = source.charCodeAt(i);
			if (c == "\\".code) {
				i++;
				escapeOutsideClass();
			} else if (c == "[".code) {
				i++;
				characterClass();
			} else if (c == "(".code) {
				group();
			} else {
				i++;
				switch (c) {
					case ".".code:
						out.add(dotAll ? "[\\s\\S]" : dot());
					case "^".code:
						out.add(multiline ? "(?<![^" + RegExpPattern.lineTerminators() + "])" : "^");
					case "$".code:
						out.add(multiline ? "(?![^" + RegExpPattern.lineTerminators() + "])" : "(?![\\s\\S])");
					default:
						literal(c);
				}
			}
		}
		return out.toString();
	}

	function dot():String {
		var single = "[^" + RegExpPattern.lineTerminators() + "]";
		#if cs
		if (unicode)
			return "(?:[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|" + single + ")";
		#end
		return single;
	}

	/** A source character copied as is (ASCII) or escaped, a surrogate pair as one code point on PCRE. */
	function literal(c:Int):Void {
		if (c < 0x80) {
			out.addChar(c);
			return;
		}
		#if !cs
		if (c >= 0xD800 && c <= 0xDBFF && i < source.length) {
			var low = source.charCodeAt(i);
			if (low >= 0xDC00 && low <= 0xDFFF) {
				i++;
				out.add(RegExpPattern.escape(((c - 0xD800) << 10) + (low - 0xDC00) + 0x10000));
				return;
			}
		}
		#end
		out.add(RegExpPattern.escape(c));
	}

	function group():Void {
		if (source.charCodeAt(i + 1) == "?".code
			&& source.charCodeAt(i + 2) == "<".code
			&& source.charCodeAt(i + 3) != "=".code
			&& source.charCodeAt(i + 3) != "!".code) {
			var close = source.indexOf(">", i + 3);
			out.add("(");
			i = close + 1;
			return;
		}
		out.add("(");
		i++;
	}

	/** A backreference that, as in JS, matches empty when its group did not participate. */
	function backreference(index:Int):Void {
		out.add("(?(" + index + ")\\" + index + "|)");
	}

	function escapeOutsideClass():Void {
		if (i >= source.length) {
			out.add("\\\\");
			return;
		}
		var c = source.charCodeAt(i);
		var word = RegExpPattern.WORD;
		switch (c) {
			case "d".code:
				i++;
				out.add("[0-9]");
			case "D".code:
				i++;
				out.add("[^0-9]");
			case "w".code:
				i++;
				out.add("[" + word + "]");
			case "W".code:
				i++;
				out.add("[^" + word + "]");
			case "s".code:
				i++;
				out.add("[" + RegExpPattern.whitespace() + "]");
			case "S".code:
				i++;
				out.add("[^" + RegExpPattern.whitespace() + "]");
			case "b".code:
				i++;
				out.add("(?:(?<=[" + word + "])(?![" + word + "])|(?<![" + word + "])(?=[" + word + "]))");
			case "B".code:
				i++;
				out.add("(?:(?<=[" + word + "])(?=[" + word + "])|(?<![" + word + "])(?![" + word + "]))");
			case "k".code:
				namedBackreference();
			case code if (code >= "1".code && code <= "9".code):
				decimalEscape();
			default:
				commonEscape();
		}
	}

	function hasNames():Bool {
		for (name in names)
			if (name != null)
				return true;
		return false;
	}

	function namedBackreference():Void {
		if (!hasNames() || source.charCodeAt(i + 1) != "<".code) {
			i++;
			out.add("k");
			return;
		}
		var close = source.indexOf(">", i + 2);
		var name = source.substring(i + 2, close);
		i = close + 1;
		backreference(names.indexOf(name));
	}

	function decimalEscape():Void {
		var start = i;
		while (i < source.length && source.charCodeAt(i) >= "0".code && source.charCodeAt(i) <= "9".code)
			i++;
		var index = Std.parseInt(source.substring(start, i));
		if (index != null && index <= groupCount) {
			backreference(index);
			return;
		}
		i = start;
		legacyOctal();
	}

	/** `\0`, `\12`…: an octal character code in non-`u` patterns; `\8` and `\9` are the digits. */
	function legacyOctal():Void {
		var first = source.charCodeAt(i);
		if (first > "7".code) {
			i++;
			out.addChar(first);
			return;
		}
		var value = 0;
		var digits = 0;
		while (digits < 3 && i < source.length) {
			var c = source.charCodeAt(i);
			if (c < "0".code || c > "7".code || value * 8 + c - "0".code > 255)
				break;
			value = value * 8 + c - "0".code;
			digits++;
			i++;
		}
		out.add(RegExpPattern.escape(value));
	}

	/** Escapes with the same meaning inside and outside classes. */
	function commonEscape():Void {
		var c = source.charCodeAt(i);
		i++;
		switch (c) {
			case "t".code:
				out.add(RegExpPattern.escape(0x09));
			case "n".code:
				out.add(RegExpPattern.escape(0x0A));
			case "v".code:
				out.add(RegExpPattern.escape(0x0B));
			case "f".code:
				out.add(RegExpPattern.escape(0x0C));
			case "r".code:
				out.add(RegExpPattern.escape(0x0D));
			case "0".code:
				i--;
				legacyOctal();
			case "c".code:
				var letter = source.charCodeAt(i);
				if (letter != null && ((letter >= "a".code && letter <= "z".code) || (letter >= "A".code && letter <= "Z".code))) {
					i++;
					out.add(RegExpPattern.escape(letter % 32));
				} else {
					out.add("\\\\c");
				}
			case "x".code:
				var code = hexDigits(i, 2);
				if (code < 0) {
					out.add("x");
				} else {
					i += 2;
					out.add(RegExpPattern.escape(code));
				}
			case "u".code:
				unicodeEscape();
			case "p".code | "P".code if (unicode):
				var close = source.indexOf("}", i);
				out.add("\\" + String.fromCharCode(c) + source.substring(i, close + 1));
				i = close + 1;
			default:
				if ((c >= "a".code && c <= "z".code) || (c >= "A".code && c <= "Z".code) || (c >= "0".code && c <= "9".code) || c >= 0x80)
					out.add(RegExpPattern.escape(c));
				else
					out.add("\\" + String.fromCharCode(c));
		}
	}

	function unicodeEscape():Void {
		if (unicode && source.charCodeAt(i) == "{".code) {
			var close = source.indexOf("}", i);
			var code = Std.parseInt("0x" + source.substring(i + 1, close));
			if (close > 0 && code != null) {
				i = close + 1;
				out.add(RegExpPattern.escape(code));
				return;
			}
		}
		var code = hexDigits(i, 4);
		if (code < 0) {
			out.add("u");
			return;
		}
		i += 4;
		if (code >= 0xD800 && code <= 0xDBFF && source.charCodeAt(i) == "\\".code && source.charCodeAt(i + 1) == "u".code) {
			var low = hexDigits(i + 2, 4);
			if (low >= 0xDC00 && low <= 0xDFFF) {
				i += 6;
				out.add(RegExpPattern.escape(((code - 0xD800) << 10) + (low - 0xDC00) + 0x10000));
				return;
			}
		}
		out.add(RegExpPattern.escape(code));
	}

	function hexDigits(start:Int, count:Int):Int {
		if (start + count > source.length)
			return -1;
		var value = 0;
		for (k in start...start + count) {
			var c = source.charCodeAt(k);
			var digit = if (c >= "0".code && c <= "9".code) c - "0".code else if (c >= "a".code && c <= "f".code) c - "a".code + 10 else if (c >= "A".code
				&& c <= "F".code) c - "A".code + 10 else -1;
			if (digit < 0)
				return -1;
			value = value * 16 + digit;
		}
		return value;
	}

	function characterClass():Void {
		var negated = source.charCodeAt(i) == "^".code;
		if (negated)
			i++;
		if (source.charCodeAt(i) == "]".code) {
			i++;
			out.add(negated ? "[\\s\\S]" : "(?!)");
			return;
		}
		out.add(negated ? "[^" : "[");
		while (i < source.length) {
			var c = source.charCodeAt(i);
			i++;
			if (c == "]".code) {
				out.add("]");
				return;
			}
			if (c == "[".code) {
				out.add("\\[");
			} else if (c == "\\".code) {
				escapeInsideClass();
			} else {
				literal(c);
			}
		}
	}

	function escapeInsideClass():Void {
		var c = source.charCodeAt(i);
		switch (c) {
			case "d".code:
				i++;
				out.add("0-9");
			case "w".code:
				i++;
				out.add(RegExpPattern.WORD);
			case "s".code:
				i++;
				out.add(RegExpPattern.whitespace());
			case "D".code | "W".code | "S".code:
				i++;
				out.add("\\" + String.fromCharCode(c));
			case "b".code:
				i++;
				out.add(RegExpPattern.escape(0x08));
			case "-".code:
				i++;
				out.add("\\-");
			case code if (code >= "1".code && code <= "9".code):
				legacyOctal();
			default:
				commonEscape();
		}
	}
}
#end
