'use strict';

var _ = require('lodash'),
    fs = require('fs'),
    path = require('path'),
    env = module.exports = {},
    cfgFilePath = path.join(process.cwd(), (process.env.ENV_VAR_CONFIG_FILE || 'env.json')),
    cfg = JSON.parse(fs.readFileSync(cfgFilePath, 'utf8') || '{}');

var converters = {
  string: { // Any object that implements `toString`
    parse: function (x) { return x != null && x.toString(); },
    validate: function (x) { return _.isString(x); }
  },
  number: { // Numbers and strings that can be parsed into numbers
    parse: parseFloat,
    validate: function (x) { return !isNaN(x); }
  },
  boolean: { // `true`, `false`, `'true'` and `'false'`
    parse: function (x) {
      if (typeof x === 'boolean') return x;
      if (x === 'true') return true;
      if (x === 'false') return false;
    },
    validate: _.isBoolean
  },
  date: { // Any string for which `new Date()` will return a valid date
    parse: function (x) { return new Date(x); },
    validate: _.isDate
  },
  object: { // Parse JSON objects
    parse: JSON.parse,
    validate: _.isObject
  },
  function: { // Any valid JavaScript expression; `this` refers to `env`
    parse: function (x) { return eval(x); } // jshint ignore: line
  }
};

// Add environment variables from `process.env`
_.extend(env, process.env);

// Parse environment variables from `env.json`
_.each(cfg, function (options, key) {
  if (!_.isObject(options)) options = { default: options }; // Shorthand notation

  var processValueIsDefined = process.env[key] !== undefined;
  var defaultValueIsDefined = options.default !== undefined;
  var environmentValueIsDefined = options[env.NODE_ENV] !== undefined;
  if (processValueIsDefined || defaultValueIsDefined || environmentValueIsDefined) {
    var value;
    var defaultValueKey = environmentValueIsDefined ? env.NODE_ENV : 'default'; // Use corresponding key to get default value
    if (processValueIsDefined) { // Values from `process.env` take precedence over `env.json`
      if (options.type === undefined) {
        var defaultValue = options[defaultValueKey];
        if (defaultValue !== undefined) { // Infer type from default value
          options.type = typeof defaultValue;
        }
        else { // `process.env` can only contain strings anyway
          options.type = 'string';
        }
      }
      value = process.env[key];
    }
    else if (defaultValueIsDefined || environmentValueIsDefined) { // The condition is just for clarity, it's always true
      value = options[defaultValueKey];

      if (value === undefined && !options.required) return; // Don't enforce convertion

      _.defaults(options, { type: typeof value }); // Infer type from default value if necessary
      process.env[key] = value; // Put the value into `process.env`
    }

    var converter = converters[options.type];
    if (!converter) {
      console.error('Unsupported type for environment variable `' + key + '`: ' + options.type);
      process.exit(1);
    }

    var parsedValue = _.isString(value) ?
                        converter.parse.call(env, value) : // Call with `env` to allow for variable interdependency
                        value; // Only parse the value if it's a string that could've come from `process.env`
    if (converter.validate && !converter.validate(parsedValue)) {
      console.error('Invalid value for environment variable `' + key + '`: ' + value);
      process.exit(1);
    }

    env[key] = parsedValue;
  }
  else if (options.required) {
    console.error('Required environment variable `' + key + '`');
    process.exit(1);
  }
});
