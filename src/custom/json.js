(function (global){

var ym = {
	"project": {
		"preload": [
			"package.system"
		],
		"namespace": "ymaps",
		"jsonpPrefix": "",
		"loadLimit": 500
	},
	"ns": {},
	"env": {},
	"envCallbacks": []
};

(function () {
var module = { exports: {} }, exports = module.exports;
/**
 * Modules
 *
 * Copyright (c) 2013 Filatov Dmitry (dfilatov@yandex-team.ru)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 * @version 0.1.0
 */

(function(global) {

var undef,

    DECL_STATES = {
        NOT_RESOLVED : 'NOT_RESOLVED',
        IN_RESOLVING : 'IN_RESOLVING',
        RESOLVED     : 'RESOLVED'
    },

    /**
     * Creates a new instance of modular system
     * @returns {Object}
     */
    create = function() {
        var curOptions = {
                trackCircularDependencies : true,
                allowMultipleDeclarations : true
            },

            modulesStorage = {},
            waitForNextTick = false,
            pendingRequires = [],

            /**
             * Defines module
             * @param {String} name
             * @param {String[]} [deps]
             * @param {Function} declFn
             */
            define = function(name, deps, declFn) {
                if(!declFn) {
                    declFn = deps;
                    deps = [];
                }

                var module = modulesStorage[name];
                if(!module) {
                    module = modulesStorage[name] = {
                        name : name,
                        decl : undef
                    };
                }

                module.decl = {
                    name       : name,
                    prev       : module.decl,
                    fn         : declFn,
                    state      : DECL_STATES.NOT_RESOLVED,
                    deps       : deps,
                    dependents : [],
                    exports    : undef
                };
            },

            /**
             * Requires modules
             * @param {String|String[]} modules
             * @param {Function} cb
             * @param {Function} [errorCb]
             */
            require = function(modules, cb, errorCb) {
                if(typeof modules === 'string') {
                    modules = [modules];
                }

                if(!waitForNextTick) {
                    waitForNextTick = true;
                    nextTick(onNextTick);
                }

                pendingRequires.push({
                    deps : modules,
                    cb   : function(exports, error) {
                        error?
                            (errorCb || onError)(error) :
                            cb.apply(global, exports);
                    }
                });
            },

            /**
             * Returns state of module
             * @param {String} name
             * @returns {String} state, possible values are NOT_DEFINED, NOT_RESOLVED, IN_RESOLVING, RESOLVED
             */
            getState = function(name) {
                var module = modulesStorage[name];
                return module?
                    DECL_STATES[module.decl.state] :
                    'NOT_DEFINED';
            },

            /**
             * Returns dependencies of module
             * @param {String} name
             * @returns {String[]|null}
             */
            getDependencies = function (name) {
                var module = modulesStorage[name];
                return module ? module.decl.deps : null;
            },

            /**
             * Returns whether the module is defined
             * @param {String} name
             * @returns {Boolean}
             */
            isDefined = function(name) {
                return !!modulesStorage[name];
            },

            /**
             * Sets options
             * @param {Object} options
             */
            setOptions = function(options) {
                for(var name in options) {
                    if(options.hasOwnProperty(name)) {
                        curOptions[name] = options[name];
                    }
                }
            },

            onNextTick = function() {
                waitForNextTick = false;
                applyRequires();
            },

            applyRequires = function() {
                var requiresToProcess = pendingRequires,
                    i = 0, require;

                pendingRequires = [];

                while(require = requiresToProcess[i++]) {
                    requireDeps(null, require.deps, [], require.cb);
                }
            },

            requireDeps = function(fromDecl, deps, path, cb) {
                var unresolvedDepsCnt = deps.length;
                if(!unresolvedDepsCnt) {
                    cb([]);
                }

                var decls = [],
                    onDeclResolved = function(_, error) {
                        if(error) {
                            cb(null, error);
                            return;
                        }

                        if(!--unresolvedDepsCnt) {
                            var exports = [],
                                i = 0, decl;
                            while(decl = decls[i++]) {
                                exports.push(decl.exports);
                            }
                            cb(exports);
                        }
                    },
                    i = 0, len = unresolvedDepsCnt,
                    dep, decl;

                while(i < len) {
                    dep = deps[i++];
                    if(typeof dep === 'string') {
                        if(!modulesStorage[dep]) {
                            cb(null, buildModuleNotFoundError(dep, fromDecl));
                            return;
                        }

                        decl = modulesStorage[dep].decl;
                    }
                    else {
                        decl = dep;
                    }

                    decls.push(decl);

                    startDeclResolving(decl, path, onDeclResolved);
                }
            },

            startDeclResolving = function(decl, path, cb) {
                if(decl.state === DECL_STATES.RESOLVED) {
                    cb(decl.exports);
                    return;
                }
                else if(decl.state === DECL_STATES.IN_RESOLVING) {
                    curOptions.trackCircularDependencies && isDependenceCircular(decl, path)?
                        cb(null, buildCircularDependenceError(decl, path)) :
                        decl.dependents.push(cb);
                    return;
                }

                decl.dependents.push(cb);

                if(decl.prev && !curOptions.allowMultipleDeclarations) {
                    provideError(decl, buildMultipleDeclarationError(decl));
                    return;
                }

                curOptions.trackCircularDependencies && (path = path.slice()).push(decl);

                var isProvided = false,
                    deps = decl.prev? decl.deps.concat([decl.prev]) : decl.deps;

                decl.state = DECL_STATES.IN_RESOLVING;
                requireDeps(
                    decl,
                    deps,
                    path,
                    function(depDeclsExports, error) {
                        if(error) {
                            provideError(decl, error);
                            return;
                        }

                        depDeclsExports.unshift(function(exports, error) {
                            if(isProvided) {
                                cb(null, buildDeclAreadyProvidedError(decl));
                                return;
                            }

                            isProvided = true;
                            error?
                                provideError(decl, error) :
                                provideDecl(decl, exports);
                        });

                        decl.fn.apply(
                            {
                                name   : decl.name,
                                deps   : decl.deps,
                                global : global
                            },
                            depDeclsExports);
                    });
            },

            provideDecl = function(decl, exports) {
                decl.exports = exports;
                decl.state = DECL_STATES.RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(exports);
                }

                decl.dependents = undef;
            },

            provideError = function(decl, error) {
                decl.state = DECL_STATES.NOT_RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(null, error);
                }

                decl.dependents = [];
            };

        return {
            create          : create,
            define          : define,
            require         : require,
            getState        : getState,
            getDependencies : getDependencies,
            isDefined       : isDefined,
            setOptions      : setOptions,
            flush           : onNextTick,
            nextTick        : nextTick
        };
    },

    onError = function(e) {
        nextTick(function() {
            throw e;
        });
    },

    buildModuleNotFoundError = function(name, decl) {
        return Error(decl?
            'Module "' + decl.name + '": can\'t resolve dependence "' + name + '"' :
            'Required module "' + name + '" can\'t be resolved');
    },

    buildCircularDependenceError = function(decl, path) {
        var strPath = [],
            i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            strPath.push(pathDecl.name);
        }
        strPath.push(decl.name);

        return Error('Circular dependence has been detected: "' + strPath.join(' -> ') + '"');
    },

    buildDeclAreadyProvidedError = function(decl) {
        return Error('Declaration of module "' + decl.name + '" has already been provided');
    },

    buildMultipleDeclarationError = function(decl) {
        return Error('Multiple declarations of module "' + decl.name + '" have been detected');
    },

    isDependenceCircular = function(decl, path) {
        var i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            if(decl === pathDecl) {
                return true;
            }
        }
        return false;
    },

    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof process === 'object' && process.nextTick) { // nodejs
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.setImmediate) { // ie10
            return function(fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if(global.postMessage && !global.opera) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__modules' + (+new Date()),
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var head = doc.getElementsByTagName('head')[0],
                createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                    };
                    head.appendChild(script);
                };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })();

if(typeof exports === 'object') {
    module.exports = create();
}
else {
    global.modules = create();
}

})(this);

ym['modules'] = module.exports;
})();
ym.modules.setOptions({
   trackCircularDependencies: true,
   allowMultipleDeclarations: false
});
ym.ns.modules = ym.modules;

(function () {
var module = { exports: {} }, exports = module.exports;
var define, modules;/**
 * @module vow
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 * @version 0.4.13
 * @license
 * Dual licensed under the MIT and GPL licenses:
 *   * http://www.opensource.org/licenses/mit-license.php
 *   * http://www.gnu.org/licenses/gpl.html
 */

(function(global) {

var undef,
    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                fns.push(fn);
                return fns.length === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof setImmediate === 'function') { // ie10, nodejs >= 0.10
            return function(fn) {
                enqueueFn(fn) && setImmediate(callFns);
            };
        }

        if(typeof process === 'object' && process.nextTick) { // nodejs < 0.10
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        var MutationObserver = global.MutationObserver || global.WebKitMutationObserver; // modern browsers
        if(MutationObserver) {
            var num = 1,
                node = document.createTextNode('');

            new MutationObserver(callFns).observe(node, { characterData : true });

            return function(fn) {
                enqueueFn(fn) && (node.data = (num *= -1));
            };
        }

        if(global.postMessage) {
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__promise' + Math.random() + '_' +new Date,
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                };
                (doc.documentElement || doc.body).appendChild(script);
            };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })(),
    throwException = function(e) {
        nextTick(function() {
            throw e;
        });
    },
    isFunction = function(obj) {
        return typeof obj === 'function';
    },
    isObject = function(obj) {
        return obj !== null && typeof obj === 'object';
    },
    toStr = Object.prototype.toString,
    isArray = Array.isArray || function(obj) {
        return toStr.call(obj) === '[object Array]';
    },
    getArrayKeys = function(arr) {
        var res = [],
            i = 0, len = arr.length;
        while(i < len) {
            res.push(i++);
        }
        return res;
    },
    getObjectKeys = Object.keys || function(obj) {
        var res = [];
        for(var i in obj) {
            obj.hasOwnProperty(i) && res.push(i);
        }
        return res;
    },
    defineCustomErrorType = function(name) {
        var res = function(message) {
            this.name = name;
            this.message = message;
        };

        res.prototype = new Error();

        return res;
    },
    wrapOnFulfilled = function(onFulfilled, idx) {
        return function(val) {
            onFulfilled.call(this, val, idx);
        };
    };

/**
 * @class Deferred
 * @exports vow:Deferred
 * @description
 * The `Deferred` class is used to encapsulate newly-created promise object along with functions that resolve, reject or notify it.
 */

/**
 * @constructor
 * @description
 * You can use `vow.defer()` instead of using this constructor.
 *
 * `new vow.Deferred()` gives the same result as `vow.defer()`.
 */
var Deferred = function() {
    this._promise = new Promise();
};

Deferred.prototype = /** @lends Deferred.prototype */{
    /**
     * Returns the corresponding promise.
     *
     * @returns {vow:Promise}
     */
    promise : function() {
        return this._promise;
    },

    /**
     * Resolves the corresponding promise with the given `value`.
     *
     * @param {*} value
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.then(function(value) {
     *     // value is "'success'" here
     * });
     *
     * defer.resolve('success');
     * ```
     */
    resolve : function(value) {
        this._promise.isResolved() || this._promise._resolve(value);
    },

    /**
     * Rejects the corresponding promise with the given `reason`.
     *
     * @param {*} reason
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.fail(function(reason) {
     *     // reason is "'something is wrong'" here
     * });
     *
     * defer.reject('something is wrong');
     * ```
     */
    reject : function(reason) {
        if(this._promise.isResolved()) {
            return;
        }

        if(vow.isPromise(reason)) {
            reason = reason.then(function(val) {
                var defer = vow.defer();
                defer.reject(val);
                return defer.promise();
            });
            this._promise._resolve(reason);
        }
        else {
            this._promise._reject(reason);
        }
    },

    /**
     * Notifies the corresponding promise with the given `value`.
     *
     * @param {*} value
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.progress(function(value) {
     *     // value is "'20%'", "'40%'" here
     * });
     *
     * defer.notify('20%');
     * defer.notify('40%');
     * ```
     */
    notify : function(value) {
        this._promise.isResolved() || this._promise._notify(value);
    }
};

var PROMISE_STATUS = {
    PENDING   : 0,
    RESOLVED  : 1,
    FULFILLED : 2,
    REJECTED  : 3
};

/**
 * @class Promise
 * @exports vow:Promise
 * @description
 * The `Promise` class is used when you want to give to the caller something to subscribe to,
 * but not the ability to resolve or reject the deferred.
 */

/**
 * @constructor
 * @param {Function} resolver See https://github.com/domenic/promises-unwrapping/blob/master/README.md#the-promise-constructor for details.
 * @description
 * You should use this constructor directly only if you are going to use `vow` as DOM Promises implementation.
 * In other case you should use `vow.defer()` and `defer.promise()` methods.
 * @example
 * ```js
 * function fetchJSON(url) {
 *     return new vow.Promise(function(resolve, reject, notify) {
 *         var xhr = new XMLHttpRequest();
 *         xhr.open('GET', url);
 *         xhr.responseType = 'json';
 *         xhr.send();
 *         xhr.onload = function() {
 *             if(xhr.response) {
 *                 resolve(xhr.response);
 *             }
 *             else {
 *                 reject(new TypeError());
 *             }
 *         };
 *     });
 * }
 * ```
 */
var Promise = function(resolver) {
    this._value = undef;
    this._status = PROMISE_STATUS.PENDING;

    this._fulfilledCallbacks = [];
    this._rejectedCallbacks = [];
    this._progressCallbacks = [];

    if(resolver) { // NOTE: see https://github.com/domenic/promises-unwrapping/blob/master/README.md
        var _this = this,
            resolverFnLen = resolver.length;

        resolver(
            function(val) {
                _this.isResolved() || _this._resolve(val);
            },
            resolverFnLen > 1?
                function(reason) {
                    _this.isResolved() || _this._reject(reason);
                } :
                undef,
            resolverFnLen > 2?
                function(val) {
                    _this.isResolved() || _this._notify(val);
                } :
                undef);
    }
};

Promise.prototype = /** @lends Promise.prototype */ {
    /**
     * Returns the value of the fulfilled promise or the reason in case of rejection.
     *
     * @returns {*}
     */
    valueOf : function() {
        return this._value;
    },

    /**
     * Returns `true` if the promise is resolved.
     *
     * @returns {Boolean}
     */
    isResolved : function() {
        return this._status !== PROMISE_STATUS.PENDING;
    },

    /**
     * Returns `true` if the promise is fulfilled.
     *
     * @returns {Boolean}
     */
    isFulfilled : function() {
        return this._status === PROMISE_STATUS.FULFILLED;
    },

    /**
     * Returns `true` if the promise is rejected.
     *
     * @returns {Boolean}
     */
    isRejected : function() {
        return this._status === PROMISE_STATUS.REJECTED;
    },

    /**
     * Adds reactions to the promise.
     *
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise} A new promise, see https://github.com/promises-aplus/promises-spec for details
     */
    then : function(onFulfilled, onRejected, onProgress, ctx) {
        var defer = new Deferred();
        this._addCallbacks(defer, onFulfilled, onRejected, onProgress, ctx);
        return defer.promise();
    },

    /**
     * Adds only a rejection reaction. This method is a shorthand for `promise.then(undefined, onRejected)`.
     *
     * @param {Function} onRejected Callback that will be called with a provided 'reason' as argument after the promise has been rejected
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    'catch' : function(onRejected, ctx) {
        return this.then(undef, onRejected, ctx);
    },

    /**
     * Adds only a rejection reaction. This method is a shorthand for `promise.then(null, onRejected)`. It's also an alias for `catch`.
     *
     * @param {Function} onRejected Callback to be called with the value after promise has been rejected
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    fail : function(onRejected, ctx) {
        return this.then(undef, onRejected, ctx);
    },

    /**
     * Adds a resolving reaction (for both fulfillment and rejection).
     *
     * @param {Function} onResolved Callback that will be invoked with the promise as an argument, after the promise has been resolved.
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    always : function(onResolved, ctx) {
        var _this = this,
            cb = function() {
                return onResolved.call(this, _this);
            };

        return this.then(cb, cb, ctx);
    },

    /**
     * Adds a progress reaction.
     *
     * @param {Function} onProgress Callback that will be called with a provided value when the promise has been notified
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    progress : function(onProgress, ctx) {
        return this.then(undef, undef, onProgress, ctx);
    },

    /**
     * Like `promise.then`, but "spreads" the array into a variadic value handler.
     * It is useful with the `vow.all` and the `vow.allResolved` methods.
     *
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all([defer1.promise(), defer2.promise()]).spread(function(arg1, arg2) {
     *     // arg1 is "1", arg2 is "'two'" here
     * });
     *
     * defer1.resolve(1);
     * defer2.resolve('two');
     * ```
     */
    spread : function(onFulfilled, onRejected, ctx) {
        return this.then(
            function(val) {
                return onFulfilled.apply(this, val);
            },
            onRejected,
            ctx);
    },

    /**
     * Like `then`, but terminates a chain of promises.
     * If the promise has been rejected, this method throws it's "reason" as an exception in a future turn of the event loop.
     *
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     *
     * @example
     * ```js
     * var defer = vow.defer();
     * defer.reject(Error('Internal error'));
     * defer.promise().done(); // exception to be thrown
     * ```
     */
    done : function(onFulfilled, onRejected, onProgress, ctx) {
        this
            .then(onFulfilled, onRejected, onProgress, ctx)
            .fail(throwException);
    },

    /**
     * Returns a new promise that will be fulfilled in `delay` milliseconds if the promise is fulfilled,
     * or immediately rejected if the promise is rejected.
     *
     * @param {Number} delay
     * @returns {vow:Promise}
     */
    delay : function(delay) {
        var timer,
            promise = this.then(function(val) {
                var defer = new Deferred();
                timer = setTimeout(
                    function() {
                        defer.resolve(val);
                    },
                    delay);

                return defer.promise();
            });

        promise.always(function() {
            clearTimeout(timer);
        });

        return promise;
    },

    /**
     * Returns a new promise that will be rejected in `timeout` milliseconds
     * if the promise is not resolved beforehand.
     *
     * @param {Number} timeout
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promiseWithTimeout1 = defer.promise().timeout(50),
     *     promiseWithTimeout2 = defer.promise().timeout(200);
     *
     * setTimeout(
     *     function() {
     *         defer.resolve('ok');
     *     },
     *     100);
     *
     * promiseWithTimeout1.fail(function(reason) {
     *     // promiseWithTimeout to be rejected in 50ms
     * });
     *
     * promiseWithTimeout2.then(function(value) {
     *     // promiseWithTimeout to be fulfilled with "'ok'" value
     * });
     * ```
     */
    timeout : function(timeout) {
        var defer = new Deferred(),
            timer = setTimeout(
                function() {
                    defer.reject(new vow.TimedOutError('timed out'));
                },
                timeout);

        this.then(
            function(val) {
                defer.resolve(val);
            },
            function(reason) {
                defer.reject(reason);
            });

        defer.promise().always(function() {
            clearTimeout(timer);
        });

        return defer.promise();
    },

    _vow : true,

    _resolve : function(val) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        if(val === this) {
            this._reject(TypeError('Can\'t resolve promise with itself'));
            return;
        }

        this._status = PROMISE_STATUS.RESOLVED;

        if(val && !!val._vow) { // shortpath for vow.Promise
            val.isFulfilled()?
                this._fulfill(val.valueOf()) :
                val.isRejected()?
                    this._reject(val.valueOf()) :
                    val.then(
                        this._fulfill,
                        this._reject,
                        this._notify,
                        this);
            return;
        }

        if(isObject(val) || isFunction(val)) {
            var then;
            try {
                then = val.then;
            }
            catch(e) {
                this._reject(e);
                return;
            }

            if(isFunction(then)) {
                var _this = this,
                    isResolved = false;

                try {
                    then.call(
                        val,
                        function(val) {
                            if(isResolved) {
                                return;
                            }

                            isResolved = true;
                            _this._resolve(val);
                        },
                        function(err) {
                            if(isResolved) {
                                return;
                            }

                            isResolved = true;
                            _this._reject(err);
                        },
                        function(val) {
                            _this._notify(val);
                        });
                }
                catch(e) {
                    isResolved || this._reject(e);
                }

                return;
            }
        }

        this._fulfill(val);
    },

    _fulfill : function(val) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        this._status = PROMISE_STATUS.FULFILLED;
        this._value = val;

        this._callCallbacks(this._fulfilledCallbacks, val);
        this._fulfilledCallbacks = this._rejectedCallbacks = this._progressCallbacks = undef;
    },

    _reject : function(reason) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        this._status = PROMISE_STATUS.REJECTED;
        this._value = reason;

        this._callCallbacks(this._rejectedCallbacks, reason);
        this._fulfilledCallbacks = this._rejectedCallbacks = this._progressCallbacks = undef;
    },

    _notify : function(val) {
        this._callCallbacks(this._progressCallbacks, val);
    },

    _addCallbacks : function(defer, onFulfilled, onRejected, onProgress, ctx) {
        if(onRejected && !isFunction(onRejected)) {
            ctx = onRejected;
            onRejected = undef;
        }
        else if(onProgress && !isFunction(onProgress)) {
            ctx = onProgress;
            onProgress = undef;
        }

        var cb;

        if(!this.isRejected()) {
            cb = { defer : defer, fn : isFunction(onFulfilled)? onFulfilled : undef, ctx : ctx };
            this.isFulfilled()?
                this._callCallbacks([cb], this._value) :
                this._fulfilledCallbacks.push(cb);
        }

        if(!this.isFulfilled()) {
            cb = { defer : defer, fn : onRejected, ctx : ctx };
            this.isRejected()?
                this._callCallbacks([cb], this._value) :
                this._rejectedCallbacks.push(cb);
        }

        if(this._status <= PROMISE_STATUS.RESOLVED) {
            this._progressCallbacks.push({ defer : defer, fn : onProgress, ctx : ctx });
        }
    },

    _callCallbacks : function(callbacks, arg) {
        var len = callbacks.length;
        if(!len) {
            return;
        }

        var isResolved = this.isResolved(),
            isFulfilled = this.isFulfilled(),
            isRejected = this.isRejected();

        nextTick(function() {
            var i = 0, cb, defer, fn;
            while(i < len) {
                cb = callbacks[i++];
                defer = cb.defer;
                fn = cb.fn;

                if(fn) {
                    var ctx = cb.ctx,
                        res;
                    try {
                        res = ctx? fn.call(ctx, arg) : fn(arg);
                    }
                    catch(e) {
                        defer.reject(e);
                        continue;
                    }

                    isResolved?
                        defer.resolve(res) :
                        defer.notify(res);
                }
                else if(isFulfilled) {
                    defer.resolve(arg);
                }
                else if(isRejected) {
                    defer.reject(arg);
                }
                else {
                    defer.notify(arg);
                }
            }
        });
    }
};

/** @lends Promise */
var staticMethods = {
    /**
     * Coerces the given `value` to a promise, or returns the `value` if it's already a promise.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    cast : function(value) {
        return vow.cast(value);
    },

    /**
     * Returns a promise, that will be fulfilled only after all the items in `iterable` are fulfilled.
     * If any of the `iterable` items gets rejected, then the returned promise will be rejected.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     */
    all : function(iterable) {
        return vow.all(iterable);
    },

    /**
     * Returns a promise, that will be fulfilled only when any of the items in `iterable` are fulfilled.
     * If any of the `iterable` items gets rejected, then the returned promise will be rejected.
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    race : function(iterable) {
        return vow.anyResolved(iterable);
    },

    /**
     * Returns a promise that has already been resolved with the given `value`.
     * If `value` is a promise, the returned promise will have `value`'s state.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    resolve : function(value) {
        return vow.resolve(value);
    },

    /**
     * Returns a promise that has already been rejected with the given `reason`.
     *
     * @param {*} reason
     * @returns {vow:Promise}
     */
    reject : function(reason) {
        return vow.reject(reason);
    }
};

for(var prop in staticMethods) {
    staticMethods.hasOwnProperty(prop) &&
        (Promise[prop] = staticMethods[prop]);
}

var vow = /** @exports vow */ {
    Deferred : Deferred,

    Promise : Promise,

    /**
     * Creates a new deferred. This method is a factory method for `vow:Deferred` class.
     * It's equivalent to `new vow.Deferred()`.
     *
     * @returns {vow:Deferred}
     */
    defer : function() {
        return new Deferred();
    },

    /**
     * Static equivalent to `promise.then`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise}
     */
    when : function(value, onFulfilled, onRejected, onProgress, ctx) {
        return vow.cast(value).then(onFulfilled, onRejected, onProgress, ctx);
    },

    /**
     * Static equivalent to `promise.fail`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onRejected Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    fail : function(value, onRejected, ctx) {
        return vow.when(value, undef, onRejected, ctx);
    },

    /**
     * Static equivalent to `promise.always`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onResolved Callback that will be invoked with the promise as an argument, after the promise has been resolved.
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    always : function(value, onResolved, ctx) {
        return vow.when(value).always(onResolved, ctx);
    },

    /**
     * Static equivalent to `promise.progress`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onProgress Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    progress : function(value, onProgress, ctx) {
        return vow.when(value).progress(onProgress, ctx);
    },

    /**
     * Static equivalent to `promise.spread`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise}
     */
    spread : function(value, onFulfilled, onRejected, ctx) {
        return vow.when(value).spread(onFulfilled, onRejected, ctx);
    },

    /**
     * Static equivalent to `promise.done`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     */
    done : function(value, onFulfilled, onRejected, onProgress, ctx) {
        vow.when(value).done(onFulfilled, onRejected, onProgress, ctx);
    },

    /**
     * Checks whether the given `value` is a promise-like object
     *
     * @param {*} value
     * @returns {Boolean}
     *
     * @example
     * ```js
     * vow.isPromise('something'); // returns false
     * vow.isPromise(vow.defer().promise()); // returns true
     * vow.isPromise({ then : function() { }); // returns true
     * ```
     */
    isPromise : function(value) {
        return isObject(value) && isFunction(value.then);
    },

    /**
     * Coerces the given `value` to a promise, or returns the `value` if it's already a promise.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    cast : function(value) {
        return value && !!value._vow?
            value :
            vow.resolve(value);
    },

    /**
     * Static equivalent to `promise.valueOf`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {*}
     */
    valueOf : function(value) {
        return value && isFunction(value.valueOf)? value.valueOf() : value;
    },

    /**
     * Static equivalent to `promise.isFulfilled`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isFulfilled : function(value) {
        return value && isFunction(value.isFulfilled)? value.isFulfilled() : true;
    },

    /**
     * Static equivalent to `promise.isRejected`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isRejected : function(value) {
        return value && isFunction(value.isRejected)? value.isRejected() : false;
    },

    /**
     * Static equivalent to `promise.isResolved`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isResolved : function(value) {
        return value && isFunction(value.isResolved)? value.isResolved() : true;
    },

    /**
     * Returns a promise that has already been resolved with the given `value`.
     * If `value` is a promise, the returned promise will have `value`'s state.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    resolve : function(value) {
        var res = vow.defer();
        res.resolve(value);
        return res.promise();
    },

    /**
     * Returns a promise that has already been fulfilled with the given `value`.
     * If `value` is a promise, the returned promise will be fulfilled with the fulfill/rejection value of `value`.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    fulfill : function(value) {
        var defer = vow.defer(),
            promise = defer.promise();

        defer.resolve(value);

        return promise.isFulfilled()?
            promise :
            promise.then(null, function(reason) {
                return reason;
            });
    },

    /**
     * Returns a promise that has already been rejected with the given `reason`.
     * If `reason` is a promise, the returned promise will be rejected with the fulfill/rejection value of `reason`.
     *
     * @param {*} reason
     * @returns {vow:Promise}
     */
    reject : function(reason) {
        var defer = vow.defer();
        defer.reject(reason);
        return defer.promise();
    },

    /**
     * Invokes the given function `fn` with arguments `args`
     *
     * @param {Function} fn
     * @param {...*} [args]
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var promise1 = vow.invoke(function(value) {
     *         return value;
     *     }, 'ok'),
     *     promise2 = vow.invoke(function() {
     *         throw Error();
     *     });
     *
     * promise1.isFulfilled(); // true
     * promise1.valueOf(); // 'ok'
     * promise2.isRejected(); // true
     * promise2.valueOf(); // instance of Error
     * ```
     */
    invoke : function(fn, args) {
        var len = Math.max(arguments.length - 1, 0),
            callArgs;
        if(len) { // optimization for V8
            callArgs = Array(len);
            var i = 0;
            while(i < len) {
                callArgs[i++] = arguments[i];
            }
        }

        try {
            return vow.resolve(callArgs?
                fn.apply(global, callArgs) :
                fn.call(global));
        }
        catch(e) {
            return vow.reject(e);
        }
    },

    /**
     * Returns a promise, that will be fulfilled only after all the items in `iterable` are fulfilled.
     * If any of the `iterable` items gets rejected, the promise will be rejected.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     *
     * @example
     * with array:
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all([defer1.promise(), defer2.promise(), 3])
     *     .then(function(value) {
     *          // value is "[1, 2, 3]" here
     *     });
     *
     * defer1.resolve(1);
     * defer2.resolve(2);
     * ```
     *
     * @example
     * with object:
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all({ p1 : defer1.promise(), p2 : defer2.promise(), p3 : 3 })
     *     .then(function(value) {
     *          // value is "{ p1 : 1, p2 : 2, p3 : 3 }" here
     *     });
     *
     * defer1.resolve(1);
     * defer2.resolve(2);
     * ```
     */
    all : function(iterable) {
        var defer = new Deferred(),
            isPromisesArray = isArray(iterable),
            keys = isPromisesArray?
                getArrayKeys(iterable) :
                getObjectKeys(iterable),
            len = keys.length,
            res = isPromisesArray? [] : {};

        if(!len) {
            defer.resolve(res);
            return defer.promise();
        }

        var i = len;
        vow._forEach(
            iterable,
            function(value, idx) {
                res[keys[idx]] = value;
                if(!--i) {
                    defer.resolve(res);
                }
            },
            defer.reject,
            defer.notify,
            defer,
            keys);

        return defer.promise();
    },

    /**
     * Returns a promise, that will be fulfilled only after all the items in `iterable` are resolved.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.allResolved([defer1.promise(), defer2.promise()]).spread(function(promise1, promise2) {
     *     promise1.isRejected(); // returns true
     *     promise1.valueOf(); // returns "'error'"
     *     promise2.isFulfilled(); // returns true
     *     promise2.valueOf(); // returns "'ok'"
     * });
     *
     * defer1.reject('error');
     * defer2.resolve('ok');
     * ```
     */
    allResolved : function(iterable) {
        var defer = new Deferred(),
            isPromisesArray = isArray(iterable),
            keys = isPromisesArray?
                getArrayKeys(iterable) :
                getObjectKeys(iterable),
            i = keys.length,
            res = isPromisesArray? [] : {};

        if(!i) {
            defer.resolve(res);
            return defer.promise();
        }

        var onResolved = function() {
                --i || defer.resolve(iterable);
            };

        vow._forEach(
            iterable,
            onResolved,
            onResolved,
            defer.notify,
            defer,
            keys);

        return defer.promise();
    },

    allPatiently : function(iterable) {
        return vow.allResolved(iterable).then(function() {
            var isPromisesArray = isArray(iterable),
                keys = isPromisesArray?
                    getArrayKeys(iterable) :
                    getObjectKeys(iterable),
                rejectedPromises, fulfilledPromises,
                len = keys.length, i = 0, key, promise;

            if(!len) {
                return isPromisesArray? [] : {};
            }

            while(i < len) {
                key = keys[i++];
                promise = iterable[key];
                if(vow.isRejected(promise)) {
                    rejectedPromises || (rejectedPromises = isPromisesArray? [] : {});
                    isPromisesArray?
                        rejectedPromises.push(promise.valueOf()) :
                        rejectedPromises[key] = promise.valueOf();
                }
                else if(!rejectedPromises) {
                    (fulfilledPromises || (fulfilledPromises = isPromisesArray? [] : {}))[key] = vow.valueOf(promise);
                }
            }

            if(rejectedPromises) {
                throw rejectedPromises;
            }

            return fulfilledPromises;
        });
    },

    /**
     * Returns a promise, that will be fulfilled if any of the items in `iterable` is fulfilled.
     * If all of the `iterable` items get rejected, the promise will be rejected (with the reason of the first rejected item).
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    any : function(iterable) {
        var defer = new Deferred(),
            len = iterable.length;

        if(!len) {
            defer.reject(Error());
            return defer.promise();
        }

        var i = 0, reason;
        vow._forEach(
            iterable,
            defer.resolve,
            function(e) {
                i || (reason = e);
                ++i === len && defer.reject(reason);
            },
            defer.notify,
            defer);

        return defer.promise();
    },

    /**
     * Returns a promise, that will be fulfilled only when any of the items in `iterable` is fulfilled.
     * If any of the `iterable` items gets rejected, the promise will be rejected.
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    anyResolved : function(iterable) {
        var defer = new Deferred(),
            len = iterable.length;

        if(!len) {
            defer.reject(Error());
            return defer.promise();
        }

        vow._forEach(
            iterable,
            defer.resolve,
            defer.reject,
            defer.notify,
            defer);

        return defer.promise();
    },

    /**
     * Static equivalent to `promise.delay`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Number} delay
     * @returns {vow:Promise}
     */
    delay : function(value, delay) {
        return vow.resolve(value).delay(delay);
    },

    /**
     * Static equivalent to `promise.timeout`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Number} timeout
     * @returns {vow:Promise}
     */
    timeout : function(value, timeout) {
        return vow.resolve(value).timeout(timeout);
    },

    _forEach : function(promises, onFulfilled, onRejected, onProgress, ctx, keys) {
        var len = keys? keys.length : promises.length,
            i = 0;

        while(i < len) {
            vow.when(
                promises[keys? keys[i] : i],
                wrapOnFulfilled(onFulfilled, i),
                onRejected,
                onProgress,
                ctx);
            ++i;
        }
    },

    TimedOutError : defineCustomErrorType('TimedOut')
};

var defineAsGlobal = true;
if(typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = vow;
    defineAsGlobal = false;
}

if(typeof modules === 'object' && isFunction(modules.define)) {
    modules.define('vow', function(provide) {
        provide(vow);
    });
    defineAsGlobal = false;
}

if(typeof define === 'function') {
    define(function(require, exports, module) {
        module.exports = vow;
    });
    defineAsGlobal = false;
}

defineAsGlobal && (global.vow = vow);

})(typeof window !== 'undefined'? window : global);

ym['vow'] = module.exports;
})();

ym.modules.define('vow', [], function (provide) { provide(ym.vow); });
ym.ns.vow = ym.vow;
var _backup_modules = this['modules'];
/**
 * Специальная прослойка, которая добавляет промисы, фоллбеки, динамические зависимости и алиасы в модульную систему.
 */
(function (global, modulesSystem, undef) {
    var WATCH_RESOLVING_TIMEOUT = 10; // sec.

    var IS_SYNC_STAGE = '__ym-modules-plus__is-sync-provide-stage__' + (+new Date()) + '__' + Math.random();

    var vow = ym.vow,

        slice = Array.prototype.slice,

        moduleByAliases = {},
        entries = {},

        keyNotFoundError = function (storage, key) {
            return new Error('The key "' + key + '" isn\'t declared in "' + storage + '" storage.');
        },
        dynamicDependNotFoundError = function (dynamicDepend) {
            return new Error('The dynamic depend "' + dynamicDepend + '" not found.');
        },
        noFallbackError = function (moduleName) {
            return new Error('Undefined module `' + moduleName + '` with no matching fallback.');
        },

        api;

    api = {
        entries: entries,

        IS_SYNC_STAGE: IS_SYNC_STAGE,

        fallbacks: new FallbackManager(),

        define: function (moduleName, depends, callback, context, onModuleProvideCallback) {
            var _this = this,
                storage, key, dynamicDepends;

            if (typeof depends == 'function' && typeof callback != 'function') {
                callback = depends;
                context = callback;
                depends = [];
            } else if (typeof moduleName == 'object') {
                var data = moduleName;

                moduleName = data.name;
                depends = data.depends;
                callback = data.declaration;
                context = data.context;
                dynamicDepends = data.dynamicDepends;
                onModuleProvideCallback = data.onModuleProvideCallback;

                storage = data.storage;
                key = data.key;
            }

            if (!entries.hasOwnProperty(moduleName)) {
                entries[moduleName] = { name: moduleName };
            }

            if (typeof depends == 'function') {
                depends = depends.call({ name: moduleName }, ym);
            }

            entries[moduleName].onModuleProvideCallback = onModuleProvideCallback;
            entries[moduleName].callback = callback;
            entries[moduleName].context = context;

            if (storage && key) {
                if (typeof key != 'string') {
                    for (var i = 0, l = key.length; i < l; i++) {
                        this._createKeyStorageRef(moduleName, key[i], storage);
                    }
                } else {
                    this._createKeyStorageRef(moduleName, key, storage);
                }

                entries[moduleName].key = key;
                entries[moduleName].storage = storage;
            }

            if (dynamicDepends) {
                entries[moduleName].dynamicDepends = dynamicDepends;
            }

            var onModuleLoad = api._createPatchedCallback(moduleName);

            if (depends != null) {
                var deps = [];
                for (var i = 0, l = depends.length; i < l; i++) {
                    deps[i] = this._processModuleName(depends[i]);
                }

                deps = this.fallbacks.addRetrievers(deps);
                // Often dependecy module is simply defined after its dependant so we don't need fallbacks anymore.
                this.nextTick(function () {
                    _this.fallbacks.removeRetrievers(modulesSystem.getDependencies(moduleName));
                });

                modulesSystem.define(moduleName, deps, onModuleLoad);
            } else {
                modulesSystem.define(moduleName, onModuleLoad);
            }

            return this;
        },

        require: function (moduleNames, successCallback, errorCallback, context, afterRetrieve) {
            var deferred = vow.defer(),
                promise = deferred.promise(),
                data = undef;

            if (arguments.length == 3 && typeof errorCallback != 'function') {
                context = errorCallback;
                errorCallback = null;
            } else if (!moduleNames.hasOwnProperty('length') && typeof moduleNames == 'object') {
                var obj = moduleNames;
                moduleNames = obj.modules;
                successCallback = obj.successCallback;
                errorCallback = obj.errorCallback;
                context = obj.context;
                if (obj.hasOwnProperty('data')) {
                    data = obj.data;
                }
            }

            moduleNames = (typeof moduleNames == 'string' || !moduleNames.hasOwnProperty('length')) ? [moduleNames] : moduleNames;

            var moduleNamesLength = moduleNames.length,
                result = this._processModuleList(moduleNames, data);

            moduleNames = result.list;

            if (ym.env.debug && !afterRetrieve) {
                this.watchResolving(moduleNames);
            }

            if (!result.error) {
                modulesSystem.require(moduleNames, function () {
                    // TODO потенцально опасный код.
                    // Для сокращения ожидания и кол-ва кода основной запрос и все динамические зависимости обрабатываются одним require.
                    // Чтобы модули из динамических зависимостей отрабатывали раньше, чем явно запрощенные модули, они добалявляются в начало массива.
                    // Если вдруг в модульной системе измениться порядок выполнения модулей, то что-то может сломаться.
                    var array = slice.call(arguments, arguments.length - moduleNamesLength);
                    deferred.resolve(array);
                    successCallback && successCallback.apply(context || global, array);
                }, function (err) {
                    if (!afterRetrieve) {
                        api.fallbacks.retrieve(moduleNames).then(function () {
                            deferred.resolve(api.require(moduleNames, successCallback, errorCallback, context, true));
                        }).fail(function (err) {
                            deferred.reject(err);
                        });
                    } else {
                        deferred.reject(err);
                    }
                });
            } else {
                deferred.reject(result.error);
            }

            if (errorCallback && !afterRetrieve) {
                promise.fail(function (err) {
                    errorCallback.call(context || global, err);
                });
            }

            return promise;
        },

        defineSync: function (moduleName, module) {
            // Этот метод пока не светится наружу.
            var storage, key;
            if (typeof moduleName == 'object') {
                var data = moduleName;
                module = data.module;
                storage = data.storage;
                key = data.key;
                moduleName = data.name;
            }

            if (api.isDefined(moduleName)) {
                var entry = entries[moduleName];
                entry.name = moduleName;
                entry.module = module;
                entry.callback = function (provide) {
                    provide(module);
                };
                entry.context = null;
            } else {
                entries[moduleName] = {
                    name: moduleName,
                    module: module
                };
                // Добавляем в модульную систему, чтобы можно было обращатьсяв зависимостях.
                api.define(moduleName, function (provide) {
                    provide(module);
                });
            }

            if (key && storage) {
                entries[moduleName].key = key;
                entries[moduleName].storage = storage;
                this._createKeyStorageRef(moduleName, key, storage);
            }
        },

        requireSync: function (name, data) {
            // Этот метод пока не светится наружу.
            var definition = this.getDefinition(name),
                result = null;
            if (definition) {
                result = definition.getModuleSync.apply(definition, slice.call(arguments, 1));
            }
            return result;
        },

        // This method is being called with context of a module.
        providePackage: function (provide) {
            var module = this,
                depsValues = Array.prototype.slice.call(arguments, 1);

            api.require(['system.mergeImports']).spread(function (mergeImports) {
                provide(mergeImports.joinImports(module.name, {}, module.deps, depsValues));
            });
        },

        getDefinition: function (name) {
            var result = null;
            name = this._processModuleName(name);

            if (entries.hasOwnProperty(name)) {
                result = new Definition(entries[name]);
            }

            return result;
        },

        getState: function (name) {
            return modulesSystem.getState(this._processModuleName(name));
        },

        isDefined: function (name) {
            return modulesSystem.isDefined(this._processModuleName(name));
        },

        setOptions: function (options) {
            return modulesSystem.setOptions(options);
        },

        flush: function () {
            return modulesSystem.flush();
        },

        nextTick: function (func) {
            return modulesSystem.nextTick(func);
        },

        watchResolving: function (moduleNames) {
            if (!(typeof console == 'object' && typeof console.warn == 'function')) {
                return;
            }

            var _this = this;

            if (typeof this._failCounter == 'undefined') {
                this._failCounter = 0;
            }

            setTimeout(function () {
                if (_this._failCounter == 0) {
                    setTimeout(function () {
                        _this._failCounter = 0;
                    }, 150);
                }

                for (var i = 0, l = moduleNames.length; i < l; i++) {
                    if (_this.getState(moduleNames[i]) != 'RESOLVED') {
                        _this._failCounter++;

                        if (_this._failCounter == 5) {
                            setTimeout(function () {
                                console.warn('Timeout: Totally ' + _this._failCounter +
                                    ' modules were required but not resolved within ' + WATCH_RESOLVING_TIMEOUT + ' sec.');
                            }, 100);
                        } else if (_this._failCounter > 5) {
                            continue;
                        }

                        console.warn('Timeout: Module `' + moduleNames[i] + '` was required ' +
                            'but is still ' + _this.getState(moduleNames[i]) + ' within ' + WATCH_RESOLVING_TIMEOUT + ' sec.');
                    }
                }
            }, WATCH_RESOLVING_TIMEOUT * 1000);
        },

        _createPatchedCallback: function (moduleName) {
            var _modulesPlus = this;

            return function () {
                var entry = entries[moduleName],
                    array = slice.call(arguments, 0),
                    callback = entry.callback,
                    context = entry.context;

                if (ym.env.debug) {
                    _modulesPlus.watchResolving([moduleName]);
                }

                array[0] = api._patchProvideFunction(array[0], moduleName);

                callback[ym.modules.IS_SYNC_STAGE] = true;

                callback && callback.apply(context || this, array);

                callback[ym.modules.IS_SYNC_STAGE] = false;
            };
        },

        _processModuleList: function (moduleList, data, ignoreCurrentNode) {
            var state = {
                list: []
            };

            for (var i = 0, l = moduleList.length; i < l; i++) {
                var moduleName = this._processModuleName(moduleList[i]);

                if (!moduleName) {
                    state.error = keyNotFoundError(moduleList[i].storage, moduleList[i].key);
                    break;
                }

                if (typeof data != 'undefined') {
                    var depends = modulesSystem.getDependencies(moduleName),
                        entry = entries[moduleName];
                    if (depends) {
                        var dependsResult = this._processModuleList(depends, data, true);
                        if (dependsResult.error) {
                            state.error = dependsResult.error;
                            break;
                        } else {
                            state.list = state.list.concat(dependsResult.list);
                        }
                    }

                    if (entry && entry.dynamicDepends) {
                        var dynamicDepends = [];
                        for (var key in entry.dynamicDepends) {
                            var depend = entry.dynamicDepends[key](data);
                            // TOOD обсудить в ревью
                            if (this._isDepend(depend)) {
                                dynamicDepends.push(depend);
                            }
                        }
                        var dependsResult = this._processModuleList(dynamicDepends, data);
                        if (dependsResult.error) {
                            state.error = dependsResult.error;
                            break;
                        } else {
                            state.list = state.list.concat(dependsResult.list);
                        }
                    }

                    if (this.fallbacks.isRetriever(moduleName)) {
                        this.fallbacks.addRetrieverData(moduleName, data);
                    }
                }

                if (!ignoreCurrentNode) {
                    state.list.push(moduleName);
                }
            }

            return state;
        },

        _createKeyStorageRef: function (moduleName, key, storage) {
            if (!moduleByAliases.hasOwnProperty(storage)) {
                moduleByAliases[storage] = {};
            }
            moduleByAliases[storage][key] = moduleName;
        },

        _processModuleName: function (moduleName) {
            if (typeof moduleName != 'string') {
                var storage = moduleName.storage;
                if (moduleByAliases.hasOwnProperty(storage)) {
                    moduleName = moduleByAliases[storage][moduleName.key] || null;
                } else {
                    moduleName = null;
                }
            }
            return moduleName;
        },

        _patchProvideFunction: function (provide, moduleName, checkIsSync) {
            var patchedProvide = function (module, error) {
                var entry = entries[moduleName];
                entry.module = module;

                var sync = entries[moduleName].callback[ym.modules.IS_SYNC_STAGE];

                entries[moduleName].sync = sync;
                if (entries[moduleName].onModuleProvideCallback) {
                    entries[moduleName].onModuleProvideCallback(sync);
                }

                provide(module, error);
                if (!error) {
                    delete entry.callback;
                    delete entry.context;
                }
            };
            patchedProvide.provide = patchedProvide;
            patchedProvide.dynamicDepends = {
                getValue: function (key, data) {
                    var deferred = vow.defer(),
                        entry = entries[moduleName];
                    if (entry.dynamicDepends && entry.dynamicDepends.hasOwnProperty(key)) {
                        var depend = entry.dynamicDepends[key](data);
                        deferred.resolve(
                            api._isDepend(depend) ?
                                api.getDefinition(depend).getModule(data) :
                                [depend]
                        );
                    } else {
                        deferred.reject(dynamicDependNotFoundError(key));
                    }
                    return deferred.promise();
                },

                getValueSync: function (key, data) {
                    var result = undef,
                        entry = entries[moduleName];
                    if (entry.dynamicDepends && entry.dynamicDepends.hasOwnProperty(key)) {
                        var depend = entry.dynamicDepends[key](data);
                        result = api._isDepend(depend) ?
                            api.getDefinition(depend).getModuleSync(data) :
                            depend;
                    }
                    return result;
                }
            };
            return patchedProvide;
        },

        _isDepend: function (depend) {
            return (typeof depend == 'string') || (depend && depend.key && depend.storage);
        }
    };

    function Definition (entry) {
        this.entry = entry;
    }

    Definition.prototype.getModuleKey = function () {
        return this.entry.key;
    };

    Definition.prototype.getModuleStorage = function () {
        return this.entry.storage;
    };

    Definition.prototype.getModuleName = function () {
        return this.entry.name;
    };

    Definition.prototype.getModuleSync = function (data) {
        if (arguments.length > 0) {
            var dynamicDepends = this.entry.dynamicDepends;
            for (var key in dynamicDepends) {
                var depend = dynamicDepends[key](data);
                if (api._isDepend(depend) && !api.getDefinition(depend).getModuleSync(data)) {
                    return undef;
                }
            }
        }
        return this.entry.module;
    };

    Definition.prototype.getModule = function (data) {
        var params = {
            modules: [
                this.entry.name
            ]
        };

        if (data) {
            params.data = data;
        }
        return api.require(params);
    };

    var RETRIEVER_PREFIX = '_retriever@';

    function FallbackManager () {
        this._fallbacks = [];
        this._retrieversData = {};
    }

    FallbackManager.prototype.register = function (filter, fallback) {
        if (!filter || filter == '*') {
            this._fallbacks.push({
                filter: filter || '*',
                func: fallback
            });
        } else {
            this._fallbacks.unshift({
                filter: filter,
                func: fallback
            });
        }
    };

    FallbackManager.prototype.retrieve = function (moduleNames) {
        if (typeof moduleNames == 'string') {
            moduleNames = [moduleNames];
        }

        var definePromises = [];

        for (var i = 0, l = moduleNames.length; i < l; i++) {
            var deferred = vow.defer(),
                moduleName = moduleNames[i];

            definePromises[i] = deferred.promise();

            if (api.isDefined(moduleName)) {
                deferred.resolve(true);

                continue;
            }

            var fallback = this.find(moduleName);

            if (!fallback) {
                deferred.reject(noFallbackError(moduleName));

                break;
            }

            deferred.resolve(fallback.func(moduleName, fallback.filter));
        }

        return vow.all(definePromises);
    };

    FallbackManager.prototype.find = function (moduleName) {
        for (var i = 0, l = this._fallbacks.length; i < l; i++) {
            var filter = this._fallbacks[i].filter;

            if (filter === '*') {
                return this._fallbacks[i];
            }

            if (typeof filter == 'function' && filter(moduleName)) {
                return this._fallbacks[i];
            }

            if (moduleName.match(filter)) {
                return this._fallbacks[i];
            }
        }

        return null;
    };

    FallbackManager.prototype.addRetrievers = function (moduleNames) {
        var res = [];

        for (var i = 0, l = moduleNames.length, moduleName, retrieverName; i < l; i++) {
            moduleName = moduleNames[i];

            if (api.isDefined(moduleName)) {
                res.push(moduleName);
                continue;
            }

            retrieverName = RETRIEVER_PREFIX + moduleName;
            res.push(retrieverName);

            if (!api.isDefined(retrieverName)) {
                this._defineRetriever(retrieverName);
            }
        }

        return res;
    };

    FallbackManager.prototype.removeRetrievers = function (deps) {
        for (var i = 0, l = deps.length, moduleName; i < l; i++) {
            if (this.isRetriever(deps[i]) && !this._retrieversData[deps[i]]) {
                moduleName = deps[i].replace(RETRIEVER_PREFIX, '');

                if (api.isDefined(moduleName)) {
                    deps[i] = moduleName;
                }
            }
        }
    };

    FallbackManager.prototype.isRetriever = function (moduleName) {
        return moduleName.indexOf(RETRIEVER_PREFIX) === 0;
    };

    FallbackManager.prototype.addRetrieverData = function (retrieverName, data) {
        if (!this._retrieversData[retrieverName]) {
            this._retrieversData[retrieverName] = [];
        }

        this._retrieversData[retrieverName].push(data);
    };

    FallbackManager.prototype._defineRetriever = function (retrieverName) {
        var _this = this;

        api.define(retrieverName, [], function (provide) {
            var moduleName = this.name.replace(RETRIEVER_PREFIX, '');

            _this.retrieve(moduleName)
                .then(function () { return _this._requireAfterRetrieve(moduleName); })
                .spread(provide)
                .fail(provide);
        });
    };

    FallbackManager.prototype._requireAfterRetrieve = function (moduleName) {
        var data = this._retrieversData[RETRIEVER_PREFIX + moduleName];

        if (!data) {
            return api.require(moduleName);
        }

        // Same module with different data could be required in parallel so we must handle all available data each time.
        var multipleRequires = [];

        for (var i = 0, l = data.length; i < l; i++) {
            multipleRequires.push(api.require({
                modules: [moduleName],
                data: data[i]
            }));
        }

        return vow.all(multipleRequires)
            .then(function (multiple) { return multiple[0]; });
    };

    global.modules = api;
})(this, ym.modules);

ym['modules'] = this['modules'];
this['modules'] = _backup_modules;
_backup_modules = undefined;
(function () {
    ym.ns.modules = {
        // Public API.
        require: function () { return ym.modules.require.apply(ym.modules, arguments); },
        isDefined: function () { return ym.modules.isDefined.apply(ym.modules, arguments); },
        requireSync: function () { return ym.modules.requireSync.apply(ym.modules, arguments); },
        define: function (name, depends, resolveCallback, context) {
            ym.modules.define(name, depends, resolveCallback, context, function (sync) {
                ym.count('modulesUsage', {
                    useCustomPrefix: true,
                    path: ['ym.modules.define', sync ? 'sync' : 'async', name].join('.'),
                    share: 1
                });
            });

            return ym.ns.modules;
        },

        // Private API.
        defineSync: deprecated('defineSync'),
        providePackage: deprecated('providePackage'),
        getDefinition: deprecated('getDefinition'),
        getState: deprecated('getState'),
        setOptions: deprecated('setOptions'),
        flush: deprecated('flush'),
        nextTick: deprecated('nextTick'),
        watchResolving: deprecated('watchResolving'),
        __modules: ym.modules
    };

    /**
     * Wraps ym.modules.fnName with a deprecation warning.
     * @ignore
     * @param {String} fnName
     */
    function deprecated (fnName) {
        return function () {
            console.warn('{NS}.modules.{FN} is not a public API and will be removed from {NS}.modules.'
                .replace(/\{NS\}/g, ym.project.namespace)
                .replace(/\{FN\}/g, fnName));

            var result = ym.modules[fnName].apply(ym.modules, arguments);
            return result === ym.modules ? ym.ns.modules : result;
        };
    }
})();

ym.count = (function () {
    // Store counts in queue until real counter is loaded.
    var queue = [];
    function enqueueCount () { queue.push(arguments); }

    // Add another level of indirection because Sandbox runs modules not with
    // ym itself, but with its clone.
    var countImplementation = null;
    var count = function () {
        (countImplementation || enqueueCount).apply(null, arguments);
    };

    // Replace queue counter with real implementation.
    count.provideImplementation = function (getImplementation) {
        if (countImplementation) {
            throw new Error('ym.count: implementation was already provided.');
        }
        countImplementation = getImplementation(queue);
    };

    return count;
})();



ym.project.initialMap = [

];


function setupAsync (env) {
    ym.env = env;
    for (var i = 0, l = ym.envCallbacks.length; i < l; i++) { ym.envCallbacks[i](env); }
ym.modules.define('util.extend', [
    'util.objectKeys'
], function (provide, objectKeys) {
    /**
     * Функция, копирующая свойства из одного или нескольких
     * JavaScript-объектов в другой JavaScript-объект.
     * @param {Object} target Целевой JavaScript-объект. Будет модифицирован
     * в результате работы функции.
     * @param {Object} source JavaScript-объект - источник. Все его свойства
     * будут скопированы. Источников может быть несколько (функция может иметь
     * произвольное число параметров), данные копируются справа налево (последний
     * аргумент имеет наивысший приоритет при копировании).
     * @name util.extend
     * @function
     * @static
     * @ignore
     *
     * @example
     * var options = ymaps.util.extend({
     *      prop1: 'a',
     *      prop2: 'b'
     * }, {
     *      prop2: 'c',
     *      prop3: 'd'
     * }, {
     *      prop3: 'e'
     * });
     * // Получим в итоге: {
     * //     prop1: 'a',
     * //     prop2: 'c',
     * //     prop3: 'e'
     * // }
     */

    function extend (target) {
        if (ym.env.debug) {
            if (!target) {
                throw new Error('util.extend: не передан параметр target');
            }
        }
        for (var i = 1, l = arguments.length; i < l; i++) {
            var arg = arguments[i];
            if (arg) {
                for (var prop in arg) {
                    if (arg.hasOwnProperty(prop)) {
                        target[prop] = arg[prop];
                    }
                }
            }
        }
        return target;
    }

    // этот вариант функции использует Object.keys для обхода обьектов
    function nativeExtend (target) {
        if (ym.env.debug) {
            if (!target) {
                throw new Error('util.extend: не передан параметр target');
            }
        }
        for (var i = 1, l = arguments.length; i < l; i++) {
            var arg = arguments[i];
            if (arg) {
                var keys = objectKeys(arg);
                for (var j = 0, k = keys.length; j < k; j++) {
                    target[keys[j]] = arg[keys[j]];
                }
            }
        }
        return target;
    }

    provide((typeof Object.keys == 'function') ? nativeExtend : extend);
});

ym.modules.define('util.objectKeys', [], function (provide) {
    var objectKeys = (typeof Object.keys == 'function') ? Object.keys : function (object) {
        var keys = [];
        for (var name in object) {
            if (object.hasOwnProperty(name)) {
                keys.push(name);
            }
        }
        return keys;
    };
    provide(function (object) {
        var typeofObject = typeof object,
            result;
        if (typeofObject == 'object' || typeofObject == 'function') {
            result = objectKeys(object);
        } else {
            throw new TypeError('Object.keys called on non-object');
        }
        return result;
    });
});

ym.modules.define('system.nextTick', [], function (provide) {
    var nextTick = (function () {
        var fns = [],
            enqueueFn = function (fn) {
                return fns.push(fn) === 1;
            },
            callFns = function () {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while (i < len) {
                    fnsToCall[i++]();
                }
            };

        if (typeof process === 'object' && process.nextTick) { // nodejs
            return function (fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if (global.setImmediate) { // ie10
            return function (fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if (global.postMessage && !global.opera) { // modern browsers
            var isPostMessageAsync = true;
            if (global.attachEvent) {
                var checkAsync = function () {
                    isPostMessageAsync = false;
                };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if (isPostMessageAsync) {
                var msg = '__ym' + (+new Date()),
                    onMessage = function (e) {
                        if (e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener ?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function (fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if ('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var head = doc.getElementsByTagName('head')[0],
                createScript = function () {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function () {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                    };
                    head.appendChild(script);
                };

            return function (fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function (fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })();

    provide(nextTick);
});

// TODO refactoring

ym.modules.define('system.mergeImports', [], function (provide) {
    function createNS (parentNs, path, data) {
        if (path) {
            var subObj = parentNs;
            path = path.split('.');
            var i = 0, l = path.length - 1, name;
            for (; i < l; i++) {
                if (path[i]) {//в начале может быть точка
                    subObj = subObj[name = path[i]] || (subObj[name] = {});
                }
            }
            subObj[path[l]] = data;
            return subObj[path[l]];
        } else {
            return data;
        }
    }

    function depsSort (a, b) {
        return a[2] - b[2];
    }

    function _isPackage (name) {
        return name.indexOf('package.') === 0;
    }

    function packageExtend (imports, ns) {
        for (var i in ns) {
            if (ns.hasOwnProperty(i)) {
                if (imports.hasOwnProperty(i)) {
                    //console.log('deep', i, typeof imports[i], typeof ns[i], ns[i] === imports[i]);
                    if (typeof imports[i] == 'object') {
                        packageExtend(imports[i], ns[i]);
                    }
                } else {
                    imports[i] = ns[i];
                }
            }
        }
    }

    function joinPackage (imports, deps, args) {
        var modules = [],
            checkList = {};
        for (var i = 0, l = deps.length; i < l; ++i) {
            var packageInfo = args[i].__package;
            if (!packageInfo) {
                createNS(imports, deps[i], args[i]);
                if (!checkList[deps[i]]) {
                    modules.push([deps[i], args[i]]);
                    checkList[deps[i]] = 1;
                }
            } else {
                for (var j = 0; j < packageInfo.length; ++j) {
                    if (!checkList[packageInfo[j][0]]) {
                        createNS(imports, packageInfo[j][0], packageInfo[j][1]);
                        modules.push([packageInfo[j][0], packageInfo[j][1]]);
                        checkList[packageInfo[j][0]] = 1;
                    }
                }
            }
        }
        imports.__package = modules;
        return imports;
    }

    function joinImports (thisName, imports, deps, args) {
        var ordered = [];
        var iAmPackage = _isPackage(thisName);
        if (iAmPackage) {
            return joinPackage(imports, deps, args);
        } else {
            for (var i = 0, l = deps.length; i < l; ++i) {
                ordered.push([deps[i], i, deps[i].length]);
            }
            ordered.sort(depsSort);
            for (var i = 0, l = ordered.length; i < l; ++i) {
                var order = ordered[i][1],
                    depName = deps[order];
                if (_isPackage(depName)) {
                    var packageInfo = args[order].__package;
                    for (var j = 0; j < packageInfo.length; ++j) {
                        createNS(imports, packageInfo[j][0], packageInfo[j][1]);
                    }
                    //console.error(thisName, 'loads', depName, '(its not good idea to load package from module)');
                    //depName = '';
                    //packageExtend(imports, args[order]);
                } else {
                    createNS(imports, depName, args[order]);
                }
            }
        }
        return imports;
    }

    provide({
        isPackage: _isPackage,
        joinImports: joinImports,
        createNS: createNS
    });
});

ym.modules.require(['system.ModuleLoader'], function (ModuleLoader) {
    (new ModuleLoader(ym.project.initialMap, ym.env.server)).defineAll();
});
(function (global) {
    var vow = ym.vow,
        configPromise = requireModulesFromConfig(),
        getParamsPromise = requireModulesFromParams(),
        domReady = document.readyState == 'complete',
        domDeferred = vow.defer(),
        domPromise = domReady ? vow.resolve() : domDeferred.promise(),
        mergeImportsPromise = null,
        onDomReady = function () {
            if (!domReady) {
                domReady = true;
                domDeferred.resolve();
            }
        };

    if (!domReady) {
        if (document.addEventListener) {
            document.addEventListener('DOMContentLoaded', onDomReady, false);
            window.addEventListener('load', onDomReady, false);
        } else if (document.attachEvent) {
            window.attachEvent('onload', onDomReady);
        }
    }

    ym.ns.ready = ready;

    function ready () {
        var params = {};

        if (arguments.length) {
            if (arguments.length == 1 && typeof arguments[0] == 'object' && !arguments[0].length) {
                // Call with hash of params.
                params = arguments[0];
            } else if (typeof arguments[0] != 'function') {
                // Call with modules list as first parameter.
                params.require = typeof arguments[0] == 'string' ? [arguments[0]] : arguments[0];
                params.successCallback = arguments[1];
                params.errorCallback = arguments[2] && typeof arguments[2] == 'function' ? arguments[2] : null;
                params.context = arguments[2] && typeof arguments[2] == 'object' ? arguments[2] : arguments[3];
            } else {
                // Call with regular signature: `successCallback[, errorCallback], context`.
                params.successCallback = arguments[0];
                params.errorCallback = arguments[1] && typeof arguments[1] == 'function' ? arguments[1] : null;
                params.context = arguments[1] && typeof arguments[1] == 'object' ? arguments[1] : arguments[2];
            }
        }

        var readyParamsPromise = params.require ? ym.modules.require(params.require) : vow.resolve();

        return vow.all([
            getMergeImports(),
            readyParamsPromise,
            getParamsPromise,
            configPromise,
            domPromise
        ]).spread(function (mergeImports, readyParamsModulesValues) {
            if (isNotEmpty(readyParamsModulesValues)) {
                mergeImports.joinImports('package.ymaps', ym.ns, params.require, readyParamsModulesValues);
            }

            if (params.successCallback) {
                // Workaround for swallowing exceptions in user code by promises.
                ym.modules.nextTick(function () {
                    params.successCallback.call(params.context, ym.ns);
                });
            }

            return ym.ns;
        }).fail(function (err) {
            if (params.errorCallback) {
                ym.modules.nextTick(function () {
                    params.errorCallback.call(params.context, err);
                });
            }

            return vow.reject(err);
        });
    }

    function getMergeImports () {
        if (!mergeImportsPromise) {
            mergeImportsPromise = ym.modules.require(['system.mergeImports']).spread(function (mergeImports) {
                return mergeImports;
            });
        }

        return mergeImportsPromise;
    }

    function requireModulesFromConfig () {
        var modulesNames = ym.project.preload;

        if (!isNotEmpty(modulesNames)) {
            return vow.resolve();
        }

        var promise = ym.modules.require(modulesNames);

        return vow.all([getMergeImports(), promise]).spread(function (mergeImports, modulesValues) {
            if (isNotEmpty(modulesValues)) {
                mergeImports.joinImports('package.ymaps', ym.ns, modulesNames, modulesValues);
            }
        });
    }

    function requireModulesFromParams () {
        var preload = ym.env.preload,
            modulesNames = preload.load && preload.load.length > 0 && preload.load.split(','),
            promise = modulesNames ? ym.modules.require(modulesNames) : vow.resolve();

        if (preload.onError) {
            promise.fail(function (err) {
                ym.modules.nextTick(function () {
                    callUserMethod(0, preload.onError, err);
                });
            });
        }

        return vow.all([getMergeImports(), promise, configPromise]).spread(function (mergeImports, modulesValues) {
            if (isNotEmpty(modulesValues)) {
                mergeImports.joinImports('package.ymaps', ym.ns, modulesNames, modulesValues);
            }

            if (preload.onLoad) {
                ym.modules.nextTick(function () {
                    callUserMethod(0, preload.onLoad, ym.ns);
                });
            }
        });
    }

    function callUserMethod (i, callback, value) {
        // Если функция обработчик описана ниже подключения АПИ, то в ситуации поднятия АПИ из кеша и синхронного
        // в результате этого выполнения кода, получаем ошибку при вызове несуществующей функции. Стабильно
        // повторяется в браузере Opera.
        var callbackData = getMethodByPath(global, callback);

        if (callbackData) {
            callbackData.method.call(callbackData.context, value);
        } else {
            window.setTimeout(function () {
                callUserMethod(++i, callback, value);
            }, Math.pow(2, i));
        }
    }

    function getMethodByPath (parentNs, path) {
        var subObj = parentNs;
        path = path.split('.');
        var i = 0, l = path.length - 1;
        for (; i < l; i++) {
            subObj = subObj[path[i]];
            if(!subObj){
                return undefined;
            }
        }
        return {
            method: subObj[path[l]],
            context: subObj
        };
    }

    function isNotEmpty (obj) {
        return obj && obj.length;
    }
})(this);
ym.modules.define('system.ModuleLoader', [
    'system.moduleLoader.createLoadFunction', 'system.moduleLoader.executeInSandbox', 'system.nextTick'
], function (provide, createLoadFunction, executeInSandbox, nextTick) {
    var STATES = {
        NOT_RESOLVED: 'NOT_RESOLVED',
        IN_RESOLVING: 'IN_RESOLVING',
        RESOLVED: 'RESOLVED'
    };

    function ModuleLoader (map, serverParams) {
        this._map = map;
        this._modulesInfo = this._parseMap(map);
        this._waitForNextTick = false;

        this._load = createLoadFunction(serverParams, this._modulesInfo.byName);
    }

    ModuleLoader.prototype.defineAll = function () {
        for (var i = 0, l = this._map.length; i < l; i++) {
            var name = this._map[i][0];

            if (!ym.modules.isDefined(name)) {
                ym.modules.define(this.buildDefinition(name));
            }
        }
    };

    ModuleLoader.prototype.buildDefinition = function (name) {
        var moduleLoader = this,
            info = this._modulesInfo.byName[name],
            deps = this._fetchDeps(info.name, info.deps),
            declaration = function (provide) {
                moduleLoader._queueLoad(this.name, {
                    context: this,
                    arguments: Array.prototype.slice.call(arguments, 0),
                    declaration: declaration
                });
            },
            definition = {
                name: info.name,
                depends: deps,
                declaration: declaration
            };

        if (info.key) {
            definition.key = info.key.split(',');
            definition.storage = info.storage;
        }

        if (info.dynamicDepends) {
            definition.dynamicDepends = info.dynamicDepends;
        }

        return definition;
    };

    ModuleLoader.prototype._parseMap = function (map) {
        var modulesInfo = { byName: {}, byAlias: {} };

        for (var i = 0, l = map.length; i < l; i++) {
            var row = map[i],
                info = {
                    name: row[0],
                    alias: row[1],
                    deps: row[2],
                    key: row[3],
                    storage: row[4],
                    dynamicDepends: row[5],
                    state: STATES['NOT_RESOLVED']
                };

            modulesInfo.byName[info.name] = info;
            modulesInfo.byAlias[info.alias] = info;
        }

        return modulesInfo;
    };

    ModuleLoader.prototype._fetchDeps = function (name, deps) {
        if (typeof deps == 'function') {
            return deps.call({ name: name }, ym);
        }

        var result = [];

        while (deps.length) {
            var dep = '';

            if (deps.charAt(0) == '=') {
                dep = deps.match(/=(.+?)=/)[1];
                result.push(dep);
                deps = deps.substring(dep.length + 2);
            } else {
                dep = deps.substring(0, 2);
                result.push(this._modulesInfo.byAlias[dep].name);
                deps = deps.substring(2);
            }
        }

        return result;
    };

    ModuleLoader.prototype._splitAliases = function (string) {
        var aliases = [];

        for (var i = 0, l = string.length; i < l; i += 2) {
            aliases.push(string.substr(i, 2));
        }

        return aliases;
    };

    ModuleLoader.prototype._queueLoad = function (name, scope) {
        var _this = this;

        if (!this._waitForNextTick) {
            this._waitForNextTick = true;

            nextTick(function () { _this._loadAll(); });
        }

        this._load(name, function (realDecl) {
            executeInSandbox(name, realDecl, scope);
        });
    };

    ModuleLoader.prototype._loadAll = function () {
        for (var i = 0, l = this._map.length; i < l; ++i) {
            var name = this._map[i][0],
                info = this._modulesInfo.byName[name];

            if (info.state == STATES['NOT_RESOLVED'] && ym.modules.getState(name) == STATES['IN_RESOLVING']) {
                info.state = STATES['IN_RESOLVING'];
                this._load(name);
            }
        }

        this._waitForNextTick = false;
    };

    provide(ModuleLoader);
});

ym.modules.define('system.moduleLoader.executeInSandbox', [
    'system.mergeImports', 'util.extend'
], function (provide, mergeImports, extend) {
    function executeInSandbox (name, realDecl, scope) {
        var sandbox = new Sandbox(name, scope.context, scope.arguments, scope.declaration),
            namespace = extend({}, ym, { modules: sandbox });

        realDecl.call(scope.context, namespace, namespace);

        sandbox.execute();
    }

    function Sandbox (name, context, args, declaration) {
        this._name = name;
        this._context = context;
        this._arguments = args;
        this._provides = [];
        this._declaration = declaration;
    }

    Sandbox.prototype.requireSync = function (moduleName) {
        return ym.modules.requireSync(moduleName);
    };

    Sandbox.prototype.defineSync = function (moduleName, module) {
        return ym.modules.defineSync(moduleName, module);
    };

    Sandbox.prototype.define = function (moduleName, deps, callback) {
        if (this._executed) {
            ym.modules.define.apply(ym.modules, arguments);
        } else if (typeof moduleName == 'object') {
            this._holdingFn = moduleName.declaration;
        } else if (typeof callback != 'function' && typeof deps == 'function') {
            this._holdingFn = deps;
        } else {
            this._holdingFn = callback;
        }
    };

    Sandbox.prototype.getDefinition = function (moduleName) {
        return ym.modules.getDefinition(moduleName);
    };

    Sandbox.prototype.isDefined = function (moduleName) {
        return ym.modules.isDefined(moduleName);
    };

    Sandbox.prototype.require = function (moduleList, callback, errorCallback, context) {
        if (arguments.length == 3 && typeof errorCallback != 'function') {
            return ym.modules.require(moduleList, callback, errorCallback);
        } else {
            return ym.modules.require(moduleList, callback, errorCallback, context);
        }
    };

    Sandbox.prototype.importImages = function (imgParams) {
        var prefix = [
            ym.env.server.url,
            ym.env.server.path.replace(/\/$/, ''),
            'images',
            this._name.replace(/\./g, '_') + '_'
        ].join('/');

        return {
            get: function (imageName) {
                // Some image names miss extensions.
                if (!/\.\w+$/.test(imageName)) {
                    imageName += imgParams[imageName].src.match(/\.\w+$/)[0];
                }

                return prefix + imageName;
            }
        };
    };

    Sandbox.prototype.execute = function () {
        this._executed = true;
        if (this._holdingFn) {
            this._declaration[ym.modules.IS_SYNC_STAGE] = true;

            this._holdingFn.apply(this._context, this._arguments);

            this._declaration[ym.modules.IS_SYNC_STAGE] = false;
        }
    };

    Sandbox.prototype.providePackage = ym.modules.providePackage;

    provide(executeInSandbox);
});

ym.modules.define('system.moduleLoader.createLoadFunction', ['system.nextTick'], function (provide, nextTick) {
    var ERROR_TIMEOUT = 30000;

    function createLoadFunction (serverData, modulesInfoByName) {
        var waitForNextTick = false,
            pending = [],
            pendingHash = {},
            pendingRequests = 0,
            loaderMarker = {},
            inrequire = {};

        function load (moduleName, callback, context) {
            if (loaderMarker[moduleName]) {
                //callback!
                callback.call(context, loaderMarker[moduleName], moduleName);
                return;
            }
            if (!waitForNextTick) {
                waitForNextTick = true;
                nextTick(onNextTick);
            }

            var hash = pendingHash[moduleName];
            if (hash) {
                hash.callback.push([callback, context]);
            } else {
                pendingHash[moduleName] = hash = {
                    moduleName: moduleName,
                    callback: [
                        [callback, context]
                    ]
                };

                pending.push(hash);
            }
        }

        function cleanUp (tag, jsonp) {
            window[jsonp] = undefined;
            // IE не дает делать delete объектов window
            try {
                window[jsonp] = null;
                delete window[jsonp];
            } catch (e) {
                //nop
            }
            window.setTimeout(function () {
                try {
                    tag && tag.parentNode && tag.parentNode.removeChild(tag);
                } catch (e) {
                    //nop
                }
            }, 0);
        }

        function createCombineJsonpCallback (aliases, jsonp, prefix, callback) {
            var errorTimeout = 0,
                completed = false,
                combineJsonpCallback = window[jsonp] = function (data) {
                    for (var i = 0, l = listeners.length; i < l; ++i) {
                        listeners[i][0](data);
                    }
                    listeners = null;
                },
                listeners = combineJsonpCallback.listeners = [
                    [function () {
                        completed = true;
                        clearTimeout(errorTimeout);
                        cleanUp(tag, jsonp);
                    }],
                    callback
                ];

            function check () {
                setTimeout(function () {
                    if (!completed) {
                        //trigger error
                        window.console && console.error('ymaps: script not loaded');
                        for (var i = 0, l = listeners.length; i < l; ++i) {
                            listeners[i][1] && listeners[i][1]();
                        }
                    }
                }, 60);
                /* нулевые таймауты могут врать */
            }

            var tag = document.createElement('script'),
                src = serverData.url + '/combine.js?load=' + aliases + '&callback_prefix=' + prefix,
                serverParams = serverData.params;

            if (serverParams) {
                if (serverParams.mode) {
                    src += '&mode=' + encodeURIComponent(serverParams.mode);
                }

                if (serverParams.namespace) {
                    src += '&namespace=' + encodeURIComponent(serverParams.namespace);
                }
            }

            // кодировку выставляем прежде src, дабы если файл берется из кеша, он брался не в кодировке страницы
            // подобная проблема наблюдалась во всех IE до восьмой
            tag.charset = 'utf-8';
            tag.async = true;

            tag.src = src;

            tag.onreadystatechange = function () {
                if (this.readyState == 'complete' || this.readyState == 'loaded') {
                    check();// дать скрипту время на выполнение
                }
            };

            tag.onload = tag.onerror = check;

            document.getElementsByTagName("head")[0].appendChild(tag);
            errorTimeout = setTimeout(callback[1], ERROR_TIMEOUT);
        }

        function request (aliases, prefix, callback, errorCallback) {
            var jsonp = prefix + '_' + aliases;
            if (!window[jsonp]) {
                createCombineJsonpCallback(
                    aliases,
                    jsonp,
                    prefix,
                    [callback, errorCallback]
                );
            } else {
                window[jsonp].listeners.push([callback, errorCallback]);
            }
        }


        function require (moduleList) {
            var modules = moduleList.join('');
            pendingRequests++;

            function executeSandbox (modules) {
                pendingRequests--;
                var moduleNamesList = [];
                for (var i = 0, l = modules.length; i < l; ++i) {
                    var rq = inrequire[modules[i][0]],
                        fn = modules[i][1];
                    if (rq) {
                        for (var j = 0, l2 = rq.callback.length; j < l2; ++j) {
                            rq.callback[j][0] && rq.callback[j][0].call(rq.callback[j][1], fn, rq.moduleName);
                        }
                        loaderMarker[rq.moduleName] = fn;
                        moduleNamesList.push(rq.moduleName);
                        delete pendingHash[rq.moduleName];
                        delete inrequire[modules[i][0]];
                    }
                }
            }

            function executeSandboxSafe (modules) {
                try {
                    executeSandbox(modules);
                } catch (e) {
                    onError();
                    setTimeout(function () {
                        throw e;
                    }, 1);
                }
            }

            function onError () {
                pendingRequests--;
                for (var i = 0, l = moduleList.length; i < l; ++i) {
                    var rq = inrequire[moduleList[i]];
                    if (rq) {
//                        loadWatcher.trigger(rq.moduleName, 'script or network error');
                        delete pendingHash[rq.moduleName];
                    }
                    delete inrequire[modules[i]];
                }
            }

            var prefix = ym.project.namespace + ym.project.jsonpPrefix + '_loader';

            if (moduleList.length == 1) {
                prefix += inrequire[moduleList[0]].moduleName;
            }

            request(modules, prefix, ym.env.debug ? executeSandbox : executeSandboxSafe, onError);
        }

        function onNextTick () {
            var LIMIT = ym.project.loadLimit,
                limit = Math.min(LIMIT, pending.length),
                i = 0,
                requestString = [];

            if (limit) {

                pending = pending.sort(function (a, b) {
                    return a.moduleName.localeCompare(b.moduleName);
                });

                for (i = 0; i < limit; i++) {
                    var alias = modulesInfoByName[pending[i].moduleName].alias;
                    inrequire[alias] = pending[i];
                    requestString.push(alias);
                }

                require(requestString);
            }

            if (pending.length && limit < pending.length) {
                pending = pending.slice(limit);
                nextTick(onNextTick);
            }
            else {
                pending = [];
                waitForNextTick = false;
            }
        }

        return load;
    }

    provide(createLoadFunction);
});
}


(function (global){

ym.modules.define('util.id', [], function (provide) {
    /**
     * @ignore
     * @name util.id
     */

    var id = new function () {
        /* Префикс, имеет три применения:
         * как префикс при генерации уникальных id, он призван давать уникальность при каждом запуске страницы
         * как имя свойства в котором хранятся id выданный объекту
         * как id для window
         */
        // http://jsperf.com/new-date-vs-date-now-vs-performance-now/6
        var prefix = ('id_' + (+(new Date())) + Math.round(Math.random() * 10000)).toString(),
            counterId = Math.round(Math.random() * 10000);

        function gen () {
            return (++counterId).toString();
        }

        /**
         * @ignore
         * Возвращает префикс, который используется как имя поля.
         * @return {String}
         */
        this.prefix = function () {
            return prefix;
        };

        /**
         * @ignore
         * Генерирует случайный ID. Возвращает результат в виде строки символов.
         * @returns {String} ID
         * @example
         * util.id.gen(); // -> '45654654654654'
         */
        this.gen = gen;

        /**
         * @ignore
         * Генерирует id и присваивает его свойству id переданного объекта. Если свойство id объекта существует,
         * то значение этого свойства не изменяется. Возвращает значение id в виде строки.
         * @param {Object} object Объект
         * @returns {String} ID
         */
        this.get = function (object) {
            return object === window ? prefix : object[prefix] || (object[prefix] = gen());
        };
    }();

    provide(id);
});

/**
 * @fileOverview
 * Query string library. Original code by Azat Razetdinov <razetdinov@ya.ru>.
 */
ym.modules.define('util.querystring', [], function (provide) {
    function isArray (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
    }

    provide({
        /**
         * Parse query string.
         *
         * @function
         * @ignore
         * @static
         * @name util.querystring.parse
         * @param {String} string Query string.
         * @param {String} [sep = '&amp;'] Param-param delimiter.
         * @param {String} [eq = '='] Name-value delimiter.
         * @param {Object} [options] Options.
         * @param {Function} [options.decodeURIComponent = decodeURIComponent] Unescape function.
         * @returns {Object} Query params.
         */
        parse: function (string, sep, eq, options) {
            sep = sep || '&';
            eq = eq || '=';
            options = options || {};
            var unescape = options.decodeURIComponent || decodeURIComponent,
                result = {},
                stringTokens = string.split(sep),
                param, name, value;

            for (var i = 0; i < stringTokens.length; ++i) {
                param = stringTokens[i].split(eq);
                name = unescape(param[0]);
                value = unescape(param.slice(1).join(eq));

                if (isArray(result[name])) {
                    result[name].push(value);
                } else if (result.hasOwnProperty(name)) {
                    result[name] = [result[name], value];
                } else {
                    result[name] = value;
                }
            }

            return result;
        },

        /**
         * Stringify query params.
         *
         * @ignore
         * @function
         * @static
         * @name util.queryString.stringify
         * @param {Object} params Query params.
         * @param {String} [sep = '&amp;'] Param-param delimiter.
         * @param {String} [eq = '='] Name-value delimiter.
         * @param {Object} [options] Options.
         * @param {Function} [options.encodeURIComponent = encodeURIComponent] Escape function.
         * @param {Function} [options.joinArrays = false] Concatenate array values in single parameter with ',' as delimiter.
         * @returns {String} Query string.
         */
        stringify: function (params, sep, eq, options) {
            sep = sep || '&';
            eq = eq || '=';
            options = options || {};
            var escape = options.encodeURIComponent || encodeURIComponent,
                result = [],
                name, value;

            for (name in params) {
                if (params.hasOwnProperty(name)) {
                    value = params[name];
                    if (isArray(value)) {
                        if (options.joinArrays) {
                            result.push(escape(name) + eq + escape(value.join(',')));
                        } else {
                            for (var i = 0; i < value.length; ++i) {
                                if (typeof value[i] != 'undefined') {
                                    result.push(escape(name) + eq + escape(value[i]));
                                }
                            }
                        }
                    } else {
                        if (typeof value != 'undefined') {
                            result.push(escape(name) + eq + escape(value));
                        }
                    }
                }
            }

            return result.join(sep);
        }
    });
});

ym.modules.define('util.script', [], function (provide) {
    var head = document.getElementsByTagName('head')[0];
    provide({
        create: function (url, charset) {
            var tag = document.createElement('script');
            // кодировку выставляем прежде src, дабы если файл берется из кеша, он брался не в кодировке страницы
            // эта подобная проблема наблюдалась во всех IE до текущей (восьмой)
            tag.charset = charset || 'utf-8';
            tag.src = url;
            // т.к. head на данный момент может быть не закрыт, добавляем через insertBefore.
            // так как файл может быть взят из кеша и выполнение начнется в тот же момент - timeout
            setTimeout(function () {
                head.insertBefore(tag, head.firstChild);
            }, 0);
            return tag;
        }
    });
});

ym.modules.define('util.jsonp', [
    'util.id',
    'util.querystring',
    'util.script'
], function (provide, utilId, querystring, utilScript) {
    var exceededError = { message: 'timeoutExceeded' },
        scriptError = { message: 'scriptError' },
        undefFunc = function () {},
        removeCallbackTimeouts = {};

    /**
     * @ignore
     * @function
     * @name util.jsonp Загружает скрипт по указанному url и подает ответ на вход функции-обработчика.
     * @param {Object} options Опции.
     * @param {String} options.url Адрес загрузки скрипта.
     * @param {String} [options.paramName = 'callback'] Название параметра для функции-обработчика.
     * @param {String} [options.padding] Имя пользовательской функции-обработчика (функция не создаётся автоматически).
     * @param {String} [options.paddingKey] Имя функции-обработчика (функция с указанным именем будет создана автоматически).
     * @param {Boolean} [options.noCache] Флаг, запрещающий кэширование скрипта. Добавляет случайное число
     * как параметр.
     * @param {Number} [options.timeout = 30000] Количество миллисекунд, в течение которых должен быть загружен скрипт.
     * Иначе удалять скрипт по истечении этого времени.
     * @param {Object} [options.requestParams] Параметры GET запроса.
     * @param {Boolean} [options.checkResponse = true] Флаг, определяющий нужно ли проверять ответ от сервера.
     * Если true, то при отсутствии поля error в ответе или равного null, promise будет зарезолвен
     * со значением res.response или res (если поле response отсутствует), где res - ответ сервера.
     * Иначе promise будет отклонен со значением res.error.
     * @param {String} [options.responseFieldName = 'response'] Имя поля ответа сервера, содержащее
     * данные.
     * @param {Function|Function[]} [options.postprocessUrl] Функция или массив функций для обработки URL перед отправкой запроса.
     * @returns {vow.Promise} Объект-promise.
     */
    function jsonp (options) {
        if (jsonp.handler) {
            return jsonp.handler(options, makeRequest);
        }

        return makeRequest(options);
    }

    function makeRequest (options) {
        var callbackName,
            tag,
            checkResponse = typeof options.checkResponse == 'undefined' ?
                true : options.checkResponse,
            responseFieldName = options.responseFieldName || 'response',
            requestParamsStr = options.requestParams ?
                '&' + querystring.stringify(options.requestParams, null, null, { joinArrays: true }) :
                '',
            deferred = ym.vow.defer(),
            promise = deferred.promise(),
            timeout = options.timeout || 30000,
            exceededTimeout = setTimeout(function () {
                deferred.reject(exceededError);
            }, timeout),
            clearRequest = function () {
                clear(tag, callbackName);
                clearTimeout(exceededTimeout);
                exceededTimeout = null;
            };

        if (!options.padding) {
            callbackName = options.paddingKey || (utilId.prefix() + utilId.gen());

            if (typeof window[callbackName] == 'function' && window[callbackName].promise) {
                return window[callbackName].promise;
            }

            cancelCallbackRemove(callbackName);
            window[callbackName] = function (res) {
                if (checkResponse) {
                    var error = !res || res.error ||
                        (res[responseFieldName] && res[responseFieldName].error);
                    if (error) {
                        deferred.reject(error);
                    } else {
                        deferred.resolve(res && res[responseFieldName] || res);
                    }
                } else {
                    deferred.resolve(res);
                }
            };

            window[callbackName].promise = promise;
        }

        var url = options.url +
            (/\?/.test(options.url) ? '&' : '?') + (options.paramName || 'callback') + '=' + (options.padding || callbackName) +
            (options.noCache ? '&_=' + Math.floor(Math.random() * 10000000) : '') + requestParamsStr;

        if (options.postprocessUrl) {
            if (typeof options.postprocessUrl == 'function') {
                url = options.postprocessUrl(url);
            } else {
                while (options.postprocessUrl.length) {
                    url = (options.postprocessUrl.shift())(url);
                }
            }
        }

        tag = utilScript.create(url);
        tag.onerror = function () {
            deferred.reject(scriptError);
        };

        promise.always(clearRequest);

        return promise;
    }

    /**
     * @ignore
     * Удаляет тэг script.
     */
    function clear (tag, callbackName) {
        if (callbackName) {
            removeCallback(callbackName);
        }
        // Удаляем тег по таймауту, чтобы не нарваться на синхронную обработку,
        // в странных разных браузерах (IE, Опера старая, Сафари, Хром, ФФ4 ),
        // когда содержимое запрошенного скрипта исполняется прямо на строчке head.appendChild(tag)
        // и соответственно, при попытке удалить тэг кидается исключение.
        setTimeout(function () {
            if (tag && tag.parentNode) {
                tag.parentNode.removeChild(tag);
            }
        }, 0);
    }

    /**
     * @ignore
     * удаляем функцию-обработчик
     */
    function removeCallback (callbackName) {
        // Удаляем jsonp-функцию
        window[callbackName] = undefFunc;
        // удаляем функцию через большой интервал, т.к. содержимое удаленного тэга script может попытаться обратится
        // к этой функции, для этого и делаем заглушку undefFunc
        removeCallbackTimeouts[callbackName] = setTimeout(function () {
            // IE не дает делать delete объектов window
            window[callbackName] = undefined;
            try {
                delete window[callbackName];
            } catch (e) {
            }
        }, 500);
    }

    function cancelCallbackRemove (callbackName) {
        if (removeCallbackTimeouts[callbackName]) {
            clearTimeout(removeCallbackTimeouts[callbackName]);
            removeCallbackTimeouts[callbackName] = null;
        }
    }

    provide(jsonp);
});

var promise = null;

function fallback (module, filter) {
    return promise || (promise = request(filter));
}

function request (filter) {
    filter = encodeURIComponent(filter);

    return ym.modules.require(['util.jsonp', 'util.querystring', 'util.extend', 'system.ModuleLoader'])
        .spread(function (jsonp, querystring, extend, ModuleLoader) {
            var server = ym.env.server,
                url = server.url + '/map.js',
                requestParams = {
                    filter: filter,
                    mode: server.params.mode,
                    version: server.version
                },
                paddingKey = 'ym_map_fallback';

            if (!server.params.short_jsonp_padding) {
                var cacheFactors = extend({ url: url }, requestParams),
                    cacheKey = querystring.stringify(cacheFactors, '_', '=', {
                        encodeURIComponent: function (str) { return str; }
                    });

                paddingKey += '_' + cacheKey.replace(/[:\/\.\?\&\\]/g, '_');
            }

            return jsonp({
                url: url,
                requestParams: requestParams,
                paddingKey: paddingKey
            }).then(function (map) {
                (new ModuleLoader(map, server)).defineAll();
            });
        });
}

ym.modules.fallbacks.register('*', fallback);

})(this);

(function (global) {
    if (!ym.project.namespace) {
        return;
    }

    if (typeof setupAsync == 'function') {
        ym.envCallbacks.push(function (env) {
            if (env.namespace !== false) {
                registerNamespace(global, env.namespace || ym.project.namespace, ym.ns);
            }
        });
    } else {
        registerNamespace(global, ym.project.namespace, ym.ns);
    }

    function registerNamespace (parentNs, path, data) {
        if (path) {
            var subObj = parentNs;
            path = path.split('.');
            var i = 0, l = path.length - 1, name;
            for (; i < l; i++) {
                if (path[i]) {
                    subObj = subObj[name = path[i]] || (subObj[name] = {});
                }
            }
            subObj[path[l]] = data;
            return subObj[path[l]];
        } else {
            return data;
        }
    }
})(this);

(function () {
    ym.envCallbacks.push(function (env) {
        if (env.server.url.charAt(0) == '/') {
            env.server.url = 'https:' + env.server.url;
        }

        addHostsProtocol(env.hosts);
    });

    function addHostsProtocol (obj) {
        for (var i in obj) {
            if (obj.hasOwnProperty(i)) {
                if (typeof obj[i] == 'string') {
                    if (obj[i].charAt(0) == '/') {
                        obj[i] = 'https:' + obj[i];
                    }
                } else {
                    addHostsProtocol(obj[i]);
                }
            }
        }
    }
})();


/**
 * @deprecated To be removed in 2.2.
 */
ym.ns.load = function (moduleList, callback, errorCallback, context) {
    var ready = ym.ns.ready;

    if (typeof moduleList == 'function') {
        if (callback) {
            return ready(['package.full'], /* callback = */moduleList, /* context = */callback);
        } else {
            return ready(['package.full'], /* callback = */moduleList);
        }
    }

    if (typeof moduleList == 'string') {
        moduleList = [moduleList];
    }

    return ready.apply(this, arguments);
};


ym.modules.define('system.browser', ['system.supports.graphics'], function (provide, graphics) {
    var browser = ym.env.browser;

    browser.documentMode = document.documentMode;
    /*
     *      Этот флаг, к сожалению, приходится постоянно использовать.
     */
    browser.isIE = (browser.name == 'MSIE' || browser.name == 'IEMobile');
    /*
     *      Отслеживаем старые версии IE, которые не поддерживают addEventListener и прочее.
     */
    browser.oldIE = (browser.name == 'MSIE' && browser.documentMode < 9);

    browser.isEdge = (browser.engine == 'Edge');

    browser.isChromium = browser.base && browser.base.toLocaleLowerCase() == 'chromium';

    browser.isSafari = browser.name == 'Safari';

    /*
     *      Настройка маппинга.
     */
    var isPointerBrowser = browser.engine == 'Edge' ||
        (browser.name == 'MSIE' && browser.documentMode >= 10 && browser.osVersion > 6.1) ||
        (browser.name == 'IEMobile' && browser.engineVersion >= 6);
    if (isPointerBrowser) {
        browser.eventMapper = 'pointer';
    } else if (browser.oldIE) {
        browser.eventMapper = 'oldIE';
    } else {
        browser.eventMapper = 'touchMouse';
    }

    /*
     *      В этой сборке Android Browser были был сломал transition - что-то с субпикселями.
     */
    browser.androidBrokenBuild = browser.name == 'AndroidBrowser' && browser.engineVersion == '534.30';

    var pixelRatio = window.devicePixelRatio || (screen.deviceXDPI && screen.deviceXDPI / 96) || 1;
    /*
     *      В IE11 сломалась canvas графика.
     */
    if (browser.oldIE) {
        browser.graphicsRenderEngine = 'vml';
    } else if (
        !graphics.hasCanvas() ||
        browser.name == 'MSIE' || browser.name == 'IEMobile' ||  // IE
        (browser.osFamily == 'Android' && browser.engine && browser.engine.toLocaleLowerCase() == 'gecko' || // Android FireFox
            (pixelRatio > 1 && pixelRatio < 2) // scale 125%
        )
    ) {
        browser.graphicsRenderEngine = 'svg';
    } else {
        browser.graphicsRenderEngine = 'canvas';
    }
    // browser.graphicsRenderEngine = 'svg'; //DEBUG

    /*
     *      Флаг поддержки transition для свойства transform.
     */
    browser.transformTransition =
        browser.osFamily == 'Android' ||
        browser.osFamily == 'iOS' ||
        (browser.name == 'MSIE' && browser.documentMode >= 10) ||
        //(browser.engine && browser.engine.toLocaleLowerCase() == 'gecko') || // FF > 41 не синхронизирует транзишены
        (browser.base && browser.base.toLocaleLowerCase() == 'chromium');

    /*
     Флаг, показывающий наличие в браузере нормально работающей поддержки CSS 3D transforms.
     В данный момент 3d-преобразования поддерживают webkit-ы, кроме андроидного 2.x (Bada поддерживает).
     *      FF (Gecko) научился 3d с 10-й версии (https://developer.mozilla.org/en/CSS/-moz-transform#Browser_compatibility)
     */
    browser.css3DTransform =
        (browser.engine == 'WebKit' && !(browser.osFamily == 'Android' && parseFloat(browser.osVersion) < 3)) ||
        (browser.engine == 'Gecko' && parseInt(browser.engineVersion.split('.')[0]) >= 10);

    browser.unsupported = (browser.name == 'OperaMini');

    browser.platform = browser.isMobile ? browser.osFamily : 'Desktop';

    provide(browser);
});

ym.modules.require(['system.browser']);


ym.modules.require(['system.logger'], function (logger) {
    ym.logger = logger;
});

ym.modules.define('system.logger', [], function (provide, project) {
    var moduleName = 'Yandex Maps JS API';

    function getMessage (moduleName, _arg) {
        var str = '';

        if (ym.env.debug) {
            str += '(' + moduleName + '): ';
        }

        str += _arg;//Array.prototype.join.call(_arg, ', ');
        return str;
    }

    provide({
        assert: function (condition, _arg) {
            if (!condition) {
                if (ym.env.debug) {
                    window.console && console.log(getMessage(moduleName, _arg));
                }
            }
        },

        log: function (_arg) {
            if (ym.env.debug) {
                window.console && console.log(getMessage(moduleName, _arg));
            }
        },

        notice: function (_arg) {
            if (ym.env.debug) {
                window.console && console.info(getMessage(moduleName, _arg));
            }
        },

        warning: function (_arg) {
            if (ym.env.debug) {
                window.console && console.warn(getMessage(moduleName, _arg));
            }
        },

        error: function (_arg) {
            window.console && console.error(getMessage(moduleName, _arg));
        },

        exception: function (moduleName, _arg) {
            throw new Error(getMessage(moduleName, _arg));
        }
    });
});


(function (global){

ym.modules.define('system.supports.csp', [], function (provide) {
    // Нельзя явно определить, поддерживается ли в браузере CSP.
    // Поэтому проверяем косвенно по наличию объекта Blob (для старых IE) и URL (для Opera 12).
    // TODO: убрать проверки после MAPSAPI-12836
    var browser = ym.env ? ym.env.browser : null;
    provide({
        isSupported: (typeof Blob != 'undefined') && (typeof URL != 'undefined'),
        isNonceSupported: browser && browser.name && browser.version ?
            !(browser.name.search('Safari') != -1 && parseInt(browser.version) < 10) :
            null
    });
});

ym.modules.define('system.supports.css', [], function (provide) {
    var testDiv,
        transitableProperties = {
            transform: 'transform',
            opacity: 'opacity',
            transitionTimingFunction: 'transition-timing-function',
            //TODO - нет никакой реакции на эти значения
            userSelect: 'user-select',
            height: 'height'
        },
        transitionPropertiesCache = {},
        cssPropertiesCache = {},
        browser = ym.env.browser,
        browserPrefix = browser.cssPrefix.toLowerCase();

    function checkCssProperty (name) {
        /* eslint-disable no-return-assign */
        return typeof cssPropertiesCache[name] == 'undefined' ?
            cssPropertiesCache[name] = checkDivStyle(name) :
            cssPropertiesCache[name];
    }

    function checkDivStyle (name) {
        return checkTestDiv(name) || //names
               checkTestDiv(browserPrefix + upperCaseFirst(name)) || //mozNames
               checkTestDiv(browser.cssPrefix + upperCaseFirst(name)); //MozNames
    }

    function checkTestDiv (name) {
        return typeof getTestDiv().style[name] != 'undefined' ? name : null;
    }

    function getTestDiv () {
        return testDiv || (testDiv = document.createElement('div'));
    }

    function upperCaseFirst (str) {
        return str ? str.substr(0, 1).toUpperCase() + str.substr(1) : str;
    }

    function checkCssTransitionProperty (name) {
        var cssProperty = checkCssProperty(name);
        if (cssProperty && cssProperty != name) {
            cssProperty = '-' + browserPrefix + '-' + name;
        }
        return cssProperty;
    }

    function checkTransitionAvailability (name) {
        if (transitableProperties[name] && checkCssProperty('transitionProperty')) {
            return checkCssTransitionProperty(transitableProperties[name]);
        }
        return null;
    }

    provide({
        checkProperty: checkCssProperty,

        checkTransitionProperty: function (name) {
            /* eslint-disable no-return-assign */
            return typeof transitionPropertiesCache[name] == 'undefined' ?
                transitionPropertiesCache[name] = checkTransitionAvailability(name) :
                transitionPropertiesCache[name];
        },

        checkTransitionAvailability: checkTransitionAvailability
    });
});

ym.modules.define('system.supports.graphics', [], function (provide) {
    var webGlContextSettings = {
            failIfMajorPerformanceCaveat: true, // just to be sure
            antialias: false                    // Firefox does not like offscreen canvas with AA
        },
        tests = {};

    function isWebGlCapable () {
        // Test system support
        if (window.WebGLRenderingContext) {
            // test blacklists
            /* eslint-disable quote-props */
            var browser = ym.env.browser,
                webglBrowserBlacklist = {
                    'Samsung Internet': true, // unstable
                    'AndroidBrowser': true    // unstable
                },
                isOldAndroid = browser.engine == 'Webkit' && (+browser.engineVersion < +537); // unstable

            if (isOldAndroid || webglBrowserBlacklist[browser.name]) {
                return false;
            }
        } else {
            // No system support
            return false;
        }
        return true;
    }

    function detectWebGl () {
        if (!isWebGlCapable()) {
            return null;
        }

        var contextName;
        try {
            var canvas = document.createElement('canvas'),
                context = canvas.getContext(contextName = 'webgl', webGlContextSettings);
            if (!context) {
                context = canvas.getContext(contextName = 'experimental-webgl', webGlContextSettings); // IE
                if (!context) {
                    contextName = null;
                }
            }
        } catch (e) {
            // suppress warnings at FF
            contextName = null;
        }

        return contextName ? { contextName: contextName } : null;
    }

    // Test globalCompositeOperation to work properly
    function testCanvas (sandbox, ctx) {
        sandbox.width = 226;
        sandbox.height = 256;

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 150, 150);

        ctx.globalCompositeOperation = 'xor';

        ctx.fillStyle = '#f00';
        ctx.fillRect(10, 10, 100, 100);

        ctx.fillStyle = '#0f0';
        ctx.fillRect(50, 50, 100, 100);

        var data = ctx.getImageData(49, 49, 2, 2),
            test = [];
        for (var i = 0; i < 16; i++) {
            test.push(data.data[i]);
        }
        return test.join('x') == '0x0x0x0x0x0x0x0x0x0x0x0x0x255x0x255';
    }

    provide({
        hasSvg: function () {
            if (!('svg' in tests)) {
                tests.svg = document.implementation &&
                    document.implementation.hasFeature('http://www.w3.org/TR/SVG11/feature#BasicStructure', '1.1');
            }
            return tests.svg;
        },

        hasCanvas: function () {
            if (!('canvas' in tests)) {
                var sandbox = document.createElement('canvas'),
                    canvas = ('getContext' in sandbox) ? sandbox.getContext('2d') : null;
                tests.canvas = canvas ? testCanvas(sandbox, canvas) : false;
            }
            return tests.canvas;
        },

        hasWebGl: function () {
            if (!('webgl' in tests)) {
                tests.webgl = detectWebGl();
            }
            return tests.webgl;
        },

        hasVml: function () {
            if (!('vml' in tests)) {
                var supported = false,
                    topElement = document.createElement('div'),
                    testElement;
                topElement.innerHTML = '<v:shape id="yamaps_testVML"  adj="1" />';
                testElement = topElement.firstChild;
                if (testElement && testElement.style) {
                    testElement.style.behavior = 'url(#default#VML)';
                    supported = testElement ? typeof testElement.adj == 'object' : true;
                    topElement.removeChild(testElement);
                }
                tests.vml = supported;
            }
            return tests.vml;
        },

        redetect: function () {
            tests = {};
        },

        getWebGlContextName: function () {
            return tests.webgl && tests.webgl.contextName;
        }
    });
});

ym.modules.require(['system.supports.css', 'system.supports.graphics', 'system.supports.csp'], function (cssSupports, graphicsSupports, cspSupports) {
    if (ym.env.server.params.csp && !cspSupports.isSupported) {
        console && console.warn('CSP is not suported in this browser');
    }
    ym.supports = {
        css: cssSupports,
        graphics: graphicsSupports,
        printPatchNeeded: !cssSupports.checkProperty('printColorAdjust'),
        csp: cspSupports
    };
});


})(this);

setupAsync({"server":{"url":"//api-maps.yandex.ru/2.1.60","path":"build/debug","params":{"mode":"debug","onload":"angularComponentRef.getYandex","csp":null}},"preload":{"load":"package.full","onLoad":"angularComponentRef.getYandex"},"mode":"debug","debug":true,"enterprise":false,"key":undefined,"apikey":undefined,"browser":{"name":"Chrome","version":"64.0.3282.119","base":"Chromium","engine":"WebKit","engineVersion":"537.36","osName":"Windows 7","osFamily":"Windows","osVersion":"6.1","isMobile":false,"isTablet":false,"multiTouch":false,"cssPrefix":"Webkit"},"lang":"ru_RU","languageCode":"ru","countryCode":"RU","hosts":{"api":{"main":"https://api-maps.yandex.ru/","ua":"https://yandex.ru/legal/maps_termsofuse/?lang={{lang}}","maps":"https://yandex.ru/maps/","statCounter":"https://yandex.ru/clck/","services":{"coverage":"https://api-maps.yandex.ru/services/coverage/","geocode":"https://geocode-maps.yandex.ru/","geoxml":"https://api-maps.yandex.ru/services/geoxml/","inception":"https://api-maps.yandex.ru/services/inception/","panoramaLocate":"https://api-maps.yandex.ru/services/panoramas/","search":"https://api-maps.yandex.ru/services/search/","suggest":"https://suggest-maps.yandex.ru/","regions":"https://api-maps.yandex.ru/services/regions/","route":"https://api-maps.yandex.ru/services/route/"}},"layers":{"map":"https://vec0%d.maps.yandex.net/tiles?l=map&%c&%l","sat":"https://sat0%d.maps.yandex.net/tiles?l=sat&%c&%l","skl":"https://vec0%d.maps.yandex.net/tiles?l=skl&%c&%l","stv":"https://0%d.srdr.maps.yandex.net/?l=stv&%c&v=%v&%l&action=render","sta":"https://lrs.maps.yandex.net/tiles?l=sta&%c&tm=%v&%l","staHotspot":"https://lrs.maps.yandex.net/tiles?l=stj&%c&tm=%v&%l","staHotspotKey":"%c&l=stj&tm=%v"},"metro_RU":"https://metro.yandex.ru/","metro_UA":"https://metro.yandex.ua/","metro_BY":"https://metro.yandex.by/","metro_US":"https://metro.yandex.com/","traffic":"https://jgo.maps.yandex.net/","trafficArchive":"https://jft.maps.yandex.net/"},"layers":{"map":{"version":"18.02.01-0","scaled":true,"hotspotZoomRange":[13,23]},"sat":{"version":"3.365.0"},"skl":{"version":"18.02.01-0","scaled":true,"hotspotZoomRange":[13,23]},"trf":{"version":"1517496047","scaled":true},"sta":{"version":"0.28.1-0.1.3.2-0.2018.01.25.14.00.2.29.11-1.stable"},"stv":{"version":"3.88.0"}},"geolocation":{"longitude":30.315868,"latitude":59.939095,"isHighAccuracy":false,"span":{"longitude":0.525488,"latitude":0.34647}},"token":"1e15be527cef54b192301b0ec01a6449","sign":(function(r){function t(e){if(n[e])return n[e].exports;var o=n[e]={exports:{},id:e,loaded:!1};return r[e].call(o.exports,o,o.exports,t),o.loaded=!0,o.exports}var n={};return t.m=r,t.c=n,t.p="",t(0)})([function(r,t,n){"use strict";function e(){for(var r=["3","3","f","9","1","7","7","9","1","0","b","8","3","e","a","a","9","c","c","2","1","a","e","d","c","2","1","8","d","e","9","0","0","e","c","3","5","c","f","b"],t=[[SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_UNKNOWN+8,(function(){var e=document.createElement("a");return e.href="http://man.net/?Z=Eow&F=0Rg",e.search.length})()+16],[Range.START_TO_START+17,CSSRule.STYLE_RULE+26],[(function(){var e=document.createElement("a");return e.href="mailto:vogu@foda.co.uk",e.protocol.length})()-1,document.createDocumentFragment().nodeName.length+15]],n=0;n<t.length;n++){var e=t[n][0],o=t[n][1],i=r[e];r[e]=r[o],r[o]=i}return r.join("")}var o,i=n(1),u=n(2);r.exports=function(r){return o||(o=i(e())),i(u(r),o)}},function(r,t){"use strict";r.exports=function(r,t){t=t||0;for(var n=0;n<r.length;n++)t+=(t<<1)+(t<<4)+(t<<7)+(t<<8)+(t<<24),t^=r.charCodeAt(n);return t>>>0}},function(r,t){"use strict";r.exports=function(r){r=r.replace(/^.*\/\//,"");var t=r.indexOf("?");if(-1===t)return r;var n=t+1,e=r.indexOf("#",n);-1===e&&(e=r.length);var o=r.substring(n,e).split("&",1e3);return r.substring(0,n)+o.sort().join("&")+r.substring(e)}}]),"distribution":{},"version":"2.1.60","majorVersion":"2.1","cssPrefix":"ymaps-2-1-60-","coordinatesOrder":"latlong"})
})(this);
