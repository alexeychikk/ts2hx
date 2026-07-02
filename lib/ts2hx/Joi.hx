package ts2hx;

/**
 * Minimal runtime shim for the joi validation package, covering the API
 * surface commonly used in converted TS projects: object/string/number/
 * boolean/array schemas, keys(), valid(), allow(), when(), items(),
 * unique(), required()/optional(), integer()/min()/max()/length(),
 * validate() and assert().
 *
 * Known divergences from real joi:
 * - schemas are mutable — chain methods return the same instance
 * - the `is` field of when() conditions is compared by equality
 *   instead of being treated as a schema
 * - null and undefined are both treated as "absent"
 * - unknown object keys are always rejected (allowUnknown is ignored,
 *   matching joi's default and `{ allowUnknown: false }`)
 * - validation stops at the first error (abortEarly behavior)
 */
class Joi {
  public static function object(?keys: Dynamic): JoiSchema {
    final schema = new JoiSchema('object');
    if (keys != null) schema.keys(keys);
    return schema;
  }

  public static function any(): JoiSchema {
    return new JoiSchema('any');
  }

  public static function string(): JoiSchema {
    return new JoiSchema('string');
  }

  public static function number(): JoiSchema {
    return new JoiSchema('number');
  }

  public static function boolean(): JoiSchema {
    return new JoiSchema('boolean');
  }

  public static function array(): JoiSchema {
    return new JoiSchema('array');
  }

  /** Joi.valid(...) — an any-schema restricted to the given values */
  public static function valid(...values: Dynamic): JoiSchema {
    return new JoiSchema('any').validValues(values.toArray());
  }

  /** Joi.when(...) — an any-schema with a condition on a sibling key */
  public static function when(ref: String, conditions: Dynamic): JoiSchema {
    return new JoiSchema('any').when(ref, conditions);
  }

  /** Throws JoiValidationError when the value does not match the schema */
  public static function assert(
    value: Dynamic,
    schema: JoiSchema,
    ?options: Dynamic
  ): Void {
    final result = schema.validate(value);
    if (result.error != null) throw result.error;
  }
}

typedef JoiValidationResult = {
  error: Null<JoiValidationError>,
  value: Dynamic,
};

/**
 * Note: joi's `error.details` is exposed as `validationDetails` —
 * haxe.Exception already declares a details() method
 */
class JoiValidationError extends haxe.Exception {
  public final validationDetails: Array<Dynamic>;

  public function new(message: String, details: Array<Dynamic>) {
    super(message);
    this.validationDetails = details;
  }
}

class JoiSchema {
  final kind: String;
  var keysMap: Null<Dynamic>;
  var whitelist: Null<Array<Dynamic>>;
  var allowedValues: Null<Array<Dynamic>>;
  var itemSchemas: Null<Array<JoiSchema>>;
  var uniqueComparator: Null<Dynamic>;
  final whenEntries: Array<{ref: String, conditions: Dynamic}> = [];
  var isRequired = false;
  var isInteger = false;
  var minValue: Null<Float>;
  var maxValue: Null<Float>;
  var lengthValue: Null<Float>;

  public function new(kind: String) {
    this.kind = kind;
  }

  // --- chain methods ---

  /** Merges the given key schemas into the object schema */
  public function keys(map: Dynamic): JoiSchema {
    if (keysMap == null) keysMap = {};
    for (field in Reflect.fields(map)) {
      Reflect.setField(keysMap, field, Reflect.field(map, field));
    }
    return this;
  }

  public function valid(...values: Dynamic): JoiSchema {
    return validValues(values.toArray());
  }

  @:allow(ts2hx.Joi)
  function validValues(values: Array<Dynamic>): JoiSchema {
    if (whitelist == null) whitelist = [];
    for (value in values) whitelist.push(value);
    return this;
  }

  /** Values accepted in addition to the base type (e.g. allow(null, '')) */
  public function allow(...values: Dynamic): JoiSchema {
    if (allowedValues == null) allowedValues = [];
    for (value in values.toArray()) allowedValues.push(value);
    return this;
  }

  public function required(): JoiSchema {
    isRequired = true;
    return this;
  }

  public function optional(): JoiSchema {
    isRequired = false;
    return this;
  }

  public function integer(): JoiSchema {
    isInteger = true;
    return this;
  }

  /** Minimum numeric value, or minimum length for strings and arrays */
  public function min(value: Float): JoiSchema {
    minValue = value;
    return this;
  }

  /** Maximum numeric value, or maximum length for strings and arrays */
  public function max(value: Float): JoiSchema {
    maxValue = value;
    return this;
  }

  /** Exact length for strings and arrays */
  public function length(value: Float): JoiSchema {
    lengthValue = value;
    return this;
  }

  public function items(...schemas: Dynamic): JoiSchema {
    if (itemSchemas == null) itemSchemas = [];
    for (schema in schemas.toArray()) itemSchemas.push((schema : JoiSchema));
    return this;
  }

  /** Array elements must be pairwise distinct according to the comparator */
  public function unique(?comparator: Dynamic): JoiSchema {
    uniqueComparator = comparator != null
      ? comparator
      : (a: Dynamic, b: Dynamic) -> a == b;
    return this;
  }

  /**
   * Conditions is a { is, then, ?otherwise } object or an array of them
   * (acting like a switch); `ref` names a sibling key of the parent object
   */
  public function when(ref: String, conditions: Dynamic): JoiSchema {
    whenEntries.push({ ref: ref, conditions: conditions });
    return this;
  }

  // --- validation ---

  public function validate(value: Dynamic): JoiValidationResult {
    final message = check(value, null, 'value');
    return {
      error: message == null
        ? null
        : new JoiValidationError(message, [{ message: message }]),
      value: value,
    };
  }

  /** Returns the first validation error message, or null when valid */
  function check(value: Dynamic, parent: Dynamic, path: String): Null<String> {
    // when() — the first condition whose `is` matches the referenced
    // sibling narrows the schema with its `then`
    for (entry in whenEntries) {
      final refValue: Dynamic = parent == null
        ? null
        : Reflect.field(parent, entry.ref);
      final conditions: Array<Dynamic> = Std.isOfType(entry.conditions, Array)
        ? entry.conditions
        : [entry.conditions];

      var matched = false;
      for (condition in conditions) {
        if (condition == null || refValue != (condition.is : Dynamic)) {
          continue;
        }
        matched = true;
        final then: Null<JoiSchema> = condition.then;
        if (then != null) {
          final error = then.check(value, parent, path);
          if (error != null) return error;
        }
        break;
      }
      if (!matched && conditions.length > 0) {
        final otherwise: Null<JoiSchema> =
          conditions[conditions.length - 1] == null
            ? null
            : conditions[conditions.length - 1].otherwise;
        if (otherwise != null) {
          final error = otherwise.check(value, parent, path);
          if (error != null) return error;
        }
      }
    }

    if (value == null) {
      return isRequired ? '"' + path + '" is required' : null;
    }

    if (allowedValues != null && allowedValues.indexOf(value) != -1) {
      return null;
    }

    if (whitelist != null && whitelist.indexOf(value) == -1) {
      return '"' + path + '" must be one of [' + whitelist.join(', ') + ']';
    }

    switch (kind) {
      case 'string':
        if (!Std.isOfType(value, String)) {
          return '"' + path + '" must be a string';
        }
        final text: String = value;
        if (minValue != null && text.length < minValue) {
          return '"' + path + '" length must be at least ' + minValue;
        }
        if (maxValue != null && text.length > maxValue) {
          return '"' + path + '" length must be at most ' + maxValue;
        }
        if (lengthValue != null && text.length != lengthValue) {
          return '"' + path + '" length must be ' + lengthValue;
        }
      case 'number':
        if (!Std.isOfType(value, Float)) {
          return '"' + path + '" must be a number';
        }
        final number: Float = value;
        if (isInteger && Math.ffloor(number) != number) {
          return '"' + path + '" must be an integer';
        }
        if (minValue != null && number < minValue) {
          return '"' + path + '" must be greater than or equal to ' + minValue;
        }
        if (maxValue != null && number > maxValue) {
          return '"' + path + '" must be less than or equal to ' + maxValue;
        }
      case 'boolean':
        if (!Std.isOfType(value, Bool)) {
          return '"' + path + '" must be a boolean';
        }
      case 'array':
        if (!Std.isOfType(value, Array)) {
          return '"' + path + '" must be an array';
        }
        final array: Array<Dynamic> = value;
        if (minValue != null && array.length < minValue) {
          return '"' + path + '" must contain at least ' + minValue + ' items';
        }
        if (maxValue != null && array.length > maxValue) {
          return '"' + path + '" must contain at most ' + maxValue + ' items';
        }
        if (lengthValue != null && array.length != lengthValue) {
          return '"' + path + '" must contain ' + lengthValue + ' items';
        }
        if (itemSchemas != null && itemSchemas.length > 0) {
          for (i in 0...array.length) {
            var itemError: Null<String> = null;
            var itemValid = false;
            for (schema in itemSchemas) {
              final error = schema.check(array[i], parent, path + '[' + i + ']');
              if (error == null) {
                itemValid = true;
                break;
              }
              itemError = error;
            }
            if (!itemValid) return itemError;
          }
        }
        if (uniqueComparator != null) {
          for (i in 0...array.length) {
            for (j in (i + 1)...array.length) {
              if (callComparator(uniqueComparator, array[i], array[j])) {
                return '"' + path + '[' + j + ']" contains a duplicate value';
              }
            }
          }
        }
      case 'object':
        if (
          !Reflect.isObject(value)
          || Std.isOfType(value, String)
          || Std.isOfType(value, Array)
        ) {
          return '"' + path + '" must be of type object';
        }
        if (keysMap != null) {
          for (field in Reflect.fields(keysMap)) {
            final schema: JoiSchema = Reflect.field(keysMap, field);
            final error = schema.check(
              Reflect.field(value, field),
              value,
              path + '.' + field
            );
            if (error != null) return error;
          }
          // unknown keys are not allowed (allowUnknown: false)
          for (field in Reflect.fields(value)) {
            if (!Reflect.hasField(keysMap, field)) {
              return '"' + path + '.' + field + '" is not allowed';
            }
          }
        }
      case _:
    }

    return null;
  }

  static function callComparator(
    comparator: Dynamic,
    a: Dynamic,
    b: Dynamic
  ): Bool {
    #if js
    return untyped comparator(a, b) == true;
    #else
    return Reflect.callMethod(null, comparator, [a, b]) == true;
    #end
  }
}
