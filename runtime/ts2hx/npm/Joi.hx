package ts2hx.npm;

import ts2hx.Num;
import ts2hx.Ts2hx;

/**
 * Cross-target port of the joi subset TS projects use: `object`/`string`/`number`/
 * `boolean`/`array`/`any` schemas with `required`, `min`/`max`/`length`, `integer`,
 * `valid`/`allow`, `items`, and `validate`, reporting the first error with joi's message.
 */
class Joi {
	public static function object(?keys:Dynamic):JoiSchema {
		var schema = new JoiSchema("object");
		return keys == null ? schema : schema.keys(keys);
	}

	public static function any():JoiSchema {
		return new JoiSchema("any");
	}

	public static function string():JoiSchema {
		return new JoiSchema("string");
	}

	public static function number():JoiSchema {
		return new JoiSchema("number");
	}

	public static function boolean():JoiSchema {
		return new JoiSchema("boolean");
	}

	public static function array():JoiSchema {
		return new JoiSchema("array");
	}

	public static function valid(...values:Dynamic):JoiSchema {
		return any().valid(...values);
	}

	/** Throws the validation error when `value` does not match. */
	public static function assert(value:Dynamic, schema:JoiSchema, ?message:Dynamic):Void {
		var result = schema.validate(value);
		if (result.error != null)
			throw result.error;
	}
}

class JoiValidationError extends ts2hx.Error {
	public var details:Array<Dynamic>;

	public function new(message:String, details:Array<Dynamic>) {
		super(message);
		this.details = details;
		named("ValidationError");
	}
}

class JoiSchema {
	final kind:String;
	var keyNames:Null<Array<String>>;
	var keySchemas:Null<Array<JoiSchema>>;
	var whitelist:Null<Array<Dynamic>>;
	var allowed:Null<Array<Dynamic>>;
	var itemSchemas:Null<Array<JoiSchema>>;
	var isRequired = false;
	var isInteger = false;
	var minValue:Null<Float>;
	var maxValue:Null<Float>;
	var lengthValue:Null<Float>;

	public function new(kind:String) {
		this.kind = kind;
	}

	function copy():JoiSchema {
		var schema = new JoiSchema(kind);
		schema.keyNames = keyNames;
		schema.keySchemas = keySchemas;
		schema.whitelist = whitelist;
		schema.allowed = allowed;
		schema.itemSchemas = itemSchemas;
		schema.isRequired = isRequired;
		schema.isInteger = isInteger;
		schema.minValue = minValue;
		schema.maxValue = maxValue;
		schema.lengthValue = lengthValue;
		return schema;
	}

	public function keys(map:Dynamic):JoiSchema {
		var schema = copy();
		schema.keyNames = (keyNames == null ? [] : keyNames.copy());
		schema.keySchemas = (keySchemas == null ? [] : keySchemas.copy());
		for (field in Reflect.fields(map)) {
			schema.keyNames.push(field);
			schema.keySchemas.push(Reflect.field(map, field));
		}
		return schema;
	}

	public function valid(...values:Dynamic):JoiSchema {
		var schema = copy();
		schema.whitelist = (whitelist == null ? [] : whitelist).concat([for (item in values) item]);
		return schema;
	}

	public function allow(...values:Dynamic):JoiSchema {
		var schema = copy();
		schema.allowed = (allowed == null ? [] : allowed).concat([for (item in values) item]);
		return schema;
	}

	public function required():JoiSchema {
		var schema = copy();
		schema.isRequired = true;
		return schema;
	}

	public function optional():JoiSchema {
		var schema = copy();
		schema.isRequired = false;
		return schema;
	}

	public function integer():JoiSchema {
		var schema = copy();
		schema.isInteger = true;
		return schema;
	}

	public function min(value:Float):JoiSchema {
		var schema = copy();
		schema.minValue = value;
		return schema;
	}

	public function max(value:Float):JoiSchema {
		var schema = copy();
		schema.maxValue = value;
		return schema;
	}

	public function length(value:Float):JoiSchema {
		var schema = copy();
		schema.lengthValue = value;
		return schema;
	}

	public function items(...schemas:JoiSchema):JoiSchema {
		var schema = copy();
		var all:Array<JoiSchema> = itemSchemas == null ? [] : itemSchemas.copy();
		for (item in schemas)
			all.push(item);
		schema.itemSchemas = all;
		return schema;
	}

	public function validate(value:Dynamic, ?options:Dynamic):Dynamic {
		var message = check(value, []);
		if (message == null)
			return {value: value};
		return {
			value: value,
			error: new JoiValidationError(message, [{message: message}])
		};
	}

	static function label(path:Array<String>):String {
		if (path.length == 0)
			return '"value"';
		var text = path[0];
		for (i in 1...path.length)
			text += path[i].charAt(0) == "[" ? path[i] : "." + path[i];
		return '"' + text + '"';
	}

	static function count(value:Float):String {
		return Num.toString(value);
	}

	/** The first error message, or `null` when `value` matches. */
	function check(value:Dynamic, path:Array<String>):Null<String> {
		var name = label(path);
		if (value == null)
			return isRequired ? name + " is required" : null;
		if (allowed != null && allowed.indexOf(value) != -1)
			return null;
		if (whitelist != null && whitelist.indexOf(value) == -1)
			return name + " must be one of [" + [for (v in whitelist) Ts2hx.string(v)].join(", ") + "]";
		switch (kind) {
			case "string":
				if (!Std.isOfType(value, String))
					return name + " must be a string";
				var text:String = value;
				if (text.length == 0)
					return name + " is not allowed to be empty";
				if (minValue != null && text.length < minValue)
					return name + " length must be at least " + count(minValue) + " characters long";
				if (maxValue != null && text.length > maxValue)
					return name + " length must be less than or equal to " + count(maxValue) + " characters long";
				if (lengthValue != null && text.length != lengthValue)
					return name + " length must be " + count(lengthValue) + " characters long";
			case "number":
				if (!Std.isOfType(value, Float) || Math.isNaN(value))
					return name + " must be a number";
				var number:Float = value;
				if (isInteger && Math.ffloor(number) != number)
					return name + " must be an integer";
				if (minValue != null && number < minValue)
					return name + " must be greater than or equal to " + count(minValue);
				if (maxValue != null && number > maxValue)
					return name + " must be less than or equal to " + count(maxValue);
			case "boolean":
				if (!Std.isOfType(value, Bool))
					return name + " must be a boolean";
			case "array":
				if (!Std.isOfType(value, Array))
					return name + " must be an array";
				var array:Array<Dynamic> = value;
				if (itemSchemas != null && itemSchemas.length > 0)
					for (i in 0...array.length) {
						var itemPath = path.concat(["[" + i + "]"]);
						var error:Null<String> = null;
						for (schema in itemSchemas) {
							error = schema.check(array[i], itemPath);
							if (error == null)
								break;
						}
						if (error != null)
							return error;
					}
				if (minValue != null && array.length < minValue)
					return name + " must contain at least " + count(minValue) + " items";
				if (maxValue != null && array.length > maxValue)
					return name + " must contain less than or equal to " + count(maxValue) + " items";
				if (lengthValue != null && array.length != lengthValue)
					return name + " must contain " + count(lengthValue) + " items";
			case "object":
				if (!Reflect.isObject(value) || Std.isOfType(value, String) || Std.isOfType(value, Array))
					return name + " must be of type object";
				if (keyNames != null) {
					for (i in 0...keyNames.length) {
						var error = keySchemas[i].check(Reflect.field(value, keyNames[i]), path.concat([keyNames[i]]));
						if (error != null)
							return error;
					}
					for (field in Reflect.fields(value))
						if (keyNames.indexOf(field) == -1)
							return label(path.concat([field])) + " is not allowed";
				}
			case _:
		}
		return null;
	}
}
