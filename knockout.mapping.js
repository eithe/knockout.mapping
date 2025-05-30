(function(factory) {
    'use strict';

    /*global ko,require,exports,define,module*/

    if (typeof require === "function" && typeof exports === "object" && typeof module === "object") {
        // CommonJS or Node: hard-coded dependency on "knockout"
        factory(require("knockout"), exports);
    }
    else if (typeof define === "function" && define["amd"]) {
        // AMD anonymous module with hard-coded dependency on "knockout"
        define(["knockout", "exports"], factory);
    }
    else {
        // <script> tag: use the global `ko` object, attaching a `mapping` property
        if (typeof ko === 'undefined') {
            throw new Error('Knockout is required, please ensure it is loaded before loading this mapping plug-in');
        }
        factory(ko, ko.mapping = {});
    }
}(function(ko, exports) {
    'use strict';

    ko.mapping = exports;

    var DEBUG=true;
    var mappingProperty = "__ko_mapping__";
    var realKoDependentObservable = ko.dependentObservable;
    var mappingNesting = 0;
    var dependentObservables;
    var visitedObjects;
    var recognizedRootProperties = ["create", "update", "key", "arrayChanged"];
    var emptyReturn = {};

    var _defaultOptions = {
        include: ["_destroy"],
        ignore: [],
        copy: [],
        observe: []
    };
    var defaultOptions = _defaultOptions;

    function unionArrays() {
        var args = arguments,
            l = args.length,
            obj = {},
            res = [],
            i, j, k;

        while (l--) {
            k = args[l];
            i = k.length;

            while (i--) {
                j = k[i];
                if (!obj[j]) {
                    obj[j] = 1;
                    res.push(j);
                }
            }
        }

        return res;
    }

    function extendObject(destination, source) {
        var destType;

        for (var key in source) {
            if (source.hasOwnProperty(key) && source[key]) {
                destType = exports.getType(destination[key]);
                if (key && destination[key] && destType !== "array" && destType !== "string") {
                    extendObject(destination[key], source[key]);
                }
                else {
                    var bothArrays = exports.getType(destination[key]) === "array" && exports.getType(source[key]) === "array";
                    if (bothArrays) {
                        destination[key] = unionArrays(destination[key], source[key]);
                    }
                    else {
                        destination[key] = source[key];
                    }
                }
            }
        }
    }

    function merge(obj1, obj2) {
        var merged = {};
        extendObject(merged, obj1);
        extendObject(merged, obj2);

        return merged;
    }

    exports.isMapped = function(viewModel) {
        var unwrapped = ko.utils.unwrapObservable(viewModel);
        return unwrapped && unwrapped[mappingProperty];
    };

    exports.fromJS = function(jsObject /*, inputOptions, target*/) {
        if (arguments.length === 0) {
            throw new Error("When calling ko.fromJS, pass the object you want to convert.");
        }
        try {
            if (!mappingNesting) {
                dependentObservables = [];
                visitedObjects = new ObjectLookup();
            }
            mappingNesting++;

            var options;
            var target;

            if (arguments.length === 2) {
                if (arguments[1][mappingProperty]) {
                    target = arguments[1];
                }
                else {
                    options = arguments[1];
                }
            }
            if (arguments.length === 3) {
                options = arguments[1];
                target = arguments[2];
            }

            if (target) {
                options = merge(options, target[mappingProperty]);
            }
            options = fillOptions(options);

            var result = updateViewModel(target, jsObject, options);
            if (target) {
                result = target;
            }

            // Evaluate any dependent observables that were proxied.
            // Do this after the model's observables have been created
            if (!--mappingNesting) {
                while (dependentObservables.length) {
                    var DO = dependentObservables.pop();
                    if (DO) {
                        DO();
                        // Move this magic property to the underlying dependent observable
                        DO.__DO["throttleEvaluation"] = DO["throttleEvaluation"];
                    }
                }
            }

            // Save any new mapping options in the view model, so that updateFromJS can use them later.
            result[mappingProperty] = merge(result[mappingProperty], options);

            return result;
        }
        catch (e) {
            mappingNesting = 0;
            throw e;
        }
    };

    exports.fromJSON = function(jsonString /*, options, target*/) {
        var args = Array.prototype.slice.call(arguments, 0);
        args[0] = ko.utils.parseJson(jsonString);
        return exports.fromJS.apply(this, args);
    };

    exports.toJS = function(rootObject, options) {
        if (!defaultOptions) exports.resetDefaultOptions();

        if (arguments.length === 0) throw new Error("When calling ko.mapping.toJS, pass the object you want to convert.");
        if (exports.getType(defaultOptions.ignore) !== "array") throw new Error("ko.mapping.defaultOptions().ignore should be an array.");
        if (exports.getType(defaultOptions.include) !== "array") throw new Error("ko.mapping.defaultOptions().include should be an array.");
        if (exports.getType(defaultOptions.copy) !== "array") throw new Error("ko.mapping.defaultOptions().copy should be an array.");

        // Merge in the options used in fromJS
        options = fillOptions(options, rootObject[mappingProperty]);

        // We just unwrap everything at every level in the object graph
        return exports.visitModel(rootObject, function(x) {
            return ko.utils.unwrapObservable(x);
        }, options);
    };

    exports.toJSON = function(rootObject, options, replacer, space) {
        var plainJavaScriptObject = exports.toJS(rootObject, options);
        return ko.utils.stringifyJson(plainJavaScriptObject, replacer, space);
    };

    exports.defaultOptions = function() {
        if (arguments.length > 0) {
            defaultOptions = arguments[0];
        }
        else {
            return defaultOptions;
        }
    };

    exports.resetDefaultOptions = function() {
        defaultOptions = {
            include: _defaultOptions.include.slice(0),
            ignore: _defaultOptions.ignore.slice(0),
            copy: _defaultOptions.copy.slice(0),
            observe: _defaultOptions.observe.slice(0)
        };
    };

    exports.getType = function(x) {
        if ((x) && (typeof (x) === "object")) {
            if (x.constructor === Date) return "date";
            if (x.constructor === Array) return "array";
        }
        return typeof x;
    };

    function fillOptions(rawOptions, otherOptions) {
        var options = merge({}, rawOptions);

        // Move recognized root-level properties into a root namespace
        for (var i = recognizedRootProperties.length - 1; i >= 0; i--) {
            var property = recognizedRootProperties[i];

            // Carry on, unless this property is present
            if (!options[property]) continue;

            // Move the property into the root namespace
            if (!(options[""] instanceof Object)) options[""] = {};
            options[""][property] = options[property];
            delete options[property];
        }

        if (otherOptions) {
            options.ignore = mergeArrays(otherOptions.ignore, options.ignore);
            options.include = mergeArrays(otherOptions.include, options.include);
            options.copy = mergeArrays(otherOptions.copy, options.copy);
            options.observe = mergeArrays(otherOptions.observe, options.observe);
        }
        options.ignore = mergeArrays(options.ignore, defaultOptions.ignore);
        options.include = mergeArrays(options.include, defaultOptions.include);
        options.copy = mergeArrays(options.copy, defaultOptions.copy);
        options.observe = mergeArrays(options.observe, defaultOptions.observe);

        options.mappedProperties = options.mappedProperties || {};
        options.copiedProperties = options.copiedProperties || {};
        return options;
    }

    function mergeArrays(a, b) {
        if (a === undefined) {
            a = [];
        }
        else if (exports.getType(a) !== "array") {
            a = [a];
        }

        if (b === undefined) {
            b = [];
        }
        else if (exports.getType(b) !== "array") {
            b = [b];
        }

        return ko.utils.arrayGetDistinctValues(a.concat(b));
    }

    // When using a 'create' callback, we proxy the dependent observable so that it doesn't immediately evaluate on creation.
    // The reason is that the dependent observables in the user-specified callback may contain references to properties that have not been mapped yet.
    function withProxyDependentObservable(dependentObservables, callback) {
        var localDO = ko.dependentObservable;
        ko.dependentObservable = function(read, owner, options) {
            options = options || {};

            if (read && typeof read === "object") { // mirrors condition in knockout implementation of DO's
                options = read;
            }

            var realDeferEvaluation = options.deferEvaluation;
            var realIsPure = options.pure;

            var isRemoved = false;

            // We wrap the original dependent observable so that we can remove it from the 'dependentObservables' list we need to evaluate after mapping has
            // completed if the user already evaluated the DO themselves in the meantime.
            var wrap = function(DO) {
                // Temporarily revert ko.dependentObservable, since it is used in ko.isWriteableObservable
                var tmp = ko.dependentObservable;
                ko.dependentObservable = realKoDependentObservable;
                var isWriteable = ko.isWriteableObservable(DO);
                ko.dependentObservable = tmp;

                var wrapped = realKoDependentObservable({
                    read: function() {
                        if (!isRemoved) {
                            ko.utils.arrayRemoveItem(dependentObservables, DO);
                            isRemoved = true;
                        }
                        return DO.apply(DO, arguments);
                    },
                    write: isWriteable && function(val) {
                        return DO(val);
                    },
                    deferEvaluation: true
                });
                if (DEBUG) wrapped._wrapper = true;
                wrapped.__DO = DO;
                return wrapped;
            };

            options.deferEvaluation = true; // will either set for just options, or both read/options.
            var realDependentObservable = realKoDependentObservable(read, owner, options);

            if (!realDeferEvaluation && !realIsPure) {
                realDependentObservable = wrap(realDependentObservable);
                dependentObservables.push(realDependentObservable);
            }

            return realDependentObservable;
        };
        ko.dependentObservable.fn = realKoDependentObservable.fn;
        ko.computed = ko.dependentObservable;
        var result = callback();
        ko.dependentObservable = localDO;
        ko.computed = ko.dependentObservable;
        return result;
    }

    function updateViewModel(mappedRootObject, rootObject, options, parentName, parent, parentPropertyName, mappedParent) {
        var isArray = exports.getType(ko.utils.unwrapObservable(rootObject)) === "array";

        parentPropertyName = parentPropertyName || "";

        // If this object was already mapped previously, take the options from there and merge them with our existing ones.
        if (exports.isMapped(mappedRootObject)) {
            var previousMapping = ko.utils.unwrapObservable(mappedRootObject)[mappingProperty];
            options = merge(previousMapping, options);
        }

        var callbackParams = {
            data: rootObject,
            parent: mappedParent || parent
        };

        var hasCreateCallback = function() {
            return options[parentName] && options[parentName].create instanceof Function;
        };

        var createCallback = function(data) {
            return withProxyDependentObservable(dependentObservables, function() {

                if (ko.utils.unwrapObservable(parent) instanceof Array) {
                    return options[parentName].create({
                        data: data || callbackParams.data,
                        parent: callbackParams.parent,
                        skip: emptyReturn
                    });
                }
                else {
                    return options[parentName].create({
                        data: data || callbackParams.data,
                        parent: callbackParams.parent
                    });
                }
            });
        };

        var hasUpdateCallback = function() {
            return options[parentName] && options[parentName].update instanceof Function;
        };

        var updateCallback = function(obj, data) {
            var params = {
                data: data || callbackParams.data,
                parent: callbackParams.parent,
                target: ko.utils.unwrapObservable(obj)
            };

            if (ko.isWriteableObservable(obj)) {
                params.observable = obj;
            }

            return options[parentName].update(params);
        };

        var alreadyMapped = visitedObjects.get(rootObject);
        if (alreadyMapped) {
            return alreadyMapped;
        }

        parentName = parentName || "";

        if (!isArray) {
            // For atomic types, do a direct update on the observable
            if (!canHaveProperties(rootObject)) {
                switch (exports.getType(rootObject)) {
                    case "function":
                        if (hasUpdateCallback()) {
                            if (ko.isWriteableObservable(rootObject)) {
                                rootObject(updateCallback(rootObject));
                                mappedRootObject = rootObject;
                            }
                            else {
                                mappedRootObject = updateCallback(rootObject);
                            }
                        }
                        else {
                            mappedRootObject = rootObject;
                        }
                        break;
                    default:
                        if (ko.isWriteableObservable(mappedRootObject)) {
                            var valueToWrite;
                            if (hasUpdateCallback()) {
                                valueToWrite = updateCallback(mappedRootObject);
                                mappedRootObject(valueToWrite);
                                return valueToWrite;
                            }
                            else {
                                valueToWrite = ko.utils.unwrapObservable(rootObject);
                                mappedRootObject(valueToWrite);
                                return valueToWrite;
                            }
                        }
                        else {
                            var hasCreateOrUpdateCallback = hasCreateCallback() || hasUpdateCallback();

                            if (hasCreateCallback()) {
                                mappedRootObject = createCallback();
                            }
                            else {
                                mappedRootObject = ko.observable(ko.utils.unwrapObservable(rootObject));
                            }

                            if (hasUpdateCallback()) {
                                mappedRootObject(updateCallback(mappedRootObject));
                            }

                            if (hasCreateOrUpdateCallback) return mappedRootObject;
                        }
                }

            }
            else {
                mappedRootObject = ko.utils.unwrapObservable(mappedRootObject);
                if (!mappedRootObject) {
                    if (hasCreateCallback()) {
                        var result = createCallback();

                        if (hasUpdateCallback()) {
                            result = updateCallback(result);
                        }
                        return result;
                    }
                    else {
                        if (hasUpdateCallback()) {
                            //Removed ambiguous parameter result
                            return updateCallback();
                        }
                        mappedRootObject = {};
                    }
                }

                if (hasUpdateCallback()) {
                    mappedRootObject = updateCallback(mappedRootObject);
                }

                visitedObjects.save(rootObject, mappedRootObject);
                if (hasUpdateCallback()) return mappedRootObject;

                // For non-atomic types, visit all properties and update recursively
                visitPropertiesOrArrayEntries(rootObject, function(indexer) {
                    var fullPropertyName = parentPropertyName.length ? parentPropertyName + "." + escapePropertyNameComponent(indexer) : escapePropertyNameComponent(indexer);

                    if (ko.utils.arrayIndexOf(options.ignore, fullPropertyName) !== -1) {
                        return;
                    }

                    if (ko.utils.arrayIndexOf(options.copy, fullPropertyName) !== -1) {
                        mappedRootObject[indexer] = rootObject[indexer];
                        return;
                    }

                    if (typeof rootObject[indexer] !== "object" && exports.getType(rootObject[indexer]) !== "array" && options.observe.length > 0 && ko.utils.arrayIndexOf(options.observe, fullPropertyName) === -1) {
                        mappedRootObject[indexer] = rootObject[indexer];
                        options.copiedProperties[fullPropertyName] = true;
                        return;
                    }

                    // In case we are adding an already mapped property, fill it with the previously mapped property value to prevent recursion.
                    // If this is a property that was generated by fromJS, we should use the options specified there
                    var prevMappedProperty = visitedObjects.get(rootObject[indexer]);
                    var retval = updateViewModel(mappedRootObject[indexer], rootObject[indexer], options, indexer, mappedRootObject, fullPropertyName, mappedRootObject);
                    var value = prevMappedProperty || retval;

                    if (options.observe.length > 0 && ko.utils.arrayIndexOf(options.observe, fullPropertyName) === -1) {
                        mappedRootObject[indexer] = ko.utils.unwrapObservable(value);
                        options.copiedProperties[fullPropertyName] = true;
                        return;
                    }

                    if (ko.isWriteableObservable(mappedRootObject[indexer])) {
                        value = ko.utils.unwrapObservable(value);
                        if (mappedRootObject[indexer]() !== value) {
                            mappedRootObject[indexer](value);
                        }
                    }
                    else {
                        value = mappedRootObject[indexer] === undefined ? value : ko.utils.unwrapObservable(value);
                        mappedRootObject[indexer] = value;
                    }

                    options.mappedProperties[fullPropertyName] = true;
                });
            }
        }
        else { //mappedRootObject is an array
            var changes = [];

            var hasKeyCallback = false;
            var keyCallback = function(x) {
                return x;
            };
            if (options[parentName] && options[parentName].key) {
                keyCallback = options[parentName].key;
                hasKeyCallback = true;
            }

            if (!ko.isObservable(mappedRootObject)) {
                // When creating the new observable array, also add a bunch of utility functions that take the 'key' of the array items into account.
                mappedRootObject = ko.observableArray([]);

                mappedRootObject.mappedRemove = function(valueOrPredicate) {
                    var predicate = typeof valueOrPredicate === "function" ? valueOrPredicate : function(value) {
                        return value === keyCallback(valueOrPredicate);
                    };
                    return mappedRootObject.remove(function(item) {
                        return predicate(keyCallback(item));
                    });
                };

                mappedRootObject.mappedRemoveAll = function(arrayOfValues) {
                    var arrayOfKeys = filterArrayByKey(arrayOfValues, keyCallback);
                    return mappedRootObject.remove(function(item) {
                        return ko.utils.arrayIndexOf(arrayOfKeys, keyCallback(item)) !== -1;
                    });
                };

                mappedRootObject.mappedDestroy = function(valueOrPredicate) {
                    var predicate = typeof valueOrPredicate === "function" ? valueOrPredicate : function(value) {
                        return value === keyCallback(valueOrPredicate);
                    };
                    return mappedRootObject.destroy(function(item) {
                        return predicate(keyCallback(item));
                    });
                };

                mappedRootObject.mappedDestroyAll = function(arrayOfValues) {
                    var arrayOfKeys = filterArrayByKey(arrayOfValues, keyCallback);
                    return mappedRootObject.destroy(function(item) {
                        return ko.utils.arrayIndexOf(arrayOfKeys, keyCallback(item)) !== -1;
                    });
                };

                mappedRootObject.mappedIndexOf = function(item) {
                    var keys = filterArrayByKey(mappedRootObject(), keyCallback);
                    var key = keyCallback(item);
                    return ko.utils.arrayIndexOf(keys, key);
                };

                mappedRootObject.mappedGet = function(item) {
                    return mappedRootObject()[mappedRootObject.mappedIndexOf(item)];
                };

                mappedRootObject.mappedCreate = function(value) {
                    if (mappedRootObject.mappedIndexOf(value) !== -1) {
                        throw new Error("There already is an object with the key that you specified.");
                    }
                    var item = hasCreateCallback() ? createCallback(value) : value;
                    if (hasUpdateCallback()) {
                        var newValue = updateCallback(item, value);
                        if (ko.isWriteableObservable(item)) {
                            item(newValue);
                        }
                        else {
                            item = newValue;
                        }
                    }
                    mappedRootObject.push(item);
                    return item;
                };
            }

            var currentArrayKeys = filterArrayByKey(ko.utils.unwrapObservable(mappedRootObject), keyCallback).sort();
            var newArrayKeys = filterArrayByKey(rootObject, keyCallback);
            if (hasKeyCallback) newArrayKeys.sort();
            var editScript = ko.utils.compareArrays(currentArrayKeys, newArrayKeys);

            var ignoreIndexOf = {};

            var i, j, key;

            var unwrappedRootObject = ko.utils.unwrapObservable(rootObject);
            var itemsByKey = {};
            var optimizedKeys = true;
            for (i = 0, j = unwrappedRootObject.length; i < j; i++) {
                key = keyCallback(unwrappedRootObject[i]);
                if (key === undefined || key instanceof Object) {
                    optimizedKeys = false;
                    break;
                }
                itemsByKey[key] = unwrappedRootObject[i];
            }

            var newContents = [];
            var passedOver = 0;
            var item, index;

            for (i = 0, j = editScript.length; i < j; i++) {
                key = editScript[i];
                var mappedItem;
                var fullPropertyName = parentPropertyName + "[" + escapePropertyNameComponent(i) + "]";

                switch (key.status) {
                    case "added":
                        item = optimizedKeys ? itemsByKey[key.value] : getItemByKey(ko.utils.unwrapObservable(rootObject), key.value, keyCallback);
                        mappedItem = updateViewModel(undefined, item, options, parentName, mappedRootObject, fullPropertyName, parent);
                        if (!hasCreateCallback()) {
                            mappedItem = ko.utils.unwrapObservable(mappedItem);
                        }

                        index = ignorableIndexOf(ko.utils.unwrapObservable(rootObject), item, ignoreIndexOf);

                        if (mappedItem === emptyReturn) {
                            passedOver++;
                        }
                        else {
                            newContents[index - passedOver] = mappedItem;
                        }

                        ignoreIndexOf[index] = true;
                        break;
                    case "retained":
                        item = optimizedKeys ? itemsByKey[key.value] : getItemByKey(ko.utils.unwrapObservable(rootObject), key.value, keyCallback);
                        mappedItem = getItemByKey(mappedRootObject, key.value, keyCallback);
                        updateViewModel(mappedItem, item, options, parentName, mappedRootObject, fullPropertyName, parent);

                        index = ignorableIndexOf(ko.utils.unwrapObservable(rootObject), item, ignoreIndexOf);
                        newContents[index] = mappedItem;
                        ignoreIndexOf[index] = true;
                        break;
                    case "deleted":
                        mappedItem = getItemByKey(mappedRootObject, key.value, keyCallback);
                        break;
                }

                changes.push({
                    event: key.status,
                    item: mappedItem
                });
            }

            mappedRootObject(newContents);

            if (options[parentName] && options[parentName].arrayChanged) {
                ko.utils.arrayForEach(changes, function(change) {
                    options[parentName].arrayChanged(change.event, change.item);
                });
            }
        }

        return mappedRootObject;
    }

    function ignorableIndexOf(array, item, ignoreIndices) {
        for (var i = 0, j = array.length; i < j; i++) {
            if (ignoreIndices[i] === true) continue;
            if (array[i] === item) return i;
        }
        return null;
    }

    function mapKey(item, callback) {
        var mappedItem;
        if (callback) mappedItem = callback(item);
        if (exports.getType(mappedItem) === "undefined") mappedItem = item;

        return ko.utils.unwrapObservable(mappedItem);
    }

    function getItemByKey(array, key, callback) {
        array = ko.utils.unwrapObservable(array);
        for (var i = 0, j = array.length; i < j; i++) {
            var item = array[i];
            if (mapKey(item, callback) === key) return item;
        }

        throw new Error("When calling ko.update*, the key '" + key + "' was not found!");
    }

    function filterArrayByKey(array, callback) {
        return ko.utils.arrayMap(ko.utils.unwrapObservable(array), function(item) {
            if (callback) {
                return mapKey(item, callback);
            }
            else {
                return item;
            }
        });
    }

    function visitPropertiesOrArrayEntries(rootObject, visitorCallback) {
        if (exports.getType(rootObject) === "array") {
            for (var i = 0; i < rootObject.length; i++)
                visitorCallback(i);
        }
        else {
            for (var propertyName in rootObject) {
                    visitorCallback(propertyName);
            }
        }
    }

    function canHaveProperties(object) {
        if (object === null) {
            return false;
        }
        var type = exports.getType(object);
        return (type === "object") || (type === "array");
    }

    // Based on the parentName, this creates a fully classified name of a property

    function getPropertyName(parentName, parent, indexer) {
        var propertyName = parentName || "";
        if (exports.getType(parent) === "array") {
            if (parentName) {
                propertyName += "[" + escapePropertyNameComponent(indexer) + "]";
            }
        }
        else {
            if (parentName) {
                propertyName += ".";
            }
            propertyName += escapePropertyNameComponent(indexer);
        }
        return propertyName;
    }

    function escapePropertyNameComponent(indexer) {
        var escapedIndexer  = (''+indexer)
            .replace(/~/g, '~~')
            .replace(/\[/g, '~[')
            .replace(/]/g, '~]')
            .replace(/\./g, '~.');
        return escapedIndexer;
    }


    exports.visitModel = function(rootObject, callback, options) {
        options = options || {};
        options.visitedObjects = options.visitedObjects || new ObjectLookup();

        var mappedRootObject;
        var unwrappedRootObject = ko.utils.unwrapObservable(rootObject);

        if (!canHaveProperties(unwrappedRootObject)) {
            return callback(rootObject, options.parentName);
        }
        else {
            options = fillOptions(options, unwrappedRootObject[mappingProperty]);

            // Only do a callback, but ignore the results
            callback(rootObject, options.parentName);
            mappedRootObject = exports.getType(unwrappedRootObject) === "array" ? [] : {};
        }

        options.visitedObjects.save(rootObject, mappedRootObject);

        var parentName = options.parentName;
        visitPropertiesOrArrayEntries(unwrappedRootObject, function(indexer) {
            var escapedIndexer = escapePropertyNameComponent(indexer);
            if (options.ignore && ko.utils.arrayIndexOf(options.ignore, escapedIndexer) !== -1) return;

            var propertyValue = unwrappedRootObject[indexer];
            options.parentName = getPropertyName(parentName, unwrappedRootObject, indexer);

            // If we don't want to explicitly copy the unmapped property...
            if (ko.utils.arrayIndexOf(options.copy, escapedIndexer) === -1) {
                // ...find out if it's a property we want to explicitly include
                if (ko.utils.arrayIndexOf(options.include, escapedIndexer) === -1) {
                    // The mapped properties object contains all the properties that were part of the original object.
                    // If a property does not exist, and it is not because it is part of an array (e.g. "myProp[3]"), then it should not be unmapped.
                    var unwrappedRootMappingProperty = unwrappedRootObject[mappingProperty];
                    if (unwrappedRootMappingProperty) {
                        var mappedProperties = unwrappedRootMappingProperty.mappedProperties;
                        if (mappedProperties && !mappedProperties[escapedIndexer]) {
                            var copiedProperties = unwrappedRootMappingProperty.copiedProperties;
                            if (copiedProperties && !copiedProperties[escapedIndexer] && (exports.getType(unwrappedRootObject) !== "array")) {
                                return;
                            }
                        }
                    }
                }
            }

            switch (exports.getType(ko.utils.unwrapObservable(propertyValue))) {
                case "object":
                case "array":
                case "undefined":
                    var previouslyMappedValue = options.visitedObjects.get(propertyValue);
                    mappedRootObject[indexer] = (exports.getType(previouslyMappedValue) !== "undefined") ? previouslyMappedValue : exports.visitModel(propertyValue, callback, options);
                    break;
                default:
                    mappedRootObject[indexer] = callback(propertyValue, options.parentName);
            }
        });

        return mappedRootObject;
    };

    function SimpleObjectLookup() {
        var keys = [];
        var values = [];
        this.save = function(key, value) {
            var existingIndex = ko.utils.arrayIndexOf(keys, key);
            if (existingIndex >= 0) values[existingIndex] = value;
            else {
                keys.push(key);
                values.push(value);
            }
        };
        this.get = function(key) {
            var existingIndex = ko.utils.arrayIndexOf(keys, key);
            var value = (existingIndex >= 0) ? values[existingIndex] : undefined;
            return value;
        };
    }

    function ObjectLookup() {
        var buckets = {};

        var findBucket = function(key) {
            var bucketKey;
            try {
                bucketKey = key;//JSON.stringify(key);
            }
            catch (e) {
                bucketKey = "$$$";
            }

            var bucket = buckets[bucketKey];
            if (!buckets.hasOwnProperty(bucketKey)) {
                bucket = new SimpleObjectLookup();
                buckets[bucketKey] = bucket;
            }
            return bucket;
        };

        this.save = function(key, value) {
            findBucket(key).save(key, value);
        };
        this.get = function(key) {
            return findBucket(key).get(key);
        };
    }
}));
