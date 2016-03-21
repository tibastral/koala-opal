(function(undefined) {
  if (typeof(this.Opal) !== 'undefined') {
    console.warn('Opal already loaded. Loading twice can cause troubles, please fix your setup.');
    return this.Opal;
  }

  var nil;

  // The actual class for BasicObject
  var BasicObject;

  // The actual Object class.
  // The leading underscore is to avoid confusion with window.Object()
  var _Object;

  // The actual Module class
  var Module;

  // The actual Class class
  var Class;

  // Constructor for instances of BasicObject
  function BasicObject_alloc(){}

  // Constructor for instances of Object
  function Object_alloc(){}

  // Constructor for instances of Class
  function Class_alloc(){}

  // Constructor for instances of Module
  function Module_alloc(){}

  // Constructor for instances of NilClass (nil)
  function NilClass_alloc(){}

  // The Opal object that is exposed globally
  var Opal = this.Opal = {};

  // All bridged classes - keep track to donate methods from Object
  var bridges = {};

  // TopScope is used for inheriting constants from the top scope
  var TopScope = function(){};

  // Opal just acts as the top scope
  TopScope.prototype = Opal;

  // To inherit scopes
  Opal.constructor = TopScope;

  // List top scope constants
  Opal.constants = [];

  // This is a useful reference to global object inside ruby files
  Opal.global = this;

  // Minify common function calls
  var $hasOwn = Opal.hasOwnProperty;
  var $slice  = Opal.slice = Array.prototype.slice;

  // Nil object id is always 4
  var nil_id = 4;

  // Generates even sequential numbers greater than 4
  // (nil_id) to serve as unique ids for ruby objects
  var unique_id = nil_id;

  // Return next unique id
  Opal.uid = function() {
    unique_id += 2;
    return unique_id;
  };

  // Table holds all class variables
  Opal.cvars = {};

  // Globals table
  Opal.gvars = {};

  // Exit function, this should be replaced by platform specific implementation
  // (See nodejs and phantom for examples)
  Opal.exit = function(status) { if (Opal.gvars.DEBUG) console.log('Exited with status '+status); };

  // keeps track of exceptions for $!
  Opal.exceptions = [];

  // Get a constant on the given scope. Every class and module in Opal has a
  // scope used to store, and inherit, constants. For example, the top level
  // `Object` in ruby has a scope accessible as `Opal.Object.$$scope`.
  //
  // To get the `Array` class using this scope, you could use:
  //
  //     Opal.Object.$$scope.get("Array")
  //
  // If a constant with the given name cannot be found, then a dispatch to the
  // class/module's `#const_method` is called, which by default will raise an
  // error.
  //
  // @param [String] name the name of the constant to lookup
  // @return [RubyObject]
  //
  Opal.get = function(name) {
    var constant = this[name];

    if (constant == null) {
      return this.base.$const_get(name);
    }

    return constant;
  };

  // Create a new constants scope for the given class with the given
  // base. Constants are looked up through their parents, so the base
  // scope will be the outer scope of the new klass.
  //
  // @param base_scope [$$scope] the scope in which the new scope should be created
  // @param klass      [Class]
  // @param id         [String, null] the name of the newly created scope
  //
  Opal.create_scope = function(base_scope, klass, id) {
    var const_alloc = function() {};
    var const_scope = const_alloc.prototype = new base_scope.constructor();

    klass.$$scope       = const_scope;
    klass.$$base_module = base_scope.base;

    const_scope.base        = klass;
    const_scope.constructor = const_alloc;
    const_scope.constants   = [];

    if (id) {
      Opal.cdecl(base_scope, id, klass);
      const_alloc.displayName = id+"_scope_alloc";
    }
  }

  // A `class Foo; end` expression in ruby is compiled to call this runtime
  // method which either returns an existing class of the given name, or creates
  // a new class in the given `base` scope.
  //
  // If a constant with the given name exists, then we check to make sure that
  // it is a class and also that the superclasses match. If either of these
  // fail, then we raise a `TypeError`. Note, superklass may be null if one was
  // not specified in the ruby code.
  //
  // We pass a constructor to this method of the form `function ClassName() {}`
  // simply so that classes show up with nicely formatted names inside debuggers
  // in the web browser (or node/sprockets).
  //
  // The `base` is the current `self` value where the class is being created
  // from. We use this to get the scope for where the class should be created.
  // If `base` is an object (not a class/module), we simple get its class and
  // use that as the base instead.
  //
  // @param base        [Object] where the class is being created
  // @param superklass  [Class,null] superclass of the new class (may be null)
  // @param id          [String] the name of the class to be created
  // @param constructor [Function] function to use as constructor
  //
  // @return new [Class]  or existing ruby class
  //
  Opal.klass = function(base, superklass, id, constructor) {
    var klass, bridged, alloc;

    // If base is an object, use its class
    if (!base.$$is_class && !base.$$is_module) {
      base = base.$$class;
    }

    // If the superclass is a function then we're bridging a native JS class
    if (typeof(superklass) === 'function') {
      bridged = superklass;
      superklass = _Object;
    }

    // Try to find the class in the current scope
    klass = base.$$scope[id];

    // If the class exists in the scope, then we must use that
    if (klass && klass.$$orig_scope === base.$$scope) {
      // Make sure the existing constant is a class, or raise error
      if (!klass.$$is_class) {
        throw Opal.TypeError.$new(id + " is not a class");
      }

      // Make sure existing class has same superclass
      if (superklass && klass.$$super !== superklass) {
        throw Opal.TypeError.$new("superclass mismatch for class " + id);
      }

      return klass;
    }

    // Class doesnt exist, create a new one with given superclass...

    // Not specifying a superclass means we can assume it to be Object
    if (superklass == null) {
      superklass = _Object;
    }

    // If bridged the JS class will also be the alloc function
    alloc = bridged || boot_class_alloc(id, constructor, superklass);

    // Create the class object (instance of Class)
    klass = boot_class_object(id, superklass, alloc);

    // Name the class
    klass.$$name = id;
    klass.displayName = id;

    // Mark the object as a class
    klass.$$is_class = true;

    // Every class gets its own constant scope, inherited from current scope
    Opal.create_scope(base.$$scope, klass, id);

    // Name new class directly onto current scope (Opal.Foo.Baz = klass)
    base[id] = base.$$scope[id] = klass;

    if (bridged) {
      Opal.bridge(klass, alloc);
    }
    else {
      // Copy all parent constants to child, unless parent is Object
      if (superklass !== _Object && superklass !== BasicObject) {
        donate_constants(superklass, klass);
      }

      // Call .inherited() hook with new class on the superclass
      if (superklass.$inherited) {
        superklass.$inherited(klass);
      }
    }

    return klass;
  };

  // Create generic class with given superclass.
  Opal.boot_class = function(superklass, constructor) {
    var alloc = boot_class_alloc(null, constructor, superklass)

    return boot_class_object(null, superklass, alloc);
  }

  // The class object itself (as in `Class.new`)
  //
  // @param superklass [(Opal) Class] Another class object (as in `Class.new`)
  // @param alloc      [constructor]  The constructor that holds the prototype
  //                                  that will be used for instances of the
  //                                  newly constructed class.
  function boot_class_object(id, superklass, alloc) {
    // Grab the superclass prototype and use it to build an intermediary object
    // in the prototype chain.
    function Superclass_alloc_proxy() {};
    Superclass_alloc_proxy.prototype = superklass.constructor.prototype;
    function SingletonClass_alloc() {}
    SingletonClass_alloc.prototype = new Superclass_alloc_proxy();

    if (id) {
      SingletonClass_alloc.displayName = "SingletonClass_alloc("+id+")";
    }

    // The built class is the only instance of its singleton_class
    var klass = new SingletonClass_alloc();

    setup_module_or_class_object(klass, SingletonClass_alloc, superklass, alloc.prototype);

    // @property $$alloc This is the constructor of instances of the current
    //                   class. Its prototype will be used for method lookup
    klass.$$alloc = alloc;

    // @property $$proto.$$class Make available to instances a reference to the
    //                           class they belong to.
    klass.$$proto.$$class = klass;

    return klass;
  }

  // Adds common/required properties to a module or class object
  // (as in `Module.new` / `Class.new`)
  //
  // @param module      The module or class that needs to be prepared
  //
  // @param constructor The constructor of the module or class itself,
  //                    usually it's already assigned by using `new`. Some
  //                    ipothesis on why it's needed can be found below.
  //
  // @param superklass  The superclass of the class/module object, for modules
  //                    is `Module` (of `Module` in JS context)
  //
  // @param prototype   The prototype on which the class/module methods will
  //                    be stored.
  //
  function setup_module_or_class_object(module, constructor, superklass, prototype) {
    // @property $$id Each class is assigned a unique `id` that helps
    //                comparation and implementation of `#object_id`
    module.$$id = Opal.uid();

    // @property $$proto This is the prototype on which methods will be defined
    module.$$proto = prototype;

    // @property constructor keeps a ref to the constructor, but apparently the
    //                       constructor is already set on:
    //
    //                          `var module = new constructor` is called.
    //
    //                       Maybe there are some browsers not abiding (IE6?)
    module.constructor = constructor;

    if (superklass === Module) {
      // @property $$is_module Clearly mark this as a module
      module.$$is_module = true;
      module.$$class     = Module;
    }
    else {
      // @property $$is_class Clearly mark this as a class
      module.$$is_class = true;
      module.$$class    = Class;
    }

    // @property $$super the superclass, doesn't get changed by module inclusions
    module.$$super = superklass;

    // @property $$parent direct parent class or module
    //                    starts with the superclass, after module inclusion is
    //                    the last included module
    module.$$parent = superklass;

    // @property $$inc included modules
    module.$$inc = [];
  }

  // Define new module (or return existing module). The given `base` is basically
  // the current `self` value the `module` statement was defined in. If this is
  // a ruby module or class, then it is used, otherwise if the base is a ruby
  // object then that objects real ruby class is used (e.g. if the base is the
  // main object, then the top level `Object` class is used as the base).
  //
  // If a module of the given name is already defined in the base, then that
  // instance is just returned.
  //
  // If there is a class of the given name in the base, then an error is
  // generated instead (cannot have a class and module of same name in same base).
  //
  // Otherwise, a new module is created in the base with the given name, and that
  // new instance is returned back (to be referenced at runtime).
  //
  // @param  base [Module, Class] class or module this definition is inside
  // @param  id [String] the name of the new (or existing) module
  // @return [Module]
  //
  Opal.module = function(base, id) {
    var module;

    if (!base.$$is_class && !base.$$is_module) {
      base = base.$$class;
    }

    if ($hasOwn.call(base.$$scope, id)) {
      module = base.$$scope[id];

      if (!module.$$is_module && module !== _Object) {
        throw Opal.TypeError.$new(id + " is not a module");
      }
    }
    else {
      module = boot_module_object();

      // name module using base (e.g. Foo or Foo::Baz)
      module.$$name = id;

      // mark the object as a module
      module.$$is_module = true;

      // initialize dependency tracking
      module.$$dep = [];

      Opal.create_scope(base.$$scope, module, id);

      // Name new module directly onto current scope (Opal.Foo.Baz = module)
      base[id] = base.$$scope[id] = module;
    }

    return module;
  };

  // Internal function to create a new module instance. This simply sets up
  // the prototype hierarchy and method tables.
  //
  function boot_module_object() {
    var mtor = function() {};
    mtor.prototype = Module_alloc.prototype;

    function module_constructor() {}
    module_constructor.prototype = new mtor();

    var module = new module_constructor();
    var module_prototype = {};

    setup_module_or_class_object(module, module_constructor, Module, module_prototype);

    return module;
  }

  // Make `boot_module_object` available to the JS-API
  Opal.boot_module_object = boot_module_object;

  // Return the singleton class for the passed object.
  //
  // If the given object alredy has a singleton class, then it will be stored on
  // the object as the `$$meta` property. If this exists, then it is simply
  // returned back.
  //
  // Otherwise, a new singleton object for the class or object is created, set on
  // the object at `$$meta` for future use, and then returned.
  //
  // @param [RubyObject] object the ruby object
  // @return [RubyClass] the singleton class for object
  //
  Opal.get_singleton_class = function(object) {
    if (object.$$meta) {
      return object.$$meta;
    }

    if (object.$$is_class || object.$$is_module) {
      return build_class_singleton_class(object);
    }

    return build_object_singleton_class(object);
  };

  // Build the singleton class for an existing class.
  //
  // NOTE: Actually in MRI a class' singleton class inherits from its
  // superclass' singleton class which in turn inherits from Class.
  //
  // @param [RubyClass] klass
  // @return [RubyClass]
  //
  function build_class_singleton_class(klass) {
    var meta = new Opal.Class.$$alloc();

    meta.$$class = Opal.Class;
    meta.$$proto = klass.constructor.prototype;

    meta.$$is_singleton = true;
    meta.$$singleton_of = klass;
    meta.$$inc          = [];
    meta.$$scope        = klass.$$scope;

    return klass.$$meta = meta;
  }

  // Build the singleton class for a Ruby (non class) Object.
  //
  // @param [RubyObject] object
  // @return [RubyClass]
  //
  function build_object_singleton_class(object) {
    var orig_class = object.$$class,
        class_id   = "#<Class:#<" + orig_class.$$name + ":" + orig_class.$$id + ">>";

    var Singleton = function() {};
    var meta = Opal.boot_class(orig_class, Singleton);
    meta.$$name   = class_id;

    meta.$$proto  = object;
    meta.$$class  = orig_class.$$class;
    meta.$$scope  = orig_class.$$scope;
    meta.$$parent = orig_class;
    meta.$$is_singleton = true;
    meta.$$singleton_of = object;

    return object.$$meta = meta;
  }

  // Bridges a single method.
  function bridge_method(target, from, name, body) {
    var ancestors, i, ancestor, length;

    ancestors = target.$$bridge.$ancestors();

    // order important here, we have to check for method presence in
    // ancestors from the bridged class to the last ancestor
    for (i = 0, length = ancestors.length; i < length; i++) {
      ancestor = ancestors[i];

      if ($hasOwn.call(ancestor.$$proto, name) &&
          ancestor.$$proto[name] &&
          !ancestor.$$proto[name].$$donated &&
          !ancestor.$$proto[name].$$stub &&
          ancestor !== from) {
        break;
      }

      if (ancestor === from) {
        target.prototype[name] = body
        break;
      }
    }

  }

  // Bridges from *donator* to a *target*.
  function _bridge(target, donator) {
    var id, methods, method, i, bridged;

    if (typeof(target) === "function") {
      id      = donator.$__id__();
      methods = donator.$instance_methods();

      for (i = methods.length - 1; i >= 0; i--) {
        method = '$' + methods[i];

        bridge_method(target, donator, method, donator.$$proto[method]);
      }

      if (!bridges[id]) {
        bridges[id] = [];
      }

      bridges[id].push(target);
    }
    else {
      bridged = bridges[target.$__id__()];

      if (bridged) {
        for (i = bridged.length - 1; i >= 0; i--) {
          _bridge(bridged[i], donator);
        }

        bridges[donator.$__id__()] = bridged.slice();
      }
    }
  }

  // The actual inclusion of a module into a class.
  //
  // ## Class `$$parent` and `iclass`
  //
  // To handle `super` calls, every class has a `$$parent`. This parent is
  // used to resolve the next class for a super call. A normal class would
  // have this point to its superclass. However, if a class includes a module
  // then this would need to take into account the module. The module would
  // also have to then point its `$$parent` to the actual superclass. We
  // cannot modify modules like this, because it might be included in more
  // then one class. To fix this, we actually insert an `iclass` as the class'
  // `$$parent` which can then point to the superclass. The `iclass` acts as
  // a proxy to the actual module, so the `super` chain can then search it for
  // the required method.
  //
  // @param [RubyModule] module the module to include
  // @param [RubyClass] klass the target class to include module into
  // @return [null]
  //
  Opal.append_features = function(module, klass) {
    var iclass, donator, prototype, methods, id, i;

    // check if this module is already included in the class
    for (i = klass.$$inc.length - 1; i >= 0; i--) {
      if (klass.$$inc[i] === module) {
        return;
      }
    }

    klass.$$inc.push(module);
    module.$$dep.push(klass);
    _bridge(klass, module);

    // iclass
    iclass = {
      $$name:   module.$$name,
      $$proto:  module.$$proto,
      $$parent: klass.$$parent,
      $$module: module,
      $$iclass: true
    };

    klass.$$parent = iclass;

    donator   = module.$$proto;
    prototype = klass.$$proto;
    methods   = module.$instance_methods();

    for (i = methods.length - 1; i >= 0; i--) {
      id = '$' + methods[i];

      // if the target class already has a method of the same name defined
      // and that method was NOT donated, then it must be a method defined
      // by the class so we do not want to override it
      if ( prototype.hasOwnProperty(id) &&
          !prototype[id].$$donated &&
          !prototype[id].$$stub) {
        continue;
      }

      prototype[id] = donator[id];
      prototype[id].$$donated = module;
    }

    donate_constants(module, klass);
  };

  // Boot a base class (makes instances).
  function boot_class_alloc(id, constructor, superklass) {
    if (superklass) {
      var alloc_proxy = function() {};
      alloc_proxy.prototype  = superklass.$$proto || superklass.prototype;
      constructor.prototype = new alloc_proxy();
    }

    if (id) {
      constructor.displayName = id+'_alloc';
    }

    constructor.prototype.constructor = constructor;

    return constructor;
  }

  // Builds the class object for core classes:
  // - make the class object have a singleton class
  // - make the singleton class inherit from its parent singleton class
  //
  // @param id         [String]      the name of the class
  // @param alloc      [Function]    the constructor for the core class instances
  // @param superclass [Class alloc] the constructor of the superclass
  //
  function boot_core_class_object(id, alloc, superclass) {
    var superclass_constructor = function() {};
        superclass_constructor.prototype = superclass.prototype;

    var singleton_class = function() {};
        singleton_class.prototype = new superclass_constructor();

    singleton_class.displayName = "#<Class:"+id+">";

    // the singleton_class acts as the class object constructor
    var klass = new singleton_class();

    setup_module_or_class_object(klass, singleton_class, superclass, alloc.prototype);

    klass.$$alloc     = alloc;
    klass.$$name      = id;
    klass.displayName = id;

    // Give all instances a ref to their class
    alloc.prototype.$$class = klass;

    Opal[id] = klass;
    Opal.constants.push(id);

    return klass;
  }

  // For performance, some core Ruby classes are toll-free bridged to their
  // native JavaScript counterparts (e.g. a Ruby Array is a JavaScript Array).
  //
  // This method is used to setup a native constructor (e.g. Array), to have
  // its prototype act like a normal Ruby class. Firstly, a new Ruby class is
  // created using the native constructor so that its prototype is set as the
  // target for th new class. Note: all bridged classes are set to inherit
  // from Object.
  //
  // Example:
  //
  //    Opal.bridge(self, Function);
  //
  // @param [Class] klass the Ruby class to bridge
  // @param [Function] constructor native JavaScript constructor to use
  // @return [Class] returns the passed Ruby class
  //
  Opal.bridge = function(klass, constructor) {
    if (constructor.$$bridge) {
      throw Opal.ArgumentError.$new("already bridged");
    }

    Opal.stub_subscribers.push(constructor.prototype);

    constructor.prototype.$$class = klass;
    constructor.$$bridge          = klass;

    var ancestors = klass.$ancestors();

    // order important here, we have to bridge from the last ancestor to the
    // bridged class
    for (var i = ancestors.length - 1; i >= 0; i--) {
      _bridge(constructor, ancestors[i]);
    }

    for (var name in BasicObject_alloc.prototype) {
      var method = BasicObject_alloc.prototype[method];

      if (method && method.$$stub && !(name in constructor.prototype)) {
        constructor.prototype[name] = method;
      }
    }

    return klass;
  }


  // Constant assignment, see also `Opal.cdecl`
  //
  // @param base_module [Module, Class] the constant namespace
  // @param name        [String] the name of the constant
  // @param value       [Object] the value of the constant
  //
  // @example Assigning a namespaced constant
  //   self::FOO = 'bar'
  //
  // @example Assigning with Module#const_set
  //   Foo.const_set :BAR, 123
  //
  Opal.casgn = function(base_module, name, value) {
    function update(klass, name) {
      klass.$$name = name;

      for (name in klass.$$scope) {
        var value = klass.$$scope[name];

        if (value.$$name === nil && (value.$$is_class || value.$$is_module)) {
          update(value, name)
        }
      }
    }

    var scope = base_module.$$scope;

    if (value.$$is_class || value.$$is_module) {
      // Only checking _Object prevents setting a const on an anonymous class
      // that has a superclass that's not Object
      if (value.$$is_class || value.$$base_module === _Object) {
        value.$$base_module = base_module;
      }

      if (value.$$name === nil && value.$$base_module.$$name !== nil) {
        update(value, name);
      }
    }

    scope.constants.push(name);
    return scope[name] = value;
  };

  // constant decl
  Opal.cdecl = function(base_scope, name, value) {
    if ((value.$$is_class || value.$$is_module) && value.$$orig_scope == null) {
      value.$$name = name;
      value.$$orig_scope = base_scope;
      base_scope.constructor[name] = value;
    }

    base_scope.constants.push(name);
    return base_scope[name] = value;
  };

  // When a source module is included into the target module, we must also copy
  // its constants to the target.
  //
  function donate_constants(source_mod, target_mod) {
    var source_constants = source_mod.$$scope.constants,
        target_scope     = target_mod.$$scope,
        target_constants = target_scope.constants;

    for (var i = 0, length = source_constants.length; i < length; i++) {
      target_constants.push(source_constants[i]);
      target_scope[source_constants[i]] = source_mod.$$scope[source_constants[i]];
    }
  };

  // Donate methods for a module.
  function donate(module, jsid) {
    var included_in = module.$$dep,
        body = module.$$proto[jsid],
        i, length, includee, dest, current,
        klass_includees, j, jj, current_owner_index, module_index;

    if (!included_in) {
      return;
    }

    for (i = 0, length = included_in.length; i < length; i++) {
      includee = included_in[i];
      dest = includee.$$proto;
      current = dest[jsid];

      if (dest.hasOwnProperty(jsid) && !current.$$donated && !current.$$stub) {
        // target class has already defined the same method name - do nothing
      }
      else if (dest.hasOwnProperty(jsid) && !current.$$stub) {
        // target class includes another module that has defined this method
        klass_includees = includee.$$inc;

        for (j = 0, jj = klass_includees.length; j < jj; j++) {
          if (klass_includees[j] === current.$$donated) {
            current_owner_index = j;
          }
          if (klass_includees[j] === module) {
            module_index = j;
          }
        }

        // only redefine method on class if the module was included AFTER
        // the module which defined the current method body. Also make sure
        // a module can overwrite a method it defined before
        if (current_owner_index <= module_index) {
          dest[jsid] = body;
          dest[jsid].$$donated = module;
        }
      }
      else {
        // neither a class, or module included by class, has defined method
        dest[jsid] = body;
        dest[jsid].$$donated = module;
      }

      if (includee.$$dep) {
        donate(includee, jsid);
      }
    }
  };

  // Methods stubs are used to facilitate method_missing in opal. A stub is a
  // placeholder function which just calls `method_missing` on the receiver.
  // If no method with the given name is actually defined on an object, then it
  // is obvious to say that the stub will be called instead, and then in turn
  // method_missing will be called.
  //
  // When a file in ruby gets compiled to javascript, it includes a call to
  // this function which adds stubs for every method name in the compiled file.
  // It should then be safe to assume that method_missing will work for any
  // method call detected.
  //
  // Method stubs are added to the BasicObject prototype, which every other
  // ruby object inherits, so all objects should handle method missing. A stub
  // is only added if the given property name (method name) is not already
  // defined.
  //
  // Note: all ruby methods have a `$` prefix in javascript, so all stubs will
  // have this prefix as well (to make this method more performant).
  //
  //    Opal.add_stubs(["$foo", "$bar", "$baz="]);
  //
  // All stub functions will have a private `$$stub` property set to true so
  // that other internal methods can detect if a method is just a stub or not.
  // `Kernel#respond_to?` uses this property to detect a methods presence.
  //
  // @param [Array] stubs an array of method stubs to add
  //
  Opal.add_stubs = function(stubs) {
    var subscriber, subscribers = Opal.stub_subscribers,
        i, ilength = stubs.length,
        j, jlength = subscribers.length,
        method_name, stub;

    for (i = 0; i < ilength; i++) {
      method_name = stubs[i];
      stub = stub_for(method_name);

      for (j = 0; j < jlength; j++) {
        subscriber = subscribers[j];

        if (!(method_name in subscriber)) {
          subscriber[method_name] = stub;
        }
      }
    }
  };

  // Keep a list of prototypes that want method_missing stubs to be added.
  //
  // @default [Prototype List] BasicObject_alloc.prototype
  //
  Opal.stub_subscribers = [BasicObject_alloc.prototype];

  // Add a method_missing stub function to the given prototype for the
  // given name.
  //
  // @param [Prototype] prototype the target prototype
  // @param [String] stub stub name to add (e.g. "$foo")
  //
  Opal.add_stub_for = function(prototype, stub) {
    var method_missing_stub = stub_for(stub);
    prototype[stub] = method_missing_stub;
  }

  // Generate the method_missing stub for a given method name.
  //
  // @param [String] method_name The js-name of the method to stub (e.g. "$foo")
  //
  function stub_for(method_name) {
    function method_missing_stub() {
      // Copy any given block onto the method_missing dispatcher
      this.$method_missing.$$p = method_missing_stub.$$p;

      // Set block property to null ready for the next call (stop false-positives)
      method_missing_stub.$$p = null;

      // call method missing with correct args (remove '$' prefix on method name)
      return this.$method_missing.apply(this, [method_name.slice(1)].concat($slice.call(arguments)));
    }

    method_missing_stub.$$stub = true;

    return method_missing_stub;
  }

  // Arity count error dispatcher
  Opal.ac = function(actual, expected, object, meth) {
    var inspect = '';
    if (object.$$is_class || object.$$is_module) {
      inspect += object.$$name + '.';
    }
    else {
      inspect += object.$$class.$$name + '#';
    }
    inspect += meth;

    throw Opal.ArgumentError.$new('[' + inspect + '] wrong number of arguments(' + actual + ' for ' + expected + ')');
  };

  // The Array of ancestors for a given module/class
  Opal.ancestors = function(module_or_class) {
    var parent = module_or_class,
        result = [];

    while (parent) {
      result.push(parent);
      for (var i=0; i < parent.$$inc.length; i++) {
        result = result.concat(Opal.ancestors(parent.$$inc[i]));
      }

      parent = parent.$$is_class ? parent.$$super : null;
    }

    return result;
  }

  // Super dispatcher
  Opal.find_super_dispatcher = function(obj, jsid, current_func, iter, defs) {
    var dispatcher;

    if (defs) {
      if (obj.$$is_class || obj.$$is_module) {
        dispatcher = defs.$$super;
      }
      else {
        dispatcher = obj.$$class.$$proto;
      }
    }
    else {
      if (obj.$$is_class || obj.$$is_module) {
        dispatcher = obj.$$super;
      }
      else {
        dispatcher = find_obj_super_dispatcher(obj, jsid, current_func);
      }
    }

    dispatcher = dispatcher['$' + jsid];
    dispatcher.$$p = iter;

    return dispatcher;
  };

  // Iter dispatcher for super in a block
  Opal.find_iter_super_dispatcher = function(obj, jsid, current_func, iter, defs) {
    if (current_func.$$def) {
      return Opal.find_super_dispatcher(obj, current_func.$$jsid, current_func, iter, defs);
    }
    else {
      return Opal.find_super_dispatcher(obj, jsid, current_func, iter, defs);
    }
  };

  function find_obj_super_dispatcher(obj, jsid, current_func) {
    var klass = obj.$$meta || obj.$$class;
    jsid = '$' + jsid;

    while (klass) {
      if (klass.$$proto[jsid] === current_func) {
        // ok
        break;
      }

      klass = klass.$$parent;
    }

    // if we arent in a class, we couldnt find current?
    if (!klass) {
      throw new Error("could not find current class for super()");
    }

    klass = klass.$$parent;

    // else, let's find the next one
    while (klass) {
      var working = klass.$$proto[jsid];

      if (working && working !== current_func) {
        // ok
        break;
      }

      klass = klass.$$parent;
    }

    return klass.$$proto;
  };

  // Used to return as an expression. Sometimes, we can't simply return from
  // a javascript function as if we were a method, as the return is used as
  // an expression, or even inside a block which must "return" to the outer
  // method. This helper simply throws an error which is then caught by the
  // method. This approach is expensive, so it is only used when absolutely
  // needed.
  //
  Opal.ret = function(val) {
    Opal.returner.$v = val;
    throw Opal.returner;
  };

  // handles yield calls for 1 yielded arg
  Opal.yield1 = function(block, arg) {
    if (typeof(block) !== "function") {
      throw Opal.LocalJumpError.$new("no block given");
    }

    if (block.length > 1 && arg.$$is_array) {
      return block.apply(null, arg);
    }
    else {
      return block(arg);
    }
  };

  // handles yield for > 1 yielded arg
  Opal.yieldX = function(block, args) {
    if (typeof(block) !== "function") {
      throw Opal.LocalJumpError.$new("no block given");
    }

    if (block.length > 1 && args.length === 1) {
      if (args[0].$$is_array) {
        return block.apply(null, args[0]);
      }
    }

    if (!args.$$is_array) {
      args = $slice.call(args);
    }

    return block.apply(null, args);
  };

  // Finds the corresponding exception match in candidates.  Each candidate can
  // be a value, or an array of values.  Returns null if not found.
  Opal.rescue = function(exception, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];

      if (candidate.$$is_array) {
        var result = Opal.rescue(exception, candidate);

        if (result) {
          return result;
        }
      }
      else if (candidate['$==='](exception)) {
        return candidate;
      }
    }

    return null;
  };

  Opal.is_a = function(object, klass) {
    if (object.$$meta === klass) {
      return true;
    }

    var search = object.$$class;

    while (search) {
      if (search === klass) {
        return true;
      }

      for (var i = 0, length = search.$$inc.length; i < length; i++) {
        if (search.$$inc[i] === klass) {
          return true;
        }
      }

      search = search.$$super;
    }

    return false;
  };

  // Helpers for implementing multiple assignment
  // Our code for extracting the values and assigning them only works if the
  // return value is a JS array
  // So if we get an Array subclass, extract the wrapped JS array from it

  Opal.to_ary = function(value) {
    // Used for: a, b = something (no splat)
    if (value.$$is_array) {
      return (value.constructor === Array) ? value : value.literal;
    }
    else if (value['$respond_to?']('to_ary', true)) {
      var ary = value.$to_ary();
      if (ary === nil) {
        return [value];
      }
      else if (ary.$$is_array) {
        return (ary.constructor === Array) ? ary : ary.literal;
      }
      else {
        throw Opal.TypeError.$new("Can't convert " + value.$$class +
          " to Array (" + value.$$class + "#to_ary gives " + ary.$$class + ")");
      }
    }
    else {
      return [value];
    }
  };

  Opal.to_a = function(value) {
    // Used for: a, b = *something (with splat)
    if (value.$$is_array) {
      // A splatted array must be copied
      return (value.constructor === Array) ? value.slice() : value.literal.slice();
    }
    else if (value['$respond_to?']('to_a', true)) {
      var ary = value.$to_a();
      if (ary === nil) {
        return [value];
      }
      else if (ary.$$is_array) {
        return (ary.constructor === Array) ? ary : ary.literal;
      }
      else {
        throw Opal.TypeError.$new("Can't convert " + value.$$class +
          " to Array (" + value.$$class + "#to_a gives " + ary.$$class + ")");
      }
    }
    else {
      return [value];
    }
  };

  // Used to get a list of rest keyword arguments. Method takes the given
  // keyword args, i.e. the hash literal passed to the method containing all
  // keyword arguemnts passed to method, as well as the used args which are
  // the names of required and optional arguments defined. This method then
  // just returns all key/value pairs which have not been used, in a new
  // hash literal.
  //
  // @param given_args [Hash] all kwargs given to method
  // @param used_args [Object<String: true>] all keys used as named kwargs
  // @return [Hash]
  //
  Opal.kwrestargs = function(given_args, used_args) {
    var keys      = [],
        map       = {},
        key       = null,
        given_map = given_args.$$smap;

    for (key in given_map) {
      if (!used_args[key]) {
        keys.push(key);
        map[key] = given_map[key];
      }
    }

    return Opal.hash2(keys, map);
  };

  // Call a ruby method on a ruby object with some arguments:
  //
  //   var my_array = [1, 2, 3, 4]
  //   Opal.send(my_array, 'length')     # => 4
  //   Opal.send(my_array, 'reverse!')   # => [4, 3, 2, 1]
  //
  // A missing method will be forwarded to the object via
  // method_missing.
  //
  // The result of either call with be returned.
  //
  // @param [Object] recv the ruby object
  // @param [String] mid ruby method to call
  //
  Opal.send = function(recv, mid) {
    var args = $slice.call(arguments, 2),
        func = recv['$' + mid];

    if (func) {
      return func.apply(recv, args);
    }

    return recv.$method_missing.apply(recv, [mid].concat(args));
  };

  Opal.block_send = function(recv, mid, block) {
    var args = $slice.call(arguments, 3),
        func = recv['$' + mid];

    if (func) {
      func.$$p = block;
      return func.apply(recv, args);
    }

    return recv.$method_missing.apply(recv, [mid].concat(args));
  };

  // Used to define methods on an object. This is a helper method, used by the
  // compiled source to define methods on special case objects when the compiler
  // can not determine the destination object, or the object is a Module
  // instance. This can get called by `Module#define_method` as well.
  //
  // ## Modules
  //
  // Any method defined on a module will come through this runtime helper.
  // The method is added to the module body, and the owner of the method is
  // set to be the module itself. This is used later when choosing which
  // method should show on a class if more than 1 included modules define
  // the same method. Finally, if the module is in `module_function` mode,
  // then the method is also defined onto the module itself.
  //
  // ## Classes
  //
  // This helper will only be called for classes when a method is being
  // defined indirectly; either through `Module#define_method`, or by a
  // literal `def` method inside an `instance_eval` or `class_eval` body. In
  // either case, the method is simply added to the class' prototype. A special
  // exception exists for `BasicObject` and `Object`. These two classes are
  // special because they are used in toll-free bridged classes. In each of
  // these two cases, extra work is required to define the methods on toll-free
  // bridged class' prototypes as well.
  //
  // ## Objects
  //
  // If a simple ruby object is the object, then the method is simply just
  // defined on the object as a singleton method. This would be the case when
  // a method is defined inside an `instance_eval` block.
  //
  // @param [RubyObject or Class] obj the actual obj to define method for
  // @param [String] jsid the javascript friendly method name (e.g. '$foo')
  // @param [Function] body the literal javascript function used as method
  // @return [null]
  //
  Opal.defn = function(obj, jsid, body) {
    obj.$$proto[jsid] = body;

    if (obj.$$is_module) {
      donate(obj, jsid);

      if (obj.$$module_function) {
        Opal.defs(obj, jsid, body);
      }
    }

    if (obj.$__id__ && !obj.$__id__.$$stub) {
      var bridged = bridges[obj.$__id__()];

      if (bridged) {
        for (var i = bridged.length - 1; i >= 0; i--) {
          bridge_method(bridged[i], obj, jsid, body);
        }
      }
    }

    if (obj.$method_added && !obj.$method_added.$$stub) {
      obj.$method_added(jsid.substr(1));
    }

    var singleton_of = obj.$$singleton_of;
    if (singleton_of && singleton_of.$singleton_method_added && !singleton_of.$singleton_method_added.$$stub) {
      singleton_of.$singleton_method_added(jsid.substr(1));
    }

    return nil;
  };


  // Define a singleton method on the given object.
  Opal.defs = function(obj, jsid, body) {
    Opal.defn(Opal.get_singleton_class(obj), jsid, body)
  };

  Opal.def = function(obj, jsid, body) {
    // if instance_eval is invoked on a module/class, it sets inst_eval_mod
    if (!obj.$$eval && (obj.$$is_class || obj.$$is_module)) {
      Opal.defn(obj, jsid, body);
    }
    else {
      Opal.defs(obj, jsid, body);
    }
  };

  // Called from #remove_method.
  Opal.rdef = function(obj, jsid) {
    // TODO: remove from bridges as well

    if (!$hasOwn.call(obj.$$proto, jsid)) {
      throw Opal.NameError.$new("method '" + jsid.substr(1) + "' not defined in " + obj.$name());
    }

    delete obj.$$proto[jsid];

    if (obj.$$is_singleton) {
      if (obj.$$proto.$singleton_method_removed && !obj.$$proto.$singleton_method_removed.$$stub) {
        obj.$$proto.$singleton_method_removed(jsid.substr(1));
      }
    }
    else {
      if (obj.$method_removed && !obj.$method_removed.$$stub) {
        obj.$method_removed(jsid.substr(1));
      }
    }
  };

  // Called from #undef_method.
  Opal.udef = function(obj, jsid) {
    if (!obj.$$proto[jsid] || obj.$$proto[jsid].$$stub) {
      throw Opal.NameError.$new("method '" + jsid.substr(1) + "' not defined in " + obj.$name());
    }

    Opal.add_stub_for(obj.$$proto, jsid);

    if (obj.$$is_singleton) {
      if (obj.$$proto.$singleton_method_undefined && !obj.$$proto.$singleton_method_undefined.$$stub) {
        obj.$$proto.$singleton_method_undefined(jsid.substr(1));
      }
    }
    else {
      if (obj.$method_undefined && !obj.$method_undefined.$$stub) {
        obj.$method_undefined(jsid.substr(1));
      }
    }
  };

  Opal.alias = function(obj, name, old) {
    var id     = '$' + name,
        old_id = '$' + old,
        body   = obj.$$proto['$' + old];

    // instance_eval is being run on a class/module, so that need to alias class methods
    if (obj.$$eval) {
      return Opal.alias(Opal.get_singleton_class(obj), name, old);
    }

    if (typeof(body) !== "function" || body.$$stub) {
      var ancestor = obj.$$super;

      while (typeof(body) !== "function" && ancestor) {
        body     = ancestor[old_id];
        ancestor = ancestor.$$super;
      }

      if (typeof(body) !== "function" || body.$$stub) {
        throw Opal.NameError.$new("undefined method `" + old + "' for class `" + obj.$name() + "'")
      }
    }

    Opal.defn(obj, id, body);

    return obj;
  };

  Opal.alias_native = function(obj, name, native_name) {
    var id   = '$' + name,
        body = obj.$$proto[native_name];

    if (typeof(body) !== "function" || body.$$stub) {
      throw Opal.NameError.$new("undefined native method `" + native_name + "' for class `" + obj.$name() + "'")
    }

    Opal.defn(obj, id, body);

    return obj;
  };

  Opal.hash_init = function(hash) {
    hash.$$map  = {};
    hash.$$smap = {};
    hash.$$keys = [];
  };

  Opal.hash_clone = function(from_hash, to_hash) {
    to_hash.none = from_hash.none;
    to_hash.proc = from_hash.proc;

    for (var i = 0, keys = from_hash.$$keys, length = keys.length, key, value; i < length; i++) {
      key = from_hash.$$keys[i];

      if (key.$$is_string) {
        value = from_hash.$$smap[key];
      } else {
        value = key.value;
        key = key.key;
      }

      Opal.hash_put(to_hash, key, value);
    }
  };

  Opal.hash_put = function(hash, key, value) {
    if (key.$$is_string) {
      if (!hash.$$smap.hasOwnProperty(key)) {
        hash.$$keys.push(key);
      }
      hash.$$smap[key] = value;
      return;
    }

    var key_hash = key.$hash(), bucket, last_bucket;

    if (!hash.$$map.hasOwnProperty(key_hash)) {
      bucket = {key: key, key_hash: key_hash, value: value};
      hash.$$keys.push(bucket);
      hash.$$map[key_hash] = bucket;
      return;
    }

    bucket = hash.$$map[key_hash];

    while (bucket) {
      if (key === bucket.key || key['$eql?'](bucket.key)) {
        last_bucket = undefined;
        bucket.value = value;
        break;
      }
      last_bucket = bucket;
      bucket = bucket.next;
    }

    if (last_bucket) {
      bucket = {key: key, key_hash: key_hash, value: value};
      hash.$$keys.push(bucket);
      last_bucket.next = bucket;
    }
  };

  Opal.hash_get = function(hash, key) {
    if (key.$$is_string) {
      if (hash.$$smap.hasOwnProperty(key)) {
        return hash.$$smap[key];
      }
      return;
    }

    var key_hash = key.$hash(), bucket;

    if (hash.$$map.hasOwnProperty(key_hash)) {
      bucket = hash.$$map[key_hash];

      while (bucket) {
        if (key === bucket.key || key['$eql?'](bucket.key)) {
          return bucket.value;
        }
        bucket = bucket.next;
      }
    }
  };

  Opal.hash_delete = function(hash, key) {
    var i, keys = hash.$$keys, length = keys.length, value;

    if (key.$$is_string) {
      if (!hash.$$smap.hasOwnProperty(key)) {
        return;
      }

      for (i = 0; i < length; i++) {
        if (keys[i] === key) {
          keys.splice(i, 1);
          break;
        }
      }

      value = hash.$$smap[key];
      delete hash.$$smap[key];
      return value;
    }

    var key_hash = key.$hash();

    if (!hash.$$map.hasOwnProperty(key_hash)) {
      return;
    }

    var bucket = hash.$$map[key_hash], last_bucket;

    while (bucket) {
      if (key === bucket.key || key['$eql?'](bucket.key)) {
        value = bucket.value;

        for (i = 0; i < length; i++) {
          if (keys[i] === bucket) {
            keys.splice(i, 1);
            break;
          }
        }

        if (last_bucket && bucket.next) {
          last_bucket.next = bucket.next;
        }
        else if (last_bucket) {
          delete last_bucket.next;
        }
        else if (bucket.next) {
          hash.$$map[key_hash] = bucket.next;
        }
        else {
          delete hash.$$map[key_hash];
        }

        return value;
      }
      last_bucket = bucket;
      bucket = bucket.next;
    }
  };

  Opal.hash_rehash = function(hash) {
    for (var i = 0, length = hash.$$keys.length, key_hash, bucket, last_bucket; i < length; i++) {

      if (hash.$$keys[i].$$is_string) {
        continue;
      }

      key_hash = hash.$$keys[i].key.$hash();

      if (key_hash === hash.$$keys[i].key_hash) {
        continue;
      }

      bucket = hash.$$map[hash.$$keys[i].key_hash];
      last_bucket = undefined;

      while (bucket) {
        if (bucket === hash.$$keys[i]) {
          if (last_bucket && bucket.next) {
            last_bucket.next = bucket.next;
          }
          else if (last_bucket) {
            delete last_bucket.next;
          }
          else if (bucket.next) {
            hash.$$map[hash.$$keys[i].key_hash] = bucket.next;
          }
          else {
            delete hash.$$map[hash.$$keys[i].key_hash];
          }
          break;
        }
        last_bucket = bucket;
        bucket = bucket.next;
      }

      hash.$$keys[i].key_hash = key_hash;

      if (!hash.$$map.hasOwnProperty(key_hash)) {
        hash.$$map[key_hash] = hash.$$keys[i];
        continue;
      }

      bucket = hash.$$map[key_hash];
      last_bucket = undefined;

      while (bucket) {
        if (bucket === hash.$$keys[i]) {
          last_bucket = undefined;
          break;
        }
        last_bucket = bucket;
        bucket = bucket.next;
      }

      if (last_bucket) {
        last_bucket.next = hash.$$keys[i];
      }
    }
  };

  Opal.hash = function() {
    var arguments_length = arguments.length, args, hash, i, length, key, value;

    if (arguments_length === 1 && arguments[0].$$is_hash) {
      return arguments[0];
    }

    hash = new Opal.Hash.$$alloc();
    Opal.hash_init(hash);

    if (arguments_length === 1 && arguments[0].$$is_array) {
      args = arguments[0];
      length = args.length;

      for (i = 0; i < length; i++) {
        if (args[i].length !== 2) {
          throw Opal.ArgumentError.$new("value not of length 2: " + args[i].$inspect());
        }

        key = args[i][0];
        value = args[i][1];

        Opal.hash_put(hash, key, value);
      }

      return hash;
    }

    if (arguments_length === 1) {
      args = arguments[0];
      for (key in args) {
        if (args.hasOwnProperty(key)) {
          value = args[key];

          Opal.hash_put(hash, key, value);
        }
      }

      return hash;
    }

    if (arguments_length % 2 !== 0) {
      throw Opal.ArgumentError.$new("odd number of arguments for Hash");
    }

    for (i = 0; i < arguments_length; i += 2) {
      key = arguments[i];
      value = arguments[i + 1];

      Opal.hash_put(hash, key, value);
    }

    return hash;
  };

  // hash2 is a faster creator for hashes that just use symbols and
  // strings as keys. The map and keys array can be constructed at
  // compile time, so they are just added here by the constructor
  // function
  //
  Opal.hash2 = function(keys, smap) {
    var hash = new Opal.Hash.$$alloc();

    hash.$$map  = {};
    hash.$$keys = keys;
    hash.$$smap = smap;

    return hash;
  };

  // Create a new range instance with first and last values, and whether the
  // range excludes the last value.
  //
  Opal.range = function(first, last, exc) {
    var range         = new Opal.Range.$$alloc();
        range.begin   = first;
        range.end     = last;
        range.exclude = exc;

    return range;
  };

  Opal.ivar = function(name) {
    if (
        // properties
        name === "constructor" ||
        name === "displayName" ||
        name === "__count__" ||
        name === "__noSuchMethod__" ||
        name === "__parent__" ||
        name === "__proto__" ||

        // methods
        name === "hasOwnProperty" ||
        name === "valueOf"
       )
    {
      return name + "$";
    }

    return name;
  };

  // Require system
  // --------------

  Opal.modules         = {};
  Opal.loaded_features = ['corelib/runtime'];
  Opal.current_dir     = '.'
  Opal.require_table   = {'corelib/runtime': true};

  function normalize(path) {
    var parts, part, new_parts = [], SEPARATOR = '/';

    if (Opal.current_dir !== '.') {
      path = Opal.current_dir.replace(/\/*$/, '/') + path;
    }

    path = path.replace(/\.(rb|opal|js)$/, '');
    parts = path.split(SEPARATOR);

    for (var i = 0, ii = parts.length; i < ii; i++) {
      part = parts[i];
      if (part === '') continue;
      (part === '..') ? new_parts.pop() : new_parts.push(part)
    }

    return new_parts.join(SEPARATOR);
  }

  Opal.loaded = function(paths) {
    var i, l, path;

    for (i = 0, l = paths.length; i < l; i++) {
      path = normalize(paths[i]);

      if (Opal.require_table[path]) {
        return;
      }

      Opal.loaded_features.push(path);
      Opal.require_table[path] = true;
    }
  }

  Opal.load = function(path) {
    path = normalize(path);

    Opal.loaded([path]);

    var module = Opal.modules[path];

    if (module) {
      module(Opal);
    }
    else {
      var severity = Opal.dynamic_require_severity || 'warning';
      var message  = 'cannot load such file -- ' + path;

      if (severity === "error") {
        Opal.LoadError ? Opal.LoadError.$new(message) : function(){throw message}();
      }
      else if (severity === "warning") {
        console.warn('WARNING: LoadError: ' + message);
      }
    }

    return true;
  }

  Opal.require = function(path) {
    path = normalize(path);

    if (Opal.require_table[path]) {
      return false;
    }

    return Opal.load(path);
  }

  // Initialization
  // --------------

  // Constructors for *instances* of core objects
  boot_class_alloc('BasicObject', BasicObject_alloc);
  boot_class_alloc('Object',      Object_alloc,       BasicObject_alloc);
  boot_class_alloc('Module',      Module_alloc,       Object_alloc);
  boot_class_alloc('Class',       Class_alloc,        Module_alloc);

  // Constructors for *classes* of core objects
  BasicObject = boot_core_class_object('BasicObject', BasicObject_alloc, Class_alloc);
  _Object     = boot_core_class_object('Object',      Object_alloc,      BasicObject.constructor);
  Module      = boot_core_class_object('Module',      Module_alloc,      _Object.constructor);
  Class       = boot_core_class_object('Class',       Class_alloc,       Module.constructor);

  // Fix booted classes to use their metaclass
  BasicObject.$$class = Class;
  _Object.$$class     = Class;
  Module.$$class      = Class;
  Class.$$class       = Class;

  // Fix superclasses of booted classes
  BasicObject.$$super = null;
  _Object.$$super     = BasicObject;
  Module.$$super      = _Object;
  Class.$$super       = Module;

  BasicObject.$$parent = null;
  _Object.$$parent     = BasicObject;
  Module.$$parent      = _Object;
  Class.$$parent       = Module;

  Opal.base                = _Object;
  BasicObject.$$scope      = _Object.$$scope = Opal;
  BasicObject.$$orig_scope = _Object.$$orig_scope = Opal;

  Module.$$scope      = _Object.$$scope;
  Module.$$orig_scope = _Object.$$orig_scope;
  Class.$$scope       = _Object.$$scope;
  Class.$$orig_scope  = _Object.$$orig_scope;

  _Object.$$proto.toString = function() {
    return this.$to_s();
  };

  _Object.$$proto.$require = Opal.require;

  Opal.top = new _Object.$$alloc();

  // Nil
  Opal.klass(_Object, _Object, 'NilClass', NilClass_alloc);
  nil = Opal.nil = new NilClass_alloc();
  nil.$$id = nil_id;
  nil.call = nil.apply = function() { throw Opal.LocalJumpError.$new('no block given'); };

  Opal.breaker  = new Error('unexpected break');
  Opal.returner = new Error('unexpected return');

  TypeError.$$super = Error;
}).call(this);

if (typeof(global) !== 'undefined') {
  global.Opal = this.Opal;
  Opal.global = global;
}

if (typeof(window) !== 'undefined') {
  window.Opal = this.Opal;
  Opal.global = window;
}
Opal.loaded(["corelib/runtime"]);
/* Generated by Opal 0.9.2 */
Opal.modules["corelib/helpers"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$new', '$class', '$===', '$respond_to?', '$raise', '$type_error', '$__send__', '$coerce_to', '$nil?', '$<=>', '$inspect', '$coerce_to!']);
  return (function($base) {
    var $Opal, self = $Opal = $module($base, 'Opal');

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defs(self, '$bridge', function(klass, constructor) {
      var self = this;

      return Opal.bridge(klass, constructor);
    });

    Opal.defs(self, '$type_error', function(object, type, method, coerced) {
      var $a, $b, self = this;

      if (method == null) {
        method = nil
      }
      if (coerced == null) {
        coerced = nil
      }
      if ((($a = (($b = method !== false && method !== nil) ? coerced : method)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('TypeError').$new("can't convert " + (object.$class()) + " into " + (type) + " (" + (object.$class()) + "#" + (method) + " gives " + (coerced.$class()))
        } else {
        return $scope.get('TypeError').$new("no implicit conversion of " + (object.$class()) + " into " + (type))
      };
    });

    Opal.defs(self, '$coerce_to', function(object, type, method) {
      var $a, self = this;

      if ((($a = type['$==='](object)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return object};
      if ((($a = object['$respond_to?'](method)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(self.$type_error(object, type))
      };
      return object.$__send__(method);
    });

    Opal.defs(self, '$coerce_to!', function(object, type, method) {
      var $a, self = this, coerced = nil;

      coerced = self.$coerce_to(object, type, method);
      if ((($a = type['$==='](coerced)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(self.$type_error(object, type, method, coerced))
      };
      return coerced;
    });

    Opal.defs(self, '$coerce_to?', function(object, type, method) {
      var $a, self = this, coerced = nil;

      if ((($a = object['$respond_to?'](method)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      coerced = self.$coerce_to(object, type, method);
      if ((($a = coerced['$nil?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if ((($a = type['$==='](coerced)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(self.$type_error(object, type, method, coerced))
      };
      return coerced;
    });

    Opal.defs(self, '$try_convert', function(object, type, method) {
      var $a, self = this;

      if ((($a = type['$==='](object)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return object};
      if ((($a = object['$respond_to?'](method)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return object.$__send__(method)
        } else {
        return nil
      };
    });

    Opal.defs(self, '$compare', function(a, b) {
      var $a, self = this, compare = nil;

      compare = a['$<=>'](b);
      if ((($a = compare === nil) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (a.$class()) + " with " + (b.$class()) + " failed")};
      return compare;
    });

    Opal.defs(self, '$destructure', function(args) {
      var self = this;

      
      if (args.length == 1) {
        return args[0];
      }
      else if (args.$$is_array) {
        return args;
      }
      else {
        return $slice.call(args);
      }
    
    });

    Opal.defs(self, '$respond_to?', function(obj, method) {
      var self = this;

      
      if (obj == null || !obj.$$class) {
        return false;
      }
    
      return obj['$respond_to?'](method);
    });

    Opal.defs(self, '$inspect', function(obj) {
      var self = this;

      
      if (obj === undefined) {
        return "undefined";
      }
      else if (obj === null) {
        return "null";
      }
      else if (!obj.$$class) {
        return obj.toString();
      }
      else {
        return obj.$inspect();
      }
    
    });

    Opal.defs(self, '$instance_variable_name!', function(name) {
      var $a, self = this;

      name = $scope.get('Opal')['$coerce_to!'](name, $scope.get('String'), "to_str");
      if ((($a = /^@[a-zA-Z_][a-zA-Z0-9_]*?$/.test(name)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('NameError').$new("'" + (name) + "' is not allowed as an instance variable name", name))
      };
      return name;
    });
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/module"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$===', '$raise', '$equal?', '$<', '$>', '$nil?', '$attr_reader', '$attr_writer', '$coerce_to!', '$new', '$=~', '$inject', '$const_get', '$split', '$const_missing', '$to_str', '$to_proc', '$lambda', '$bind', '$call', '$class', '$append_features', '$included', '$name', '$to_s', '$__id__']);
  return (function($base, $super) {
    function $Module(){};
    var self = $Module = $klass($base, $super, 'Module', $Module);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_3, TMP_5, TMP_6;

    Opal.defs(self, '$new', TMP_1 = function() {
      var self = this, $iter = TMP_1.$$p, block = $iter || nil;

      TMP_1.$$p = null;
      
      var klass         = Opal.boot_module_object();
      klass.$$name      = nil;
      klass.$$class     = Opal.Module;
      klass.$$dep       = []
      klass.$$is_module = true;
      klass.$$proto     = {};

      // inherit scope from parent
      Opal.create_scope(Opal.Module.$$scope, klass);

      if (block !== nil) {
        var block_self = block.$$s;
        block.$$s = null;
        block.call(klass);
        block.$$s = block_self;
      }

      return klass;
    
    });

    Opal.defn(self, '$===', function(object) {
      var $a, self = this;

      if ((($a = object == null) !== nil && (!$a.$$is_boolean || $a == true))) {
        return false};
      return Opal.is_a(object, self);
    });

    Opal.defn(self, '$<', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Module')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "compared with non class/module")
      };
      
      var working = self,
          ancestors,
          i, length;

      if (working === other) {
        return false;
      }

      for (i = 0, ancestors = Opal.ancestors(self), length = ancestors.length; i < length; i++) {
        if (ancestors[i] === other) {
          return true;
        }
      }

      for (i = 0, ancestors = Opal.ancestors(other), length = ancestors.length; i < length; i++) {
        if (ancestors[i] === self) {
          return false;
        }
      }

      return nil;
    
    });

    Opal.defn(self, '$<=', function(other) {
      var $a, self = this;

      return ((($a = self['$equal?'](other)) !== false && $a !== nil) ? $a : $rb_lt(self, other));
    });

    Opal.defn(self, '$>', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Module')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "compared with non class/module")
      };
      return $rb_lt(other, self);
    });

    Opal.defn(self, '$>=', function(other) {
      var $a, self = this;

      return ((($a = self['$equal?'](other)) !== false && $a !== nil) ? $a : $rb_gt(self, other));
    });

    Opal.defn(self, '$<=>', function(other) {
      var $a, self = this, lt = nil;

      
      if (self === other) {
        return 0;
      }
    
      if ((($a = $scope.get('Module')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      lt = $rb_lt(self, other);
      if ((($a = lt['$nil?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if (lt !== false && lt !== nil) {
        return -1
        } else {
        return 1
      };
    });

    Opal.defn(self, '$alias_method', function(newname, oldname) {
      var self = this;

      Opal.alias(self, newname, oldname);
      return self;
    });

    Opal.defn(self, '$alias_native', function(mid, jsid) {
      var self = this;

      if (jsid == null) {
        jsid = mid
      }
      Opal.alias_native(self, mid, jsid);
      return self;
    });

    Opal.defn(self, '$ancestors', function() {
      var self = this;

      return Opal.ancestors(self);
    });

    Opal.defn(self, '$append_features', function(klass) {
      var self = this;

      Opal.append_features(self, klass);
      return self;
    });

    Opal.defn(self, '$attr_accessor', function() {
      var $a, $b, self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var names = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        names[$splat_index] = arguments[$splat_index + 0];
      }
      ($a = self).$attr_reader.apply($a, Opal.to_a(names));
      return ($b = self).$attr_writer.apply($b, Opal.to_a(names));
    });

    Opal.alias(self, 'attr', 'attr_accessor');

    Opal.defn(self, '$attr_reader', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var names = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        names[$splat_index] = arguments[$splat_index + 0];
      }
      
      var proto = self.$$proto;

      for (var i = names.length - 1; i >= 0; i--) {
        var name = names[i],
            id   = '$' + name,
            ivar = Opal.ivar(name);

        // the closure here is needed because name will change at the next
        // cycle, I wish we could use let.
        var body = (function(ivar) {
          return function() {
            if (this[ivar] == null) {
              return nil;
            }
            else {
              return this[ivar];
            }
          };
        })(ivar);

        // initialize the instance variable as nil
        proto[ivar] = nil;

        if (self.$$is_singleton) {
          proto.constructor.prototype[id] = body;
        }
        else {
          Opal.defn(self, id, body);
        }
      }
    
      return nil;
    });

    Opal.defn(self, '$attr_writer', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var names = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        names[$splat_index] = arguments[$splat_index + 0];
      }
      
      var proto = self.$$proto;

      for (var i = names.length - 1; i >= 0; i--) {
        var name = names[i],
            id   = '$' + name + '=',
            ivar = Opal.ivar(name);

        // the closure here is needed because name will change at the next
        // cycle, I wish we could use let.
        var body = (function(ivar){
          return function(value) {
            return this[ivar] = value;
          }
        })(ivar);

        // initialize the instance variable as nil
        proto[ivar] = nil;

        if (self.$$is_singleton) {
          proto.constructor.prototype[id] = body;
        }
        else {
          Opal.defn(self, id, body);
        }
      }
    
      return nil;
    });

    Opal.defn(self, '$autoload', function(const$, path) {
      var self = this;

      
      var autoloaders;

      if (!(autoloaders = self.$$autoload)) {
        autoloaders = self.$$autoload = {};
      }

      autoloaders[const$] = path;
      return nil;
    ;
    });

    Opal.defn(self, '$class_variable_get', function(name) {
      var $a, self = this;

      name = $scope.get('Opal')['$coerce_to!'](name, $scope.get('String'), "to_str");
      if ((($a = name.length < 3 || name.slice(0,2) !== '@@') !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('NameError').$new("class vars should start with @@", name))};
      
      var value = Opal.cvars[name.slice(2)];
      (function() {if ((($a = value == null) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('NameError').$new("uninitialized class variable @@a in", name))
        } else {
        return nil
      }; return nil; })()
      return value;
    
    });

    Opal.defn(self, '$class_variable_set', function(name, value) {
      var $a, self = this;

      name = $scope.get('Opal')['$coerce_to!'](name, $scope.get('String'), "to_str");
      if ((($a = name.length < 3 || name.slice(0,2) !== '@@') !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('NameError'))};
      
      Opal.cvars[name.slice(2)] = value;
      return value;
    
    });

    Opal.defn(self, '$constants', function() {
      var self = this;

      return self.$$scope.constants.slice(0);
    });

    Opal.defn(self, '$const_defined?', function(name, inherit) {
      var $a, self = this;

      if (inherit == null) {
        inherit = true
      }
      if ((($a = name['$=~'](/^[A-Z]\w*$/)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('NameError').$new("wrong constant name " + (name), name))
      };
      
      var scopes = [self.$$scope];

      if (inherit || self === Opal.Object) {
        var parent = self.$$super;

        while (parent !== Opal.BasicObject) {
          scopes.push(parent.$$scope);

          parent = parent.$$super;
        }
      }

      for (var i = 0, length = scopes.length; i < length; i++) {
        if (scopes[i].hasOwnProperty(name)) {
          return true;
        }
      }

      return false;
    
    });

    Opal.defn(self, '$const_get', function(name, inherit) {
      var $a, $b, TMP_2, self = this;

      if (inherit == null) {
        inherit = true
      }
      if ((($a = name.indexOf('::') != -1 && name != '::') !== nil && (!$a.$$is_boolean || $a == true))) {
        return ($a = ($b = name.$split("::")).$inject, $a.$$p = (TMP_2 = function(o, c){var self = TMP_2.$$s || this;
if (o == null) o = nil;if (c == null) c = nil;
        return o.$const_get(c)}, TMP_2.$$s = self, TMP_2), $a).call($b, self)};
      if ((($a = /^[A-Z]\w*$/.test(name)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('NameError').$new("wrong constant name " + (name), name))
      };
      
      var scopes = [self.$$scope];

      if (inherit || self == Opal.Object) {
        var parent = self.$$super;

        while (parent !== Opal.BasicObject) {
          scopes.push(parent.$$scope);

          parent = parent.$$super;
        }
      }

      for (var i = 0, length = scopes.length; i < length; i++) {
        if (scopes[i].hasOwnProperty(name)) {
          return scopes[i][name];
        }
      }

      return self.$const_missing(name);
    
    });

    Opal.defn(self, '$const_missing', function(name) {
      var self = this;

      
      if (self.$$autoload) {
        var file = self.$$autoload[name];

        if (file) {
          self.$require(file);

          return self.$const_get(name);
        }
      }
    
      return self.$raise($scope.get('NameError').$new("uninitialized constant " + (self) + "::" + (name), name));
    });

    Opal.defn(self, '$const_set', function(name, value) {
      var $a, self = this;

      if ((($a = name['$=~'](/^[A-Z]\w*$/)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('NameError').$new("wrong constant name " + (name), name))
      };
      try {
      name = name.$to_str()
      } catch ($err) {if (true) {
        try {
          self.$raise($scope.get('TypeError'), "conversion with #to_str failed")
        } finally {
          Opal.gvars["!"] = Opal.exceptions.pop() || Opal.nil;
        }
        }else { throw $err; }
      };
      Opal.casgn(self, name, value);
      return value;
    });

    Opal.defn(self, '$define_method', TMP_3 = function(name, method) {
      var $a, $b, $c, TMP_4, self = this, $iter = TMP_3.$$p, block = $iter || nil, $case = nil;

      TMP_3.$$p = null;
      if ((($a = method === undefined && block === nil) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "tried to create a Proc object without a block")};
      ((($a = block) !== false && $a !== nil) ? $a : block = (function() {$case = method;if ($scope.get('Proc')['$===']($case)) {return method}else if ($scope.get('Method')['$===']($case)) {return method.$to_proc().$$unbound;}else if ($scope.get('UnboundMethod')['$===']($case)) {return ($b = ($c = self).$lambda, $b.$$p = (TMP_4 = function(args){var self = TMP_4.$$s || this, $a, bound = nil;
args = $slice.call(arguments, 0);
      bound = method.$bind(self);
        return ($a = bound).$call.apply($a, Opal.to_a(args));}, TMP_4.$$s = self, TMP_4), $b).call($c)}else {return self.$raise($scope.get('TypeError'), "wrong argument type " + (block.$class()) + " (expected Proc/Method)")}})());
      
      var id = '$' + name;

      block.$$jsid = name;
      block.$$s    = null;
      block.$$def  = block;

      Opal.defn(self, id, block);

      return name;
    
    });

    Opal.defn(self, '$remove_method', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var names = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        names[$splat_index] = arguments[$splat_index + 0];
      }
      
      for (var i = 0, length = names.length; i < length; i++) {
        Opal.rdef(self, "$" + names[i]);
      }
    
      return self;
    });

    Opal.defn(self, '$singleton_class?', function() {
      var self = this;

      return !!self.$$is_singleton;
    });

    Opal.defn(self, '$include', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var mods = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        mods[$splat_index] = arguments[$splat_index + 0];
      }
      
      for (var i = mods.length - 1; i >= 0; i--) {
        var mod = mods[i];

        if (mod === self) {
          continue;
        }

        if (!mod.$$is_module) {
          self.$raise($scope.get('TypeError'), "wrong argument type " + ((mod).$class()) + " (expected Module)");
        }

        (mod).$append_features(self);
        (mod).$included(self);
      }
    
      return self;
    });

    Opal.defn(self, '$include?', function(mod) {
      var self = this;

      
      for (var cls = self; cls; cls = cls.$$super) {
        for (var i = 0; i != cls.$$inc.length; i++) {
          var mod2 = cls.$$inc[i];
          if (mod === mod2) {
            return true;
          }
        }
      }
      return false;
    
    });

    Opal.defn(self, '$instance_method', function(name) {
      var self = this;

      
      var meth = self.$$proto['$' + name];

      if (!meth || meth.$$stub) {
        self.$raise($scope.get('NameError').$new("undefined method `" + (name) + "' for class `" + (self.$name()) + "'", name));
      }

      return $scope.get('UnboundMethod').$new(self, meth, name);
    
    });

    Opal.defn(self, '$instance_methods', function(include_super) {
      var self = this;

      if (include_super == null) {
        include_super = true
      }
      
      var methods = [],
          proto   = self.$$proto;

      for (var prop in proto) {
        if (prop.charAt(0) !== '$') {
          continue;
        }

        if (typeof(proto[prop]) !== "function") {
          continue;
        }

        if (proto[prop].$$stub) {
          continue;
        }

        if (!self.$$is_module) {
          if (self !== Opal.BasicObject && proto[prop] === Opal.BasicObject.$$proto[prop]) {
            continue;
          }

          if (!include_super && !proto.hasOwnProperty(prop)) {
            continue;
          }

          if (!include_super && proto[prop].$$donated) {
            continue;
          }
        }

        methods.push(prop.substr(1));
      }

      return methods;
    
    });

    Opal.defn(self, '$included', function(mod) {
      var self = this;

      return nil;
    });

    Opal.defn(self, '$extended', function(mod) {
      var self = this;

      return nil;
    });

    Opal.defn(self, '$method_added', function() {
      var self = this;

      return nil;
    });

    Opal.defn(self, '$method_removed', function() {
      var self = this;

      return nil;
    });

    Opal.defn(self, '$method_undefined', function() {
      var self = this;

      return nil;
    });

    Opal.defn(self, '$module_eval', TMP_5 = function() {
      var self = this, $iter = TMP_5.$$p, block = $iter || nil;

      TMP_5.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        self.$raise($scope.get('ArgumentError'), "no block given")
      };
      
      var old = block.$$s,
          result;

      block.$$s = null;
      result = block.call(self);
      block.$$s = old;

      return result;
    
    });

    Opal.alias(self, 'class_eval', 'module_eval');

    Opal.defn(self, '$module_exec', TMP_6 = function() {
      var self = this, $iter = TMP_6.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_6.$$p = null;
      
      if (block === nil) {
        self.$raise($scope.get('LocalJumpError'), "no block given")
      }

      var block_self = block.$$s, result;

      block.$$s = null;
      result = block.apply(self, args);
      block.$$s = block_self;

      return result;
    ;
    });

    Opal.alias(self, 'class_exec', 'module_exec');

    Opal.defn(self, '$method_defined?', function(method) {
      var self = this;

      
      var body = self.$$proto['$' + method];
      return (!!body) && !body.$$stub;
    
    });

    Opal.defn(self, '$module_function', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var methods = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        methods[$splat_index] = arguments[$splat_index + 0];
      }
      
      if (methods.length === 0) {
        self.$$module_function = true;
      }
      else {
        for (var i = 0, length = methods.length; i < length; i++) {
          var meth = methods[i],
              id   = '$' + meth,
              func = self.$$proto[id];

          Opal.defs(self, id, func);
        }
      }

      return self;
    
    });

    Opal.defn(self, '$name', function() {
      var self = this;

      
      if (self.$$full_name) {
        return self.$$full_name;
      }

      var result = [], base = self;

      while (base) {
        if (base.$$name === nil) {
          return result.length === 0 ? nil : result.join('::');
        }

        result.unshift(base.$$name);

        base = base.$$base_module;

        if (base === Opal.Object) {
          break;
        }
      }

      if (result.length === 0) {
        return nil;
      }

      return self.$$full_name = result.join('::');
    
    });

    Opal.defn(self, '$remove_class_variable', function() {
      var self = this;

      return nil;
    });

    Opal.defn(self, '$remove_const', function(name) {
      var self = this;

      
      var old = self.$$scope[name];
      delete self.$$scope[name];
      return old;
    
    });

    Opal.defn(self, '$to_s', function() {
      var $a, self = this;

      return ((($a = Opal.Module.$name.call(self)) !== false && $a !== nil) ? $a : "#<" + (self.$$is_module ? 'Module' : 'Class') + ":0x" + (self.$__id__().$to_s(16)) + ">");
    });

    return (Opal.defn(self, '$undef_method', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var names = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        names[$splat_index] = arguments[$splat_index + 0];
      }
      
      for (var i = 0, length = names.length; i < length; i++) {
        Opal.udef(self, "$" + names[i]);
      }
    
      return self;
    }), nil) && 'undef_method';
  })($scope.base, null)
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/class"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$raise', '$allocate']);
  self.$require("corelib/module");
  return (function($base, $super) {
    function $Class(){};
    var self = $Class = $klass($base, $super, 'Class', $Class);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2;

    Opal.defs(self, '$new', TMP_1 = function(sup) {
      var self = this, $iter = TMP_1.$$p, block = $iter || nil;

      if (sup == null) {
        sup = $scope.get('Object')
      }
      TMP_1.$$p = null;
      
      if (!sup.$$is_class) {
        self.$raise($scope.get('TypeError'), "superclass must be a Class");
      }

      function AnonClass(){};
      var klass        = Opal.boot_class(sup, AnonClass)
      klass.$$name     = nil;
      klass.$$parent   = sup;
      klass.$$is_class = true;

      // inherit scope from parent
      Opal.create_scope(sup.$$scope, klass);

      sup.$inherited(klass);

      if (block !== nil) {
        var block_self = block.$$s;
        block.$$s = null;
        block.call(klass);
        block.$$s = block_self;
      }

      return klass;
    ;
    });

    Opal.defn(self, '$allocate', function() {
      var self = this;

      
      var obj = new self.$$alloc();
      obj.$$id = Opal.uid();
      return obj;
    
    });

    Opal.defn(self, '$inherited', function(cls) {
      var self = this;

      return nil;
    });

    Opal.defn(self, '$new', TMP_2 = function() {
      var self = this, $iter = TMP_2.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_2.$$p = null;
      
      var obj = self.$allocate();

      obj.$initialize.$$p = block;
      obj.$initialize.apply(obj, args);
      return obj;
    ;
    });

    return (Opal.defn(self, '$superclass', function() {
      var self = this;

      return self.$$super || nil;
    }), nil) && 'superclass';
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/basic_object"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $range = Opal.range, $hash2 = Opal.hash2;

  Opal.add_stubs(['$==', '$!', '$nil?', '$cover?', '$size', '$raise', '$compile', '$lambda', '$>', '$new', '$inspect']);
  return (function($base, $super) {
    function $BasicObject(){};
    var self = $BasicObject = $klass($base, $super, 'BasicObject', $BasicObject);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_4, TMP_5;

    Opal.defn(self, '$initialize', function() {
      var self = this;

      return nil;
    });

    Opal.defn(self, '$==', function(other) {
      var self = this;

      return self === other;
    });

    Opal.defn(self, '$eql?', function(other) {
      var self = this;

      return self['$=='](other);
    });

    Opal.alias(self, 'equal?', '==');

    Opal.defn(self, '$__id__', function() {
      var self = this;

      return self.$$id || (self.$$id = Opal.uid());
    });

    Opal.defn(self, '$__send__', TMP_1 = function(symbol) {
      var self = this, $iter = TMP_1.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 1;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 1];
      }
      TMP_1.$$p = null;
      
      var func = self['$' + symbol]

      if (func) {
        if (block !== nil) {
          func.$$p = block;
        }

        return func.apply(self, args);
      }

      if (block !== nil) {
        self.$method_missing.$$p = block;
      }

      return self.$method_missing.apply(self, [symbol].concat(args));
    
    });

    Opal.defn(self, '$!', function() {
      var self = this;

      return false;
    });

    Opal.defn(self, '$!=', function(other) {
      var self = this;

      return (self['$=='](other))['$!']();
    });

    Opal.alias(self, 'equal?', '==');

    Opal.defn(self, '$instance_eval', TMP_2 = function() {
      var $a, $b, TMP_3, self = this, $iter = TMP_2.$$p, block = $iter || nil, string = nil, file = nil, _lineno = nil, compiled = nil, wrapper = nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_2.$$p = null;
      if ((($a = ($b = block['$nil?'](), $b !== false && $b !== nil ?!!Opal.compile : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ($range(1, 3, false))['$cover?'](args.$size())) !== nil && (!$a.$$is_boolean || $a == true))) {
          } else {
          $scope.get('Kernel').$raise($scope.get('ArgumentError'), "wrong number of arguments (0 for 1..3)")
        };
        $a = Opal.to_a(args), string = ($a[0] == null ? nil : $a[0]), file = ($a[1] == null ? nil : $a[1]), _lineno = ($a[2] == null ? nil : $a[2]), $a;
        compiled = $scope.get('Opal').$compile(string, $hash2(["file", "eval"], {"file": (((($a = file) !== false && $a !== nil) ? $a : "(eval)")), "eval": true}));
        wrapper = function() {return eval(compiled)};
        block = ($a = ($b = $scope.get('Kernel')).$lambda, $a.$$p = (TMP_3 = function(){var self = TMP_3.$$s || this;

        return wrapper.call(self);}, TMP_3.$$s = self, TMP_3), $a).call($b);
      } else if ((($a = $rb_gt(args.$size(), 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
        $scope.get('Kernel').$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (args.$size()) + " for 0)")};
      
      var old = block.$$s,
          result;

      block.$$s = null;

      // Need to pass $$eval so that method definitions know if this is
      // being done on a class/module. Cannot be compiler driven since
      // send(:instance_eval) needs to work.
      if (self.$$is_class || self.$$is_module) {
        self.$$eval = true;
        try {
          result = block.call(self, self);
        }
        finally {
          self.$$eval = false;
        }
      }
      else {
        result = block.call(self, self);
      }

      block.$$s = old;

      return result;
    
    });

    Opal.defn(self, '$instance_exec', TMP_4 = function() {
      var self = this, $iter = TMP_4.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_4.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        $scope.get('Kernel').$raise($scope.get('ArgumentError'), "no block given")
      };
      
      var block_self = block.$$s,
          result;

      block.$$s = null;

      if (self.$$is_class || self.$$is_module) {
        self.$$eval = true;
        try {
          result = block.apply(self, args);
        }
        finally {
          self.$$eval = false;
        }
      }
      else {
        result = block.apply(self, args);
      }

      block.$$s = block_self;

      return result;
    
    });

    Opal.defn(self, '$singleton_method_added', function() {
      var self = this;

      return nil;
    });

    Opal.defn(self, '$singleton_method_removed', function() {
      var self = this;

      return nil;
    });

    Opal.defn(self, '$singleton_method_undefined', function() {
      var self = this;

      return nil;
    });

    return (Opal.defn(self, '$method_missing', TMP_5 = function(symbol) {
      var $a, self = this, $iter = TMP_5.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 1;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 1];
      }
      TMP_5.$$p = null;
      return $scope.get('Kernel').$raise($scope.get('NoMethodError').$new((function() {if ((($a = self.$inspect && !self.$inspect.$$stub) !== nil && (!$a.$$is_boolean || $a == true))) {
        return "undefined method `" + (symbol) + "' for " + (self.$inspect()) + ":" + (self.$$class)
        } else {
        return "undefined method `" + (symbol) + "' for " + (self.$$class)
      }; return nil; })(), symbol));
    }), nil) && 'method_missing';
  })($scope.base, null)
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/kernel"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $gvars = Opal.gvars, $hash2 = Opal.hash2, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$new', '$inspect', '$!', '$=~', '$==', '$object_id', '$class', '$coerce_to?', '$<<', '$allocate', '$copy_instance_variables', '$copy_singleton_methods', '$initialize_clone', '$initialize_copy', '$define_method', '$to_proc', '$singleton_class', '$initialize_dup', '$for', '$loop', '$pop', '$call', '$append_features', '$extended', '$length', '$respond_to?', '$[]', '$nil?', '$to_a', '$to_int', '$fetch', '$Integer', '$Float', '$to_ary', '$to_str', '$coerce_to', '$to_s', '$__id__', '$instance_variable_name!', '$coerce_to!', '$===', '$>', '$print', '$format', '$puts', '$each', '$<=', '$empty?', '$exception', '$kind_of?', '$respond_to_missing?', '$try_convert!', '$expand_path', '$join', '$start_with?', '$sym', '$arg', '$include']);
  (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_6, TMP_7, TMP_8, TMP_10, TMP_11;

    Opal.defn(self, '$method_missing', TMP_1 = function(symbol) {
      var self = this, $iter = TMP_1.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 1;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 1];
      }
      TMP_1.$$p = null;
      return self.$raise($scope.get('NoMethodError').$new("undefined method `" + (symbol) + "' for " + (self.$inspect()), symbol, args));
    });

    Opal.defn(self, '$=~', function(obj) {
      var self = this;

      return false;
    });

    Opal.defn(self, '$!~', function(obj) {
      var self = this;

      return (self['$=~'](obj))['$!']();
    });

    Opal.defn(self, '$===', function(other) {
      var $a, self = this;

      return ((($a = self.$object_id()['$=='](other.$object_id())) !== false && $a !== nil) ? $a : self['$=='](other));
    });

    Opal.defn(self, '$<=>', function(other) {
      var self = this;

      
      // set guard for infinite recursion
      self.$$comparable = true;

      var x = self['$=='](other);

      if (x && x !== nil) {
        return 0;
      }

      return nil;
    
    });

    Opal.defn(self, '$method', function(name) {
      var self = this;

      
      var meth = self['$' + name];

      if (!meth || meth.$$stub) {
        self.$raise($scope.get('NameError').$new("undefined method `" + (name) + "' for class `" + (self.$class()) + "'", name));
      }

      return $scope.get('Method').$new(self, meth, name);
    
    });

    Opal.defn(self, '$methods', function(all) {
      var self = this;

      if (all == null) {
        all = true
      }
      
      var methods = [];

      for (var key in self) {
        if (key[0] == "$" && typeof(self[key]) === "function") {
          if (all == false || all === nil) {
            if (!Opal.hasOwnProperty.call(self, key)) {
              continue;
            }
          }
          if (self[key].$$stub === undefined) {
            methods.push(key.substr(1));
          }
        }
      }

      return methods;
    
    });

    Opal.alias(self, 'public_methods', 'methods');

    Opal.defn(self, '$Array', function(object) {
      var self = this;

      
      var coerced;

      if (object === nil) {
        return [];
      }

      if (object.$$is_array) {
        return object;
      }

      coerced = $scope.get('Opal')['$coerce_to?'](object, $scope.get('Array'), "to_ary");
      if (coerced !== nil) { return coerced; }

      coerced = $scope.get('Opal')['$coerce_to?'](object, $scope.get('Array'), "to_a");
      if (coerced !== nil) { return coerced; }

      return [object];
    
    });

    Opal.defn(self, '$at_exit', TMP_2 = function() {
      var $a, self = this, $iter = TMP_2.$$p, block = $iter || nil;
      if ($gvars.__at_exit__ == null) $gvars.__at_exit__ = nil;

      TMP_2.$$p = null;
      ((($a = $gvars.__at_exit__) !== false && $a !== nil) ? $a : $gvars.__at_exit__ = []);
      return $gvars.__at_exit__['$<<'](block);
    });

    Opal.defn(self, '$caller', function() {
      var self = this;

      return [];
    });

    Opal.defn(self, '$class', function() {
      var self = this;

      return self.$$class;
    });

    Opal.defn(self, '$copy_instance_variables', function(other) {
      var self = this;

      
      for (var name in other) {
        if (other.hasOwnProperty(name) && name.charAt(0) !== '$') {
          self[name] = other[name];
        }
      }
    
    });

    Opal.defn(self, '$copy_singleton_methods', function(other) {
      var self = this;

      
      var name;

      if (other.hasOwnProperty('$$meta')) {
        var other_singleton_class_proto = Opal.get_singleton_class(other).$$proto;
        var self_singleton_class_proto = Opal.get_singleton_class(self).$$proto;

        for (name in other_singleton_class_proto) {
          if (name.charAt(0) === '$' && other_singleton_class_proto.hasOwnProperty(name)) {
            self_singleton_class_proto[name] = other_singleton_class_proto[name];
          }
        }
      }

      for (name in other) {
        if (name.charAt(0) === '$' && name.charAt(1) !== '$' && other.hasOwnProperty(name)) {
          self[name] = other[name];
        }
      }
    
    });

    Opal.defn(self, '$clone', function() {
      var self = this, copy = nil;

      copy = self.$class().$allocate();
      copy.$copy_instance_variables(self);
      copy.$copy_singleton_methods(self);
      copy.$initialize_clone(self);
      return copy;
    });

    Opal.defn(self, '$initialize_clone', function(other) {
      var self = this;

      return self.$initialize_copy(other);
    });

    Opal.defn(self, '$define_singleton_method', TMP_3 = function(name, method) {
      var $a, $b, self = this, $iter = TMP_3.$$p, block = $iter || nil;

      TMP_3.$$p = null;
      return ($a = ($b = self.$singleton_class()).$define_method, $a.$$p = block.$to_proc(), $a).call($b, name, method);
    });

    Opal.defn(self, '$dup', function() {
      var self = this, copy = nil;

      copy = self.$class().$allocate();
      copy.$copy_instance_variables(self);
      copy.$initialize_dup(self);
      return copy;
    });

    Opal.defn(self, '$initialize_dup', function(other) {
      var self = this;

      return self.$initialize_copy(other);
    });

    Opal.defn(self, '$enum_for', TMP_4 = function(method) {
      var $a, $b, self = this, $iter = TMP_4.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 1;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 1];
      }
      if (method == null) {
        method = "each"
      }
      TMP_4.$$p = null;
      return ($a = ($b = $scope.get('Enumerator')).$for, $a.$$p = block.$to_proc(), $a).apply($b, [self, method].concat(Opal.to_a(args)));
    });

    Opal.alias(self, 'to_enum', 'enum_for');

    Opal.defn(self, '$equal?', function(other) {
      var self = this;

      return self === other;
    });

    Opal.defn(self, '$exit', function(status) {
      var $a, $b, TMP_5, self = this;
      if ($gvars.__at_exit__ == null) $gvars.__at_exit__ = nil;

      if (status == null) {
        status = true
      }
      ((($a = $gvars.__at_exit__) !== false && $a !== nil) ? $a : $gvars.__at_exit__ = []);
      ($a = ($b = self).$loop, $a.$$p = (TMP_5 = function(){var self = TMP_5.$$s || this, block = nil;
        if ($gvars.__at_exit__ == null) $gvars.__at_exit__ = nil;

      block = $gvars.__at_exit__.$pop();
        if (block !== false && block !== nil) {
          return block.$call()
          } else {
          return ($breaker.$v = nil, $breaker)
        };}, TMP_5.$$s = self, TMP_5), $a).call($b);
      if ((($a = status === true) !== nil && (!$a.$$is_boolean || $a == true))) {
        status = 0};
      Opal.exit(status);
      return nil;
    });

    Opal.defn(self, '$extend', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var mods = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        mods[$splat_index] = arguments[$splat_index + 0];
      }
      
      var singleton = self.$singleton_class();

      for (var i = mods.length - 1; i >= 0; i--) {
        var mod = mods[i];

        if (!mod.$$is_module) {
          self.$raise($scope.get('TypeError'), "wrong argument type " + ((mod).$class()) + " (expected Module)");
        }

        (mod).$append_features(singleton);
        (mod).$extended(self);
      }
    ;
      return self;
    });

    Opal.defn(self, '$format', function(format_string) {
      var $a, $b, self = this, ary = nil, $splat_index = nil;
      if ($gvars.DEBUG == null) $gvars.DEBUG = nil;

      var array_size = arguments.length - 1;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 1];
      }
      if ((($a = (($b = args.$length()['$=='](1)) ? args['$[]'](0)['$respond_to?']("to_ary") : args.$length()['$=='](1))) !== nil && (!$a.$$is_boolean || $a == true))) {
        ary = $scope.get('Opal')['$coerce_to?'](args['$[]'](0), $scope.get('Array'), "to_ary");
        if ((($a = ary['$nil?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
          } else {
          args = ary.$to_a()
        };};
      
      var result = '',
          //used for slicing:
          begin_slice = 0,
          end_slice,
          //used for iterating over the format string:
          i,
          len = format_string.length,
          //used for processing field values:
          arg,
          str,
          //used for processing %g and %G fields:
          exponent,
          //used for keeping track of width and precision:
          width,
          precision,
          //used for holding temporary values:
          tmp_num,
          //used for processing %{} and %<> fileds:
          hash_parameter_key,
          closing_brace_char,
          //used for processing %b, %B, %o, %x, and %X fields:
          base_number,
          base_prefix,
          base_neg_zero_regex,
          base_neg_zero_digit,
          //used for processing arguments:
          next_arg,
          seq_arg_num = 1,
          pos_arg_num = 0,
          //used for keeping track of flags:
          flags,
          FNONE  = 0,
          FSHARP = 1,
          FMINUS = 2,
          FPLUS  = 4,
          FZERO  = 8,
          FSPACE = 16,
          FWIDTH = 32,
          FPREC  = 64,
          FPREC0 = 128;

      function CHECK_FOR_FLAGS() {
        if (flags&FWIDTH) { self.$raise($scope.get('ArgumentError'), "flag after width") }
        if (flags&FPREC0) { self.$raise($scope.get('ArgumentError'), "flag after precision") }
      }

      function CHECK_FOR_WIDTH() {
        if (flags&FWIDTH) { self.$raise($scope.get('ArgumentError'), "width given twice") }
        if (flags&FPREC0) { self.$raise($scope.get('ArgumentError'), "width after precision") }
      }

      function GET_NTH_ARG(num) {
        if (num >= args.length) { self.$raise($scope.get('ArgumentError'), "too few arguments") }
        return args[num];
      }

      function GET_NEXT_ARG() {
        switch (pos_arg_num) {
        case -1: self.$raise($scope.get('ArgumentError'), "unnumbered(" + (seq_arg_num) + ") mixed with numbered")
        case -2: self.$raise($scope.get('ArgumentError'), "unnumbered(" + (seq_arg_num) + ") mixed with named")
        }
        pos_arg_num = seq_arg_num++;
        return GET_NTH_ARG(pos_arg_num - 1);
      }

      function GET_POS_ARG(num) {
        if (pos_arg_num > 0) {
          self.$raise($scope.get('ArgumentError'), "numbered(" + (num) + ") after unnumbered(" + (pos_arg_num) + ")")
        }
        if (pos_arg_num === -2) {
          self.$raise($scope.get('ArgumentError'), "numbered(" + (num) + ") after named")
        }
        if (num < 1) {
          self.$raise($scope.get('ArgumentError'), "invalid index - " + (num) + "$")
        }
        pos_arg_num = -1;
        return GET_NTH_ARG(num - 1);
      }

      function GET_ARG() {
        return (next_arg === undefined ? GET_NEXT_ARG() : next_arg);
      }

      function READ_NUM(label) {
        var num, str = '';
        for (;; i++) {
          if (i === len) {
            self.$raise($scope.get('ArgumentError'), "malformed format string - %*[0-9]")
          }
          if (format_string.charCodeAt(i) < 48 || format_string.charCodeAt(i) > 57) {
            i--;
            num = parseInt(str, 10) || 0;
            if (num > 2147483647) {
              self.$raise($scope.get('ArgumentError'), "" + (label) + " too big")
            }
            return num;
          }
          str += format_string.charAt(i);
        }
      }

      function READ_NUM_AFTER_ASTER(label) {
        var arg, num = READ_NUM(label);
        if (format_string.charAt(i + 1) === '$') {
          i++;
          arg = GET_POS_ARG(num);
        } else {
          arg = GET_NEXT_ARG();
        }
        return (arg).$to_int();
      }

      for (i = format_string.indexOf('%'); i !== -1; i = format_string.indexOf('%', i)) {
        str = undefined;

        flags = FNONE;
        width = -1;
        precision = -1;
        next_arg = undefined;

        end_slice = i;

        i++;

        switch (format_string.charAt(i)) {
        case '%':
          begin_slice = i;
        case '':
        case '\n':
        case '\0':
          i++;
          continue;
        }

        format_sequence: for (; i < len; i++) {
          switch (format_string.charAt(i)) {

          case ' ':
            CHECK_FOR_FLAGS();
            flags |= FSPACE;
            continue format_sequence;

          case '#':
            CHECK_FOR_FLAGS();
            flags |= FSHARP;
            continue format_sequence;

          case '+':
            CHECK_FOR_FLAGS();
            flags |= FPLUS;
            continue format_sequence;

          case '-':
            CHECK_FOR_FLAGS();
            flags |= FMINUS;
            continue format_sequence;

          case '0':
            CHECK_FOR_FLAGS();
            flags |= FZERO;
            continue format_sequence;

          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case '9':
            tmp_num = READ_NUM('width');
            if (format_string.charAt(i + 1) === '$') {
              if (i + 2 === len) {
                str = '%';
                i++;
                break format_sequence;
              }
              if (next_arg !== undefined) {
                self.$raise($scope.get('ArgumentError'), "value given twice - %" + (tmp_num) + "$")
              }
              next_arg = GET_POS_ARG(tmp_num);
              i++;
            } else {
              CHECK_FOR_WIDTH();
              flags |= FWIDTH;
              width = tmp_num;
            }
            continue format_sequence;

          case '<':
          case '\{':
            closing_brace_char = (format_string.charAt(i) === '<' ? '>' : '\}');
            hash_parameter_key = '';

            i++;

            for (;; i++) {
              if (i === len) {
                self.$raise($scope.get('ArgumentError'), "malformed name - unmatched parenthesis")
              }
              if (format_string.charAt(i) === closing_brace_char) {

                if (pos_arg_num > 0) {
                  self.$raise($scope.get('ArgumentError'), "named " + (hash_parameter_key) + " after unnumbered(" + (pos_arg_num) + ")")
                }
                if (pos_arg_num === -1) {
                  self.$raise($scope.get('ArgumentError'), "named " + (hash_parameter_key) + " after numbered")
                }
                pos_arg_num = -2;

                if (args[0] === undefined || !args[0].$$is_hash) {
                  self.$raise($scope.get('ArgumentError'), "one hash required")
                }

                next_arg = (args[0]).$fetch(hash_parameter_key);

                if (closing_brace_char === '>') {
                  continue format_sequence;
                } else {
                  str = next_arg.toString();
                  if (precision !== -1) { str = str.slice(0, precision); }
                  if (flags&FMINUS) {
                    while (str.length < width) { str = str + ' '; }
                  } else {
                    while (str.length < width) { str = ' ' + str; }
                  }
                  break format_sequence;
                }
              }
              hash_parameter_key += format_string.charAt(i);
            }

          case '*':
            i++;
            CHECK_FOR_WIDTH();
            flags |= FWIDTH;
            width = READ_NUM_AFTER_ASTER('width');
            if (width < 0) {
              flags |= FMINUS;
              width = -width;
            }
            continue format_sequence;

          case '.':
            if (flags&FPREC0) {
              self.$raise($scope.get('ArgumentError'), "precision given twice")
            }
            flags |= FPREC|FPREC0;
            precision = 0;
            i++;
            if (format_string.charAt(i) === '*') {
              i++;
              precision = READ_NUM_AFTER_ASTER('precision');
              if (precision < 0) {
                flags &= ~FPREC;
              }
              continue format_sequence;
            }
            precision = READ_NUM('precision');
            continue format_sequence;

          case 'd':
          case 'i':
          case 'u':
            arg = self.$Integer(GET_ARG());
            if (arg >= 0) {
              str = arg.toString();
              while (str.length < precision) { str = '0' + str; }
              if (flags&FMINUS) {
                if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && precision === -1) {
                  while (str.length < width - ((flags&FPLUS || flags&FSPACE) ? 1 : 0)) { str = '0' + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                } else {
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            } else {
              str = (-arg).toString();
              while (str.length < precision) { str = '0' + str; }
              if (flags&FMINUS) {
                str = '-' + str;
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && precision === -1) {
                  while (str.length < width - 1) { str = '0' + str; }
                  str = '-' + str;
                } else {
                  str = '-' + str;
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            }
            break format_sequence;

          case 'b':
          case 'B':
          case 'o':
          case 'x':
          case 'X':
            switch (format_string.charAt(i)) {
            case 'b':
            case 'B':
              base_number = 2;
              base_prefix = '0b';
              base_neg_zero_regex = /^1+/;
              base_neg_zero_digit = '1';
              break;
            case 'o':
              base_number = 8;
              base_prefix = '0';
              base_neg_zero_regex = /^3?7+/;
              base_neg_zero_digit = '7';
              break;
            case 'x':
            case 'X':
              base_number = 16;
              base_prefix = '0x';
              base_neg_zero_regex = /^f+/;
              base_neg_zero_digit = 'f';
              break;
            }
            arg = self.$Integer(GET_ARG());
            if (arg >= 0) {
              str = arg.toString(base_number);
              while (str.length < precision) { str = '0' + str; }
              if (flags&FMINUS) {
                if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                if (flags&FSHARP && arg !== 0) { str = base_prefix + str; }
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && precision === -1) {
                  while (str.length < width - ((flags&FPLUS || flags&FSPACE) ? 1 : 0) - ((flags&FSHARP && arg !== 0) ? base_prefix.length : 0)) { str = '0' + str; }
                  if (flags&FSHARP && arg !== 0) { str = base_prefix + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                } else {
                  if (flags&FSHARP && arg !== 0) { str = base_prefix + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            } else {
              if (flags&FPLUS || flags&FSPACE) {
                str = (-arg).toString(base_number);
                while (str.length < precision) { str = '0' + str; }
                if (flags&FMINUS) {
                  if (flags&FSHARP) { str = base_prefix + str; }
                  str = '-' + str;
                  while (str.length < width) { str = str + ' '; }
                } else {
                  if (flags&FZERO && precision === -1) {
                    while (str.length < width - 1 - (flags&FSHARP ? 2 : 0)) { str = '0' + str; }
                    if (flags&FSHARP) { str = base_prefix + str; }
                    str = '-' + str;
                  } else {
                    if (flags&FSHARP) { str = base_prefix + str; }
                    str = '-' + str;
                    while (str.length < width) { str = ' ' + str; }
                  }
                }
              } else {
                str = (arg >>> 0).toString(base_number).replace(base_neg_zero_regex, base_neg_zero_digit);
                while (str.length < precision - 2) { str = base_neg_zero_digit + str; }
                if (flags&FMINUS) {
                  str = '..' + str;
                  if (flags&FSHARP) { str = base_prefix + str; }
                  while (str.length < width) { str = str + ' '; }
                } else {
                  if (flags&FZERO && precision === -1) {
                    while (str.length < width - 2 - (flags&FSHARP ? base_prefix.length : 0)) { str = base_neg_zero_digit + str; }
                    str = '..' + str;
                    if (flags&FSHARP) { str = base_prefix + str; }
                  } else {
                    str = '..' + str;
                    if (flags&FSHARP) { str = base_prefix + str; }
                    while (str.length < width) { str = ' ' + str; }
                  }
                }
              }
            }
            if (format_string.charAt(i) === format_string.charAt(i).toUpperCase()) {
              str = str.toUpperCase();
            }
            break format_sequence;

          case 'f':
          case 'e':
          case 'E':
          case 'g':
          case 'G':
            arg = self.$Float(GET_ARG());
            if (arg >= 0 || isNaN(arg)) {
              if (arg === Infinity) {
                str = 'Inf';
              } else {
                switch (format_string.charAt(i)) {
                case 'f':
                  str = arg.toFixed(precision === -1 ? 6 : precision);
                  break;
                case 'e':
                case 'E':
                  str = arg.toExponential(precision === -1 ? 6 : precision);
                  break;
                case 'g':
                case 'G':
                  str = arg.toExponential();
                  exponent = parseInt(str.split('e')[1], 10);
                  if (!(exponent < -4 || exponent >= (precision === -1 ? 6 : precision))) {
                    str = arg.toPrecision(precision === -1 ? (flags&FSHARP ? 6 : undefined) : precision);
                  }
                  break;
                }
              }
              if (flags&FMINUS) {
                if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && arg !== Infinity && !isNaN(arg)) {
                  while (str.length < width - ((flags&FPLUS || flags&FSPACE) ? 1 : 0)) { str = '0' + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                } else {
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            } else {
              if (arg === -Infinity) {
                str = 'Inf';
              } else {
                switch (format_string.charAt(i)) {
                case 'f':
                  str = (-arg).toFixed(precision === -1 ? 6 : precision);
                  break;
                case 'e':
                case 'E':
                  str = (-arg).toExponential(precision === -1 ? 6 : precision);
                  break;
                case 'g':
                case 'G':
                  str = (-arg).toExponential();
                  exponent = parseInt(str.split('e')[1], 10);
                  if (!(exponent < -4 || exponent >= (precision === -1 ? 6 : precision))) {
                    str = (-arg).toPrecision(precision === -1 ? (flags&FSHARP ? 6 : undefined) : precision);
                  }
                  break;
                }
              }
              if (flags&FMINUS) {
                str = '-' + str;
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && arg !== -Infinity) {
                  while (str.length < width - 1) { str = '0' + str; }
                  str = '-' + str;
                } else {
                  str = '-' + str;
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            }
            if (format_string.charAt(i) === format_string.charAt(i).toUpperCase() && arg !== Infinity && arg !== -Infinity && !isNaN(arg)) {
              str = str.toUpperCase();
            }
            str = str.replace(/([eE][-+]?)([0-9])$/, '$10$2');
            break format_sequence;

          case 'a':
          case 'A':
            // Not implemented because there are no specs for this field type.
            self.$raise($scope.get('NotImplementedError'), "`A` and `a` format field types are not implemented in Opal yet")

          case 'c':
            arg = GET_ARG();
            if ((arg)['$respond_to?']("to_ary")) { arg = (arg).$to_ary()[0]; }
            if ((arg)['$respond_to?']("to_str")) {
              str = (arg).$to_str();
            } else {
              str = String.fromCharCode($scope.get('Opal').$coerce_to(arg, $scope.get('Integer'), "to_int"));
            }
            if (str.length !== 1) {
              self.$raise($scope.get('ArgumentError'), "%c requires a character")
            }
            if (flags&FMINUS) {
              while (str.length < width) { str = str + ' '; }
            } else {
              while (str.length < width) { str = ' ' + str; }
            }
            break format_sequence;

          case 'p':
            str = (GET_ARG()).$inspect();
            if (precision !== -1) { str = str.slice(0, precision); }
            if (flags&FMINUS) {
              while (str.length < width) { str = str + ' '; }
            } else {
              while (str.length < width) { str = ' ' + str; }
            }
            break format_sequence;

          case 's':
            str = (GET_ARG()).$to_s();
            if (precision !== -1) { str = str.slice(0, precision); }
            if (flags&FMINUS) {
              while (str.length < width) { str = str + ' '; }
            } else {
              while (str.length < width) { str = ' ' + str; }
            }
            break format_sequence;

          default:
            self.$raise($scope.get('ArgumentError'), "malformed format string - %" + (format_string.charAt(i)))
          }
        }

        if (str === undefined) {
          self.$raise($scope.get('ArgumentError'), "malformed format string - %")
        }

        result += format_string.slice(begin_slice, end_slice) + str;
        begin_slice = i + 1;
      }

      if ($gvars.DEBUG && pos_arg_num >= 0 && seq_arg_num < args.length) {
        self.$raise($scope.get('ArgumentError'), "too many arguments for format string")
      }

      return result + format_string.slice(begin_slice);
    ;
    });

    Opal.defn(self, '$hash', function() {
      var self = this;

      return self.$__id__();
    });

    Opal.defn(self, '$initialize_copy', function(other) {
      var self = this;

      return nil;
    });

    Opal.defn(self, '$inspect', function() {
      var self = this;

      return self.$to_s();
    });

    Opal.defn(self, '$instance_of?', function(klass) {
      var self = this;

      
      if (!klass.$$is_class && !klass.$$is_module) {
        self.$raise($scope.get('TypeError'), "class or module required");
      }

      return self.$$class === klass;
    ;
    });

    Opal.defn(self, '$instance_variable_defined?', function(name) {
      var self = this;

      name = $scope.get('Opal')['$instance_variable_name!'](name);
      return Opal.hasOwnProperty.call(self, name.substr(1));
    });

    Opal.defn(self, '$instance_variable_get', function(name) {
      var self = this;

      name = $scope.get('Opal')['$instance_variable_name!'](name);
      
      var ivar = self[Opal.ivar(name.substr(1))];

      return ivar == null ? nil : ivar;
    
    });

    Opal.defn(self, '$instance_variable_set', function(name, value) {
      var self = this;

      name = $scope.get('Opal')['$instance_variable_name!'](name);
      return self[Opal.ivar(name.substr(1))] = value;
    });

    Opal.defn(self, '$remove_instance_variable', function(name) {
      var self = this;

      name = $scope.get('Opal')['$instance_variable_name!'](name);
      
      var key = Opal.ivar(name.substr(1)),
          val;
      if (self.hasOwnProperty(key)) {
        val = self[key];
        delete self[key];
        return val;
      }
    
      return self.$raise($scope.get('NameError'), "instance variable " + (name) + " not defined");
    });

    Opal.defn(self, '$instance_variables', function() {
      var self = this;

      
      var result = [], ivar;

      for (var name in self) {
        if (self.hasOwnProperty(name) && name.charAt(0) !== '$') {
          if (name.substr(-1) === '$') {
            ivar = name.slice(0, name.length - 1);
          } else {
            ivar = name;
          }
          result.push('@' + ivar);
        }
      }

      return result;
    
    });

    Opal.defn(self, '$Integer', function(value, base) {
      var self = this;

      
      var i, str, base_digits;

      if (!value.$$is_string) {
        if (base !== undefined) {
          self.$raise($scope.get('ArgumentError'), "base specified for non string value")
        }
        if (value === nil) {
          self.$raise($scope.get('TypeError'), "can't convert nil into Integer")
        }
        if (value.$$is_number) {
          if (value === Infinity || value === -Infinity || isNaN(value)) {
            self.$raise($scope.get('FloatDomainError'), value)
          }
          return Math.floor(value);
        }
        if (value['$respond_to?']("to_int")) {
          i = value.$to_int();
          if (i !== nil) {
            return i;
          }
        }
        return $scope.get('Opal')['$coerce_to!'](value, $scope.get('Integer'), "to_i");
      }

      if (base === undefined) {
        base = 0;
      } else {
        base = $scope.get('Opal').$coerce_to(base, $scope.get('Integer'), "to_int");
        if (base === 1 || base < 0 || base > 36) {
          self.$raise($scope.get('ArgumentError'), "invalid radix " + (base))
        }
      }

      str = value.toLowerCase();

      str = str.replace(/(\d)_(?=\d)/g, '$1');

      str = str.replace(/^(\s*[+-]?)(0[bodx]?)/, function (_, head, flag) {
        switch (flag) {
        case '0b':
          if (base === 0 || base === 2) {
            base = 2;
            return head;
          }
        case '0':
        case '0o':
          if (base === 0 || base === 8) {
            base = 8;
            return head;
          }
        case '0d':
          if (base === 0 || base === 10) {
            base = 10;
            return head;
          }
        case '0x':
          if (base === 0 || base === 16) {
            base = 16;
            return head;
          }
        }
        self.$raise($scope.get('ArgumentError'), "invalid value for Integer(): \"" + (value) + "\"")
      });

      base = (base === 0 ? 10 : base);

      base_digits = '0-' + (base <= 10 ? base - 1 : '9a-' + String.fromCharCode(97 + (base - 11)));

      if (!(new RegExp('^\\s*[+-]?[' + base_digits + ']+\\s*$')).test(str)) {
        self.$raise($scope.get('ArgumentError'), "invalid value for Integer(): \"" + (value) + "\"")
      }

      i = parseInt(str, base);

      if (isNaN(i)) {
        self.$raise($scope.get('ArgumentError'), "invalid value for Integer(): \"" + (value) + "\"")
      }

      return i;
    ;
    });

    Opal.defn(self, '$Float', function(value) {
      var self = this;

      
      var str;

      if (value === nil) {
        self.$raise($scope.get('TypeError'), "can't convert nil into Float")
      }

      if (value.$$is_string) {
        str = value.toString();

        str = str.replace(/(\d)_(?=\d)/g, '$1');

        //Special case for hex strings only:
        if (/^\s*[-+]?0[xX][0-9a-fA-F]+\s*$/.test(str)) {
          return self.$Integer(str);
        }

        if (!/^\s*[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?\s*$/.test(str)) {
          self.$raise($scope.get('ArgumentError'), "invalid value for Float(): \"" + (value) + "\"")
        }

        return parseFloat(str);
      }

      return $scope.get('Opal')['$coerce_to!'](value, $scope.get('Float'), "to_f");
    
    });

    Opal.defn(self, '$Hash', function(arg) {
      var $a, $b, self = this;

      if ((($a = ((($b = arg['$nil?']()) !== false && $b !== nil) ? $b : arg['$==']([]))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return $hash2([], {})};
      if ((($a = $scope.get('Hash')['$==='](arg)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return arg};
      return $scope.get('Opal')['$coerce_to!'](arg, $scope.get('Hash'), "to_hash");
    });

    Opal.defn(self, '$is_a?', function(klass) {
      var self = this;

      
      if (!klass.$$is_class && !klass.$$is_module) {
        self.$raise($scope.get('TypeError'), "class or module required");
      }

      return Opal.is_a(self, klass);
    ;
    });

    Opal.alias(self, 'kind_of?', 'is_a?');

    Opal.defn(self, '$lambda', TMP_6 = function() {
      var self = this, $iter = TMP_6.$$p, block = $iter || nil;

      TMP_6.$$p = null;
      block.$$is_lambda = true;
      return block;
    });

    Opal.defn(self, '$load', function(file) {
      var self = this;

      file = $scope.get('Opal')['$coerce_to!'](file, $scope.get('String'), "to_str");
      return Opal.load(file);
    });

    Opal.defn(self, '$loop', TMP_7 = function() {
      var self = this, $iter = TMP_7.$$p, block = $iter || nil;

      TMP_7.$$p = null;
      
      while (true) {
        if (block() === $breaker) {
          return $breaker.$v;
        }
      }
    
      return self;
    });

    Opal.defn(self, '$nil?', function() {
      var self = this;

      return false;
    });

    Opal.alias(self, 'object_id', '__id__');

    Opal.defn(self, '$printf', function() {
      var $a, self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      if ((($a = $rb_gt(args.$length(), 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$print(($a = self).$format.apply($a, Opal.to_a(args)))};
      return nil;
    });

    Opal.defn(self, '$proc', TMP_8 = function() {
      var self = this, $iter = TMP_8.$$p, block = $iter || nil;

      TMP_8.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        self.$raise($scope.get('ArgumentError'), "tried to create Proc object without a block")
      };
      block.$$is_lambda = false;
      return block;
    });

    Opal.defn(self, '$puts', function() {
      var $a, self = this, $splat_index = nil;
      if ($gvars.stdout == null) $gvars.stdout = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var strs = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        strs[$splat_index] = arguments[$splat_index + 0];
      }
      return ($a = $gvars.stdout).$puts.apply($a, Opal.to_a(strs));
    });

    Opal.defn(self, '$p', function() {
      var $a, $b, TMP_9, self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      ($a = ($b = args).$each, $a.$$p = (TMP_9 = function(obj){var self = TMP_9.$$s || this;
        if ($gvars.stdout == null) $gvars.stdout = nil;
if (obj == null) obj = nil;
      return $gvars.stdout.$puts(obj.$inspect())}, TMP_9.$$s = self, TMP_9), $a).call($b);
      if ((($a = $rb_le(args.$length(), 1)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return args['$[]'](0)
        } else {
        return args
      };
    });

    Opal.defn(self, '$print', function() {
      var $a, self = this, $splat_index = nil;
      if ($gvars.stdout == null) $gvars.stdout = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var strs = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        strs[$splat_index] = arguments[$splat_index + 0];
      }
      return ($a = $gvars.stdout).$print.apply($a, Opal.to_a(strs));
    });

    Opal.defn(self, '$warn', function() {
      var $a, $b, self = this, $splat_index = nil;
      if ($gvars.VERBOSE == null) $gvars.VERBOSE = nil;
      if ($gvars.stderr == null) $gvars.stderr = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var strs = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        strs[$splat_index] = arguments[$splat_index + 0];
      }
      if ((($a = ((($b = $gvars.VERBOSE['$nil?']()) !== false && $b !== nil) ? $b : strs['$empty?']())) !== nil && (!$a.$$is_boolean || $a == true))) {
        return nil
        } else {
        return ($a = $gvars.stderr).$puts.apply($a, Opal.to_a(strs))
      };
    });

    Opal.defn(self, '$raise', function(exception, string, _backtrace) {
      var self = this;
      if ($gvars["!"] == null) $gvars["!"] = nil;

      if (string == null) {
        string = nil
      }
      if (_backtrace == null) {
        _backtrace = nil
      }
      
      if (exception == null && $gvars["!"] !== nil) {
        throw $gvars["!"];
      }
      if (exception == null) {
        exception = $scope.get('RuntimeError').$new();
      }
      else if (exception.$$is_string) {
        exception = $scope.get('RuntimeError').$new(exception);
      }
      // using respond_to? and not an undefined check to avoid method_missing matching as true
      else if (exception.$$is_class && exception['$respond_to?']("exception")) {
        exception = exception.$exception(string);
      }
      else if (exception['$kind_of?']($scope.get('Exception'))) {
        // exception is fine
      }
      else {
        exception = $scope.get('TypeError').$new("exception class/object expected");
      }

      if ($gvars["!"] !== nil) {
        Opal.exceptions.push($gvars["!"]);
      }

      $gvars["!"] = exception;

      throw exception;
    ;
    });

    Opal.alias(self, 'fail', 'raise');

    Opal.defn(self, '$rand', function(max) {
      var self = this;

      
      if (max === undefined) {
        return Math.random();
      }
      else if (max.$$is_range) {
        var min = max.begin, range = max.end - min;
        if(!max.exclude) range++;

        return self.$rand(range) + min;
      }
      else {
        return Math.floor(Math.random() *
          Math.abs($scope.get('Opal').$coerce_to(max, $scope.get('Integer'), "to_int")));
      }
    
    });

    Opal.defn(self, '$respond_to?', function(name, include_all) {
      var $a, self = this;

      if (include_all == null) {
        include_all = false
      }
      if ((($a = self['$respond_to_missing?'](name, include_all)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return true};
      
      var body = self['$' + name];

      if (typeof(body) === "function" && !body.$$stub) {
        return true;
      }
    
      return false;
    });

    Opal.defn(self, '$respond_to_missing?', function(method_name, include_all) {
      var self = this;

      if (include_all == null) {
        include_all = false
      }
      return false;
    });

    Opal.defn(self, '$require', function(file) {
      var self = this;

      file = $scope.get('Opal')['$coerce_to!'](file, $scope.get('String'), "to_str");
      return Opal.require(file);
    });

    Opal.defn(self, '$require_relative', function(file) {
      var self = this;

      $scope.get('Opal')['$try_convert!'](file, $scope.get('String'), "to_str");
      file = $scope.get('File').$expand_path($scope.get('File').$join(Opal.current_file, "..", file));
      return Opal.require(file);
    });

    Opal.defn(self, '$require_tree', function(path) {
      var self = this;

      path = $scope.get('File').$expand_path(path);
      if (path['$=='](".")) {
        path = ""};
      
      for (var name in Opal.modules) {
        if ((name)['$start_with?'](path)) {
          Opal.require(name);
        }
      }
    ;
      return nil;
    });

    Opal.alias(self, 'send', '__send__');

    Opal.alias(self, 'public_send', '__send__');

    Opal.defn(self, '$singleton_class', function() {
      var self = this;

      return Opal.get_singleton_class(self);
    });

    Opal.defn(self, '$sleep', function(seconds) {
      var self = this;

      if (seconds == null) {
        seconds = nil
      }
      
      if (seconds === nil) {
        self.$raise($scope.get('TypeError'), "can't convert NilClass into time interval")
      }
      if (!seconds.$$is_number) {
        self.$raise($scope.get('TypeError'), "can't convert " + (seconds.$class()) + " into time interval")
      }
      if (seconds < 0) {
        self.$raise($scope.get('ArgumentError'), "time interval must be positive")
      }
      var t = new Date();
      while (new Date() - t <= seconds * 1000);
      return seconds;
    ;
    });

    Opal.alias(self, 'sprintf', 'format');

    Opal.alias(self, 'srand', 'rand');

    Opal.defn(self, '$String', function(str) {
      var $a, self = this;

      return ((($a = $scope.get('Opal')['$coerce_to?'](str, $scope.get('String'), "to_str")) !== false && $a !== nil) ? $a : $scope.get('Opal')['$coerce_to!'](str, $scope.get('String'), "to_s"));
    });

    Opal.defn(self, '$tap', TMP_10 = function() {
      var self = this, $iter = TMP_10.$$p, block = $iter || nil;

      TMP_10.$$p = null;
      if (Opal.yield1(block, self) === $breaker) return $breaker.$v;
      return self;
    });

    Opal.defn(self, '$to_proc', function() {
      var self = this;

      return self;
    });

    Opal.defn(self, '$to_s', function() {
      var self = this;

      return "#<" + (self.$class()) + ":0x" + (self.$__id__().$to_s(16)) + ">";
    });

    Opal.defn(self, '$catch', TMP_11 = function(sym) {
      var $a, self = this, $iter = TMP_11.$$p, $yield = $iter || nil, e = nil;

      TMP_11.$$p = null;
      try {
      return $a = Opal.yieldX($yield, []), $a === $breaker ? $a : $a
      } catch ($err) {if (Opal.rescue($err, [$scope.get('UncaughtThrowError')])) {e = $err;
        try {
          if (e.$sym()['$=='](sym)) {
            return e.$arg()};
          return self.$raise();
        } finally {
          Opal.gvars["!"] = Opal.exceptions.pop() || Opal.nil;
        }
        }else { throw $err; }
      };
    });

    Opal.defn(self, '$throw', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      return self.$raise($scope.get('UncaughtThrowError').$new(args));
    });
  })($scope.base);
  return (function($base, $super) {
    function $Object(){};
    var self = $Object = $klass($base, $super, 'Object', $Object);

    var def = self.$$proto, $scope = self.$$scope;

    return self.$include($scope.get('Kernel'))
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/error"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module;

  Opal.add_stubs(['$new', '$clone', '$to_s', '$empty?', '$class', '$attr_reader', '$[]', '$>', '$length', '$inspect']);
  (function($base, $super) {
    function $Exception(){};
    var self = $Exception = $klass($base, $super, 'Exception', $Exception);

    var def = self.$$proto, $scope = self.$$scope;

    def.message = nil;
    Opal.defs(self, '$new', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      
      var message = (args.length > 0) ? args[0] : nil;
      var err = new self.$$alloc(message);

      if (Error.captureStackTrace) {
        Error.captureStackTrace(err);
      }

      err.name = self.$$name;
      err.$initialize.apply(err, args);
      return err;
    
    });

    Opal.defs(self, '$exception', function() {
      var $a, self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      return ($a = self).$new.apply($a, Opal.to_a(args));
    });

    Opal.defn(self, '$initialize', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      return self.message = (args.length > 0) ? args[0] : nil;
    });

    Opal.defn(self, '$backtrace', function() {
      var self = this;

      
      var backtrace = self.stack;

      if (typeof(backtrace) === 'string') {
        return backtrace.split("\n").slice(0, 15);
      }
      else if (backtrace) {
        return backtrace.slice(0, 15);
      }

      return [];
    
    });

    Opal.defn(self, '$exception', function(str) {
      var self = this;

      if (str == null) {
        str = nil
      }
      
      if (str === nil || self === str) {
        return self;
      }
      
      var cloned = self.$clone();
      cloned.message = str;
      return cloned;
    
    });

    Opal.defn(self, '$message', function() {
      var self = this;

      return self.$to_s();
    });

    Opal.defn(self, '$inspect', function() {
      var $a, self = this, as_str = nil;

      as_str = self.$to_s();
      if ((($a = as_str['$empty?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$class().$to_s()
        } else {
        return "#<" + (self.$class().$to_s()) + ": " + (self.$to_s()) + ">"
      };
    });

    return (Opal.defn(self, '$to_s', function() {
      var $a, $b, self = this;

      return ((($a = (($b = self.message, $b !== false && $b !== nil ?self.message.$to_s() : $b))) !== false && $a !== nil) ? $a : self.$class().$to_s());
    }), nil) && 'to_s';
  })($scope.base, Error);
  (function($base, $super) {
    function $ScriptError(){};
    var self = $ScriptError = $klass($base, $super, 'ScriptError', $ScriptError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $SyntaxError(){};
    var self = $SyntaxError = $klass($base, $super, 'SyntaxError', $SyntaxError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('ScriptError'));
  (function($base, $super) {
    function $LoadError(){};
    var self = $LoadError = $klass($base, $super, 'LoadError', $LoadError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('ScriptError'));
  (function($base, $super) {
    function $NotImplementedError(){};
    var self = $NotImplementedError = $klass($base, $super, 'NotImplementedError', $NotImplementedError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('ScriptError'));
  (function($base, $super) {
    function $SystemExit(){};
    var self = $SystemExit = $klass($base, $super, 'SystemExit', $SystemExit);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $NoMemoryError(){};
    var self = $NoMemoryError = $klass($base, $super, 'NoMemoryError', $NoMemoryError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $SignalException(){};
    var self = $SignalException = $klass($base, $super, 'SignalException', $SignalException);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $Interrupt(){};
    var self = $Interrupt = $klass($base, $super, 'Interrupt', $Interrupt);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $SecurityError(){};
    var self = $SecurityError = $klass($base, $super, 'SecurityError', $SecurityError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $StandardError(){};
    var self = $StandardError = $klass($base, $super, 'StandardError', $StandardError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $ZeroDivisionError(){};
    var self = $ZeroDivisionError = $klass($base, $super, 'ZeroDivisionError', $ZeroDivisionError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $NameError(){};
    var self = $NameError = $klass($base, $super, 'NameError', $NameError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $NoMethodError(){};
    var self = $NoMethodError = $klass($base, $super, 'NoMethodError', $NoMethodError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('NameError'));
  (function($base, $super) {
    function $RuntimeError(){};
    var self = $RuntimeError = $klass($base, $super, 'RuntimeError', $RuntimeError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $LocalJumpError(){};
    var self = $LocalJumpError = $klass($base, $super, 'LocalJumpError', $LocalJumpError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $TypeError(){};
    var self = $TypeError = $klass($base, $super, 'TypeError', $TypeError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $ArgumentError(){};
    var self = $ArgumentError = $klass($base, $super, 'ArgumentError', $ArgumentError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $IndexError(){};
    var self = $IndexError = $klass($base, $super, 'IndexError', $IndexError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $StopIteration(){};
    var self = $StopIteration = $klass($base, $super, 'StopIteration', $StopIteration);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('IndexError'));
  (function($base, $super) {
    function $KeyError(){};
    var self = $KeyError = $klass($base, $super, 'KeyError', $KeyError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('IndexError'));
  (function($base, $super) {
    function $RangeError(){};
    var self = $RangeError = $klass($base, $super, 'RangeError', $RangeError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $FloatDomainError(){};
    var self = $FloatDomainError = $klass($base, $super, 'FloatDomainError', $FloatDomainError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('RangeError'));
  (function($base, $super) {
    function $IOError(){};
    var self = $IOError = $klass($base, $super, 'IOError', $IOError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $SystemCallError(){};
    var self = $SystemCallError = $klass($base, $super, 'SystemCallError', $SystemCallError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base) {
    var $Errno, self = $Errno = $module($base, 'Errno');

    var def = self.$$proto, $scope = self.$$scope;

    (function($base, $super) {
      function $EINVAL(){};
      var self = $EINVAL = $klass($base, $super, 'EINVAL', $EINVAL);

      var def = self.$$proto, $scope = self.$$scope, TMP_1;

      return (Opal.defs(self, '$new', TMP_1 = function() {
        var self = this, $iter = TMP_1.$$p, $yield = $iter || nil;

        TMP_1.$$p = null;
        return Opal.find_super_dispatcher(self, 'new', TMP_1, null, $EINVAL).apply(self, ["Invalid argument"]);
      }), nil) && 'new'
    })($scope.base, $scope.get('SystemCallError'))
  })($scope.base);
  (function($base, $super) {
    function $UncaughtThrowError(){};
    var self = $UncaughtThrowError = $klass($base, $super, 'UncaughtThrowError', $UncaughtThrowError);

    var def = self.$$proto, $scope = self.$$scope, TMP_2;

    def.sym = nil;
    self.$attr_reader("sym", "arg");

    return (Opal.defn(self, '$initialize', TMP_2 = function(args) {
      var $a, self = this, $iter = TMP_2.$$p, $yield = $iter || nil;

      TMP_2.$$p = null;
      self.sym = args['$[]'](0);
      if ((($a = $rb_gt(args.$length(), 1)) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.arg = args['$[]'](1)};
      return Opal.find_super_dispatcher(self, 'initialize', TMP_2, null).apply(self, ["uncaught throw " + (self.sym.$inspect())]);
    }), nil) && 'initialize';
  })($scope.base, $scope.get('ArgumentError'));
  (function($base, $super) {
    function $NameError(){};
    var self = $NameError = $klass($base, $super, 'NameError', $NameError);

    var def = self.$$proto, $scope = self.$$scope, TMP_3;

    self.$attr_reader("name");

    return (Opal.defn(self, '$initialize', TMP_3 = function(message, name) {
      var self = this, $iter = TMP_3.$$p, $yield = $iter || nil;

      if (name == null) {
        name = nil
      }
      TMP_3.$$p = null;
      Opal.find_super_dispatcher(self, 'initialize', TMP_3, null).apply(self, [message]);
      return self.name = name;
    }), nil) && 'initialize';
  })($scope.base, null);
  return (function($base, $super) {
    function $NoMethodError(){};
    var self = $NoMethodError = $klass($base, $super, 'NoMethodError', $NoMethodError);

    var def = self.$$proto, $scope = self.$$scope, TMP_4;

    self.$attr_reader("args");

    return (Opal.defn(self, '$initialize', TMP_4 = function(message, name, args) {
      var self = this, $iter = TMP_4.$$p, $yield = $iter || nil;

      if (args == null) {
        args = []
      }
      TMP_4.$$p = null;
      Opal.find_super_dispatcher(self, 'initialize', TMP_4, null).apply(self, [message, name]);
      return self.args = args;
    }), nil) && 'initialize';
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/constants"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.cdecl($scope, 'RUBY_PLATFORM', "opal");
  Opal.cdecl($scope, 'RUBY_ENGINE', "opal");
  Opal.cdecl($scope, 'RUBY_VERSION', "2.2.3");
  Opal.cdecl($scope, 'RUBY_ENGINE_VERSION', "0.9.2");
  Opal.cdecl($scope, 'RUBY_RELEASE_DATE', "2016-01-10");
  Opal.cdecl($scope, 'RUBY_PATCHLEVEL', 0);
  Opal.cdecl($scope, 'RUBY_REVISION', 0);
  Opal.cdecl($scope, 'RUBY_COPYRIGHT', "opal - Copyright (C) 2013-2015 Adam Beynon");
  return Opal.cdecl($scope, 'RUBY_DESCRIPTION', "opal " + ($scope.get('RUBY_ENGINE_VERSION')) + " (" + ($scope.get('RUBY_RELEASE_DATE')) + " revision " + ($scope.get('RUBY_REVISION')) + ")");
};

/* Generated by Opal 0.9.2 */
Opal.modules["opal/base"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require']);
  self.$require("corelib/runtime");
  self.$require("corelib/helpers");
  self.$require("corelib/module");
  self.$require("corelib/class");
  self.$require("corelib/basic_object");
  self.$require("corelib/kernel");
  self.$require("corelib/error");
  return self.$require("corelib/constants");
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/nil"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$class', '$new', '$>', '$length', '$Rational']);
  (function($base, $super) {
    function $NilClass(){};
    var self = $NilClass = $klass($base, $super, 'NilClass', $NilClass);

    var def = self.$$proto, $scope = self.$$scope;

    def.$$meta = self;

    Opal.defn(self, '$!', function() {
      var self = this;

      return true;
    });

    Opal.defn(self, '$&', function(other) {
      var self = this;

      return false;
    });

    Opal.defn(self, '$|', function(other) {
      var self = this;

      return other !== false && other !== nil;
    });

    Opal.defn(self, '$^', function(other) {
      var self = this;

      return other !== false && other !== nil;
    });

    Opal.defn(self, '$==', function(other) {
      var self = this;

      return other === nil;
    });

    Opal.defn(self, '$dup', function() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't dup " + (self.$class()));
    });

    Opal.defn(self, '$clone', function() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't clone " + (self.$class()));
    });

    Opal.defn(self, '$inspect', function() {
      var self = this;

      return "nil";
    });

    Opal.defn(self, '$nil?', function() {
      var self = this;

      return true;
    });

    Opal.defn(self, '$singleton_class', function() {
      var self = this;

      return $scope.get('NilClass');
    });

    Opal.defn(self, '$to_a', function() {
      var self = this;

      return [];
    });

    Opal.defn(self, '$to_h', function() {
      var self = this;

      return Opal.hash();
    });

    Opal.defn(self, '$to_i', function() {
      var self = this;

      return 0;
    });

    Opal.alias(self, 'to_f', 'to_i');

    Opal.defn(self, '$to_s', function() {
      var self = this;

      return "";
    });

    Opal.defn(self, '$to_c', function() {
      var self = this;

      return $scope.get('Complex').$new(0, 0);
    });

    Opal.defn(self, '$rationalize', function() {
      var $a, self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      if ((($a = $rb_gt(args.$length(), 1)) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'))};
      return self.$Rational(0, 1);
    });

    Opal.defn(self, '$to_r', function() {
      var self = this;

      return self.$Rational(0, 1);
    });

    return (Opal.defn(self, '$instance_variables', function() {
      var self = this;

      return [];
    }), nil) && 'instance_variables';
  })($scope.base, null);
  return Opal.cdecl($scope, 'NIL', nil);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/boolean"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$class']);
  (function($base, $super) {
    function $Boolean(){};
    var self = $Boolean = $klass($base, $super, 'Boolean', $Boolean);

    var def = self.$$proto, $scope = self.$$scope;

    def.$$is_boolean = true;

    def.$$meta = self;

    Opal.defn(self, '$__id__', function() {
      var self = this;

      return self.valueOf() ? 2 : 0;
    });

    Opal.alias(self, 'object_id', '__id__');

    Opal.defn(self, '$!', function() {
      var self = this;

      return self != true;
    });

    Opal.defn(self, '$&', function(other) {
      var self = this;

      return (self == true) ? (other !== false && other !== nil) : false;
    });

    Opal.defn(self, '$|', function(other) {
      var self = this;

      return (self == true) ? true : (other !== false && other !== nil);
    });

    Opal.defn(self, '$^', function(other) {
      var self = this;

      return (self == true) ? (other === false || other === nil) : (other !== false && other !== nil);
    });

    Opal.defn(self, '$==', function(other) {
      var self = this;

      return (self == true) === other.valueOf();
    });

    Opal.alias(self, 'equal?', '==');

    Opal.alias(self, 'eql?', '==');

    Opal.defn(self, '$singleton_class', function() {
      var self = this;

      return $scope.get('Boolean');
    });

    Opal.defn(self, '$to_s', function() {
      var self = this;

      return (self == true) ? 'true' : 'false';
    });

    Opal.defn(self, '$dup', function() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't dup " + (self.$class()));
    });

    return (Opal.defn(self, '$clone', function() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't clone " + (self.$class()));
    }), nil) && 'clone';
  })($scope.base, Boolean);
  Opal.cdecl($scope, 'TrueClass', $scope.get('Boolean'));
  Opal.cdecl($scope, 'FalseClass', $scope.get('Boolean'));
  Opal.cdecl($scope, 'TRUE', true);
  return Opal.cdecl($scope, 'FALSE', false);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/comparable"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$===', '$>', '$<', '$equal?', '$<=>', '$normalize', '$raise', '$class']);
  return (function($base) {
    var $Comparable, self = $Comparable = $module($base, 'Comparable');

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defs(self, '$normalize', function(what) {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](what)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return what};
      if ((($a = $rb_gt(what, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return 1};
      if ((($a = $rb_lt(what, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return -1};
      return 0;
    });

    Opal.defn(self, '$==', function(other) {
      var $a, self = this, cmp = nil;

      try {
      if ((($a = self['$equal?'](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
          return true};
        
      if (self["$<=>"] == Opal.Kernel["$<=>"]) {
        return false;
      }

      // check for infinite recursion
      if (self.$$comparable) {
        delete self.$$comparable;
        return false;
      }
    
        if ((($a = cmp = (self['$<=>'](other))) !== nil && (!$a.$$is_boolean || $a == true))) {
          } else {
          return false
        };
        return $scope.get('Comparable').$normalize(cmp) == 0;
      } catch ($err) {if (Opal.rescue($err, [$scope.get('StandardError')])) {
        try {
          return false
        } finally {
          Opal.gvars["!"] = Opal.exceptions.pop() || Opal.nil;
        }
        }else { throw $err; }
      };
    });

    Opal.defn(self, '$>', function(other) {
      var $a, self = this, cmp = nil;

      if ((($a = cmp = (self['$<=>'](other))) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return $scope.get('Comparable').$normalize(cmp) > 0;
    });

    Opal.defn(self, '$>=', function(other) {
      var $a, self = this, cmp = nil;

      if ((($a = cmp = (self['$<=>'](other))) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return $scope.get('Comparable').$normalize(cmp) >= 0;
    });

    Opal.defn(self, '$<', function(other) {
      var $a, self = this, cmp = nil;

      if ((($a = cmp = (self['$<=>'](other))) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return $scope.get('Comparable').$normalize(cmp) < 0;
    });

    Opal.defn(self, '$<=', function(other) {
      var $a, self = this, cmp = nil;

      if ((($a = cmp = (self['$<=>'](other))) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return $scope.get('Comparable').$normalize(cmp) <= 0;
    });

    Opal.defn(self, '$between?', function(min, max) {
      var self = this;

      if ($rb_lt(self, min)) {
        return false};
      if ($rb_gt(self, max)) {
        return false};
      return true;
    });
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/regexp"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$nil?', '$[]', '$raise', '$escape', '$options', '$to_str', '$new', '$join', '$coerce_to!', '$!', '$match', '$coerce_to?', '$begin', '$coerce_to', '$call', '$=~', '$attr_reader', '$===', '$inspect', '$to_a']);
  (function($base, $super) {
    function $RegexpError(){};
    var self = $RegexpError = $klass($base, $super, 'RegexpError', $RegexpError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $Regexp(){};
    var self = $Regexp = $klass($base, $super, 'Regexp', $Regexp);

    var def = self.$$proto, $scope = self.$$scope, TMP_2;

    Opal.cdecl($scope, 'IGNORECASE', 1);

    Opal.cdecl($scope, 'MULTILINE', 4);

    def.$$is_regexp = true;

    (function(self) {
      var $scope = self.$$scope, def = self.$$proto, TMP_1;

      Opal.defn(self, '$allocate', TMP_1 = function() {
        var self = this, $iter = TMP_1.$$p, $yield = $iter || nil, allocated = nil, $zuper = nil, $zuper_index = nil;

        TMP_1.$$p = null;
        $zuper = [];
        for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
          $zuper[$zuper_index] = arguments[$zuper_index];
        }
        allocated = Opal.find_super_dispatcher(self, 'allocate', TMP_1, $iter).apply(self, $zuper);
        allocated.uninitialized = true;
        return allocated;
      });
      Opal.defn(self, '$escape', function(string) {
        var self = this;

        
        return string.replace(/([-[\]\/{}()*+?.^$\\| ])/g, '\\$1')
                     .replace(/[\n]/g, '\\n')
                     .replace(/[\r]/g, '\\r')
                     .replace(/[\f]/g, '\\f')
                     .replace(/[\t]/g, '\\t');
      
      });
      Opal.defn(self, '$last_match', function(n) {
        var $a, self = this;
        if ($gvars["~"] == null) $gvars["~"] = nil;

        if (n == null) {
          n = nil
        }
        if ((($a = n['$nil?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
          return $gvars["~"]
          } else {
          return $gvars["~"]['$[]'](n)
        };
      });
      Opal.alias(self, 'quote', 'escape');
      Opal.defn(self, '$union', function() {
        var self = this, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var parts = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          parts[$splat_index] = arguments[$splat_index + 0];
        }
        
        var is_first_part_array, quoted_validated, part, options, each_part_options;
        if (parts.length == 0) {
          return /(?!)/;
        }
        // cover the 2 arrays passed as arguments case
        is_first_part_array = parts[0].$$is_array;
        if (parts.length > 1 && is_first_part_array) {
          self.$raise($scope.get('TypeError'), "no implicit conversion of Array into String")
        }        
        // deal with splat issues (related to https://github.com/opal/opal/issues/858)
        if (is_first_part_array) {
          parts = parts[0];
        }
        options = undefined;
        quoted_validated = [];
        for (var i=0; i < parts.length; i++) {
          part = parts[i];
          if (part.$$is_string) {
            quoted_validated.push(self.$escape(part));
          }
          else if (part.$$is_regexp) {
            each_part_options = (part).$options();
            if (options != undefined && options != each_part_options) {
              self.$raise($scope.get('TypeError'), "All expressions must use the same options")
            }
            options = each_part_options;
            quoted_validated.push('('+part.source+')');
          }
          else {
            quoted_validated.push(self.$escape((part).$to_str()));
          }
        }
      
        return self.$new((quoted_validated).$join("|"), options);
      });
      return (Opal.defn(self, '$new', function(regexp, options) {
        var self = this;

        
        if (regexp.$$is_regexp) {
          return new RegExp(regexp);
        }

        regexp = $scope.get('Opal')['$coerce_to!'](regexp, $scope.get('String'), "to_str");

        if (regexp.charAt(regexp.length - 1) === '\\') {
          self.$raise($scope.get('RegexpError'), "too short escape sequence: /" + (regexp) + "/")
        }

        if (options === undefined || options['$!']()) {
          return new RegExp(regexp);
        }

        if (options.$$is_number) {
          var temp = '';
          if ($scope.get('IGNORECASE') & options) { temp += 'i'; }
          if ($scope.get('MULTILINE')  & options) { temp += 'm'; }
          options = temp;
        }
        else {
          options = 'i';
        }

        return new RegExp(regexp, options);
      ;
      }), nil) && 'new';
    })(Opal.get_singleton_class(self));

    Opal.defn(self, '$==', function(other) {
      var self = this;

      return other.constructor == RegExp && self.toString() === other.toString();
    });

    Opal.defn(self, '$===', function(string) {
      var self = this;

      return self.$match($scope.get('Opal')['$coerce_to?'](string, $scope.get('String'), "to_str")) !== nil;
    });

    Opal.defn(self, '$=~', function(string) {
      var $a, self = this;
      if ($gvars["~"] == null) $gvars["~"] = nil;

      return ($a = self.$match(string), $a !== false && $a !== nil ?$gvars["~"].$begin(0) : $a);
    });

    Opal.alias(self, 'eql?', '==');

    Opal.defn(self, '$inspect', function() {
      var self = this;

      return self.toString();
    });

    Opal.defn(self, '$match', TMP_2 = function(string, pos) {
      var self = this, $iter = TMP_2.$$p, block = $iter || nil;
      if ($gvars["~"] == null) $gvars["~"] = nil;

      TMP_2.$$p = null;
      
      if (self.uninitialized) {
        self.$raise($scope.get('TypeError'), "uninitialized Regexp")
      }

      if (pos === undefined) {
        pos = 0;
      } else {
        pos = $scope.get('Opal').$coerce_to(pos, $scope.get('Integer'), "to_int");
      }

      if (string === nil) {
        return $gvars["~"] = nil;
      }

      string = $scope.get('Opal').$coerce_to(string, $scope.get('String'), "to_str");

      if (pos < 0) {
        pos += string.length;
        if (pos < 0) {
          return $gvars["~"] = nil;
        }
      }

      var source = self.source;
      var flags = 'g';
      // m flag + a . in Ruby will match white space, but in JS, it only matches beginning/ending of lines, so we get the equivalent here
      if (self.multiline) {
        source = source.replace('.', "[\\s\\S]");
        flags += 'm';
      }

      // global RegExp maintains state, so not using self/this
      var md, re = new RegExp(source, flags + (self.ignoreCase ? 'i' : ''));

      while (true) {
        md = re.exec(string);
        if (md === null) {
          return $gvars["~"] = nil;
        }
        if (md.index >= pos) {
          $gvars["~"] = $scope.get('MatchData').$new(re, md)
          return block === nil ? $gvars["~"] : block.$call($gvars["~"]);
        }
        re.lastIndex = md.index + 1;
      }
    ;
    });

    Opal.defn(self, '$~', function() {
      var self = this;
      if ($gvars._ == null) $gvars._ = nil;

      return self['$=~']($gvars._);
    });

    Opal.defn(self, '$source', function() {
      var self = this;

      return self.source;
    });

    Opal.defn(self, '$options', function() {
      var self = this;

      
      if (self.uninitialized) {
        self.$raise($scope.get('TypeError'), "uninitialized Regexp")
      }
      var result = 0;
      // should be supported in IE6 according to https://msdn.microsoft.com/en-us/library/7f5z26w4(v=vs.94).aspx
      if (self.multiline) {
        result |= $scope.get('MULTILINE');
      }
      if (self.ignoreCase) {
        result |= $scope.get('IGNORECASE');
      }
      return result;
    ;
    });

    Opal.defn(self, '$casefold?', function() {
      var self = this;

      return self.ignoreCase;
    });

    return Opal.alias(self, 'to_s', 'source');
  })($scope.base, RegExp);
  return (function($base, $super) {
    function $MatchData(){};
    var self = $MatchData = $klass($base, $super, 'MatchData', $MatchData);

    var def = self.$$proto, $scope = self.$$scope;

    def.matches = nil;
    self.$attr_reader("post_match", "pre_match", "regexp", "string");

    Opal.defn(self, '$initialize', function(regexp, match_groups) {
      var self = this;

      $gvars["~"] = self;
      self.regexp = regexp;
      self.begin = match_groups.index;
      self.string = match_groups.input;
      self.pre_match = match_groups.input.slice(0, match_groups.index);
      self.post_match = match_groups.input.slice(match_groups.index + match_groups[0].length);
      self.matches = [];
      
      for (var i = 0, length = match_groups.length; i < length; i++) {
        var group = match_groups[i];

        if (group == null) {
          self.matches.push(nil);
        }
        else {
          self.matches.push(group);
        }
      }
    
    });

    Opal.defn(self, '$[]', function() {
      var $a, self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      return ($a = self.matches)['$[]'].apply($a, Opal.to_a(args));
    });

    Opal.defn(self, '$offset', function(n) {
      var self = this;

      
      if (n !== 0) {
        self.$raise($scope.get('ArgumentError'), "MatchData#offset only supports 0th element")
      }
      return [self.begin, self.begin + self.matches[n].length];
    ;
    });

    Opal.defn(self, '$==', function(other) {
      var $a, $b, $c, $d, self = this;

      if ((($a = $scope.get('MatchData')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      return ($a = ($b = ($c = ($d = self.string == other.string, $d !== false && $d !== nil ?self.regexp.toString() == other.regexp.toString() : $d), $c !== false && $c !== nil ?self.pre_match == other.pre_match : $c), $b !== false && $b !== nil ?self.post_match == other.post_match : $b), $a !== false && $a !== nil ?self.begin == other.begin : $a);
    });

    Opal.alias(self, 'eql?', '==');

    Opal.defn(self, '$begin', function(n) {
      var self = this;

      
      if (n !== 0) {
        self.$raise($scope.get('ArgumentError'), "MatchData#begin only supports 0th element")
      }
      return self.begin;
    ;
    });

    Opal.defn(self, '$end', function(n) {
      var self = this;

      
      if (n !== 0) {
        self.$raise($scope.get('ArgumentError'), "MatchData#end only supports 0th element")
      }
      return self.begin + self.matches[n].length;
    ;
    });

    Opal.defn(self, '$captures', function() {
      var self = this;

      return self.matches.slice(1);
    });

    Opal.defn(self, '$inspect', function() {
      var self = this;

      
      var str = "#<MatchData " + (self.matches[0]).$inspect();

      for (var i = 1, length = self.matches.length; i < length; i++) {
        str += " " + i + ":" + (self.matches[i]).$inspect();
      }

      return str + ">";
    ;
    });

    Opal.defn(self, '$length', function() {
      var self = this;

      return self.matches.length;
    });

    Opal.alias(self, 'size', 'length');

    Opal.defn(self, '$to_a', function() {
      var self = this;

      return self.matches;
    });

    Opal.defn(self, '$to_s', function() {
      var self = this;

      return self.matches[0];
    });

    return (Opal.defn(self, '$values_at', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      
      var i, a, index, values = [];

      for (i = 0; i < args.length; i++) {

        if (args[i].$$is_range) {
          a = (args[i]).$to_a();
          a.unshift(i, 1);
          Array.prototype.splice.apply(args, a);
        }

        index = $scope.get('Opal')['$coerce_to!'](args[i], $scope.get('Integer'), "to_int");

        if (index < 0) {
          index += self.matches.length;
          if (index < 0) {
            values.push(nil);
            continue;
          }
        }

        values.push(self.matches[index]);
      }

      return values;
    
    }), nil) && 'values_at';
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/string"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$include', '$coerce_to?', '$coerce_to', '$raise', '$===', '$format', '$to_s', '$respond_to?', '$to_str', '$<=>', '$==', '$=~', '$new', '$empty?', '$ljust', '$ceil', '$/', '$+', '$rjust', '$floor', '$to_a', '$each_char', '$to_proc', '$coerce_to!', '$copy_singleton_methods', '$initialize_clone', '$initialize_dup', '$enum_for', '$size', '$chomp', '$[]', '$to_i', '$class', '$each_line', '$match', '$captures', '$proc', '$shift', '$__send__', '$succ', '$escape']);
  self.$require("corelib/comparable");
  self.$require("corelib/regexp");
  (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_11;

    def.length = nil;
    self.$include($scope.get('Comparable'));

    def.$$is_string = true;

    Opal.defn(self, '$__id__', function() {
      var self = this;

      return self.toString();
    });

    Opal.alias(self, 'object_id', '__id__');

    Opal.defs(self, '$try_convert', function(what) {
      var self = this;

      return $scope.get('Opal')['$coerce_to?'](what, $scope.get('String'), "to_str");
    });

    Opal.defs(self, '$new', function(str) {
      var self = this;

      if (str == null) {
        str = ""
      }
      str = $scope.get('Opal').$coerce_to(str, $scope.get('String'), "to_str");
      return new String(str);
    });

    Opal.defn(self, '$initialize', function(str) {
      var self = this;

      
      if (str === undefined) {
        return self;
      }
    
      return self.$raise($scope.get('NotImplementedError'), "Mutable strings are not supported in Opal.");
    });

    Opal.defn(self, '$%', function(data) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](data)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return ($a = self).$format.apply($a, [self].concat(Opal.to_a(data)))
        } else {
        return self.$format(self, data)
      };
    });

    Opal.defn(self, '$*', function(count) {
      var self = this;

      
      count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");

      if (count < 0) {
        self.$raise($scope.get('ArgumentError'), "negative argument")
      }

      if (count === 0) {
        return '';
      }

      var result = '',
          string = self.toString();

      // All credit for the bit-twiddling magic code below goes to Mozilla
      // polyfill implementation of String.prototype.repeat() posted here:
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat

      if (string.length * count >= 1 << 28) {
        self.$raise($scope.get('RangeError'), "multiply count must not overflow maximum string size")
      }

      for (;;) {
        if ((count & 1) === 1) {
          result += string;
        }
        count >>>= 1;
        if (count === 0) {
          break;
        }
        string += string;
      }

      return result;
    ;
    });

    Opal.defn(self, '$+', function(other) {
      var self = this;

      other = $scope.get('Opal').$coerce_to(other, $scope.get('String'), "to_str");
      return self + other.$to_s();
    });

    Opal.defn(self, '$<=>', function(other) {
      var $a, self = this;

      if ((($a = other['$respond_to?']("to_str")) !== nil && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_str().$to_s();
        return self > other ? 1 : (self < other ? -1 : 0);
        } else {
        
        var cmp = other['$<=>'](self);

        if (cmp === nil) {
          return nil;
        }
        else {
          return cmp > 0 ? -1 : (cmp < 0 ? 1 : 0);
        }
      ;
      };
    });

    Opal.defn(self, '$==', function(other) {
      var self = this;

      
      if (other.$$is_string) {
        return self.toString() === other.toString();
      }
      if ($scope.get('Opal')['$respond_to?'](other, "to_str")) {
        return other['$=='](self);
      }
      return false;
    ;
    });

    Opal.alias(self, 'eql?', '==');

    Opal.alias(self, '===', '==');

    Opal.defn(self, '$=~', function(other) {
      var self = this;

      
      if (other.$$is_string) {
        self.$raise($scope.get('TypeError'), "type mismatch: String given");
      }

      return other['$=~'](self);
    ;
    });

    Opal.defn(self, '$[]', function(index, length) {
      var self = this;

      
      var size = self.length, exclude;

      if (index.$$is_range) {
        exclude = index.exclude;
        length  = $scope.get('Opal').$coerce_to(index.end, $scope.get('Integer'), "to_int");
        index   = $scope.get('Opal').$coerce_to(index.begin, $scope.get('Integer'), "to_int");

        if (Math.abs(index) > size) {
          return nil;
        }

        if (index < 0) {
          index += size;
        }

        if (length < 0) {
          length += size;
        }

        if (!exclude) {
          length += 1;
        }

        length = length - index;

        if (length < 0) {
          length = 0;
        }

        return self.substr(index, length);
      }


      if (index.$$is_string) {
        if (length != null) {
          self.$raise($scope.get('TypeError'))
        }
        return self.indexOf(index) !== -1 ? index : nil;
      }


      if (index.$$is_regexp) {
        var match = self.match(index);

        if (match === null) {
          $gvars["~"] = nil
          return nil;
        }

        $gvars["~"] = $scope.get('MatchData').$new(index, match)

        if (length == null) {
          return match[0];
        }

        length = $scope.get('Opal').$coerce_to(length, $scope.get('Integer'), "to_int");

        if (length < 0 && -length < match.length) {
          return match[length += match.length];
        }

        if (length >= 0 && length < match.length) {
          return match[length];
        }

        return nil;
      }


      index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");

      if (index < 0) {
        index += size;
      }

      if (length == null) {
        if (index >= size || index < 0) {
          return nil;
        }
        return self.substr(index, 1);
      }

      length = $scope.get('Opal').$coerce_to(length, $scope.get('Integer'), "to_int");

      if (length < 0) {
        return nil;
      }

      if (index > size || index < 0) {
        return nil;
      }

      return self.substr(index, length);
    
    });

    Opal.alias(self, 'byteslice', '[]');

    Opal.defn(self, '$capitalize', function() {
      var self = this;

      return self.charAt(0).toUpperCase() + self.substr(1).toLowerCase();
    });

    Opal.defn(self, '$casecmp', function(other) {
      var self = this;

      other = $scope.get('Opal').$coerce_to(other, $scope.get('String'), "to_str").$to_s();
      
      var ascii_only = /^[\x00-\x7F]*$/;
      if (ascii_only.test(self) && ascii_only.test(other)) {
        self = self.toLowerCase();
        other = other.toLowerCase();
      }
    
      return self['$<=>'](other);
    });

    Opal.defn(self, '$center', function(width, padstr) {
      var $a, self = this;

      if (padstr == null) {
        padstr = " "
      }
      width = $scope.get('Opal').$coerce_to(width, $scope.get('Integer'), "to_int");
      padstr = $scope.get('Opal').$coerce_to(padstr, $scope.get('String'), "to_str").$to_s();
      if ((($a = padstr['$empty?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "zero width padding")};
      if ((($a = width <= self.length) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      var ljustified = self.$ljust($rb_divide(($rb_plus(width, self.length)), 2).$ceil(), padstr),
          rjustified = self.$rjust($rb_divide(($rb_plus(width, self.length)), 2).$floor(), padstr);

      return rjustified + ljustified.slice(self.length);
    ;
    });

    Opal.defn(self, '$chars', TMP_1 = function() {
      var $a, $b, self = this, $iter = TMP_1.$$p, block = $iter || nil;

      TMP_1.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return self.$each_char().$to_a()
      };
      return ($a = ($b = self).$each_char, $a.$$p = block.$to_proc(), $a).call($b);
    });

    Opal.defn(self, '$chomp', function(separator) {
      var $a, self = this;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"]
      }
      if ((($a = separator === nil || self.length === 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self};
      separator = $scope.get('Opal')['$coerce_to!'](separator, $scope.get('String'), "to_str").$to_s();
      
      if (separator === "\n") {
        return self.replace(/\r?\n?$/, '');
      }
      else if (separator === "") {
        return self.replace(/(\r?\n)+$/, '');
      }
      else if (self.length > separator.length) {
        var tail = self.substr(self.length - separator.length, separator.length);

        if (tail === separator) {
          return self.substr(0, self.length - separator.length);
        }
      }
    
      return self;
    });

    Opal.defn(self, '$chop', function() {
      var self = this;

      
      var length = self.length;

      if (length <= 1) {
        return "";
      }

      if (self.charAt(length - 1) === "\n" && self.charAt(length - 2) === "\r") {
        return self.substr(0, length - 2);
      }
      else {
        return self.substr(0, length - 1);
      }
    
    });

    Opal.defn(self, '$chr', function() {
      var self = this;

      return self.charAt(0);
    });

    Opal.defn(self, '$clone', function() {
      var self = this, copy = nil;

      copy = self.slice();
      copy.$copy_singleton_methods(self);
      copy.$initialize_clone(self);
      return copy;
    });

    Opal.defn(self, '$dup', function() {
      var self = this, copy = nil;

      copy = self.slice();
      copy.$initialize_dup(self);
      return copy;
    });

    Opal.defn(self, '$count', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var sets = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        sets[$splat_index] = arguments[$splat_index + 0];
      }
      
      if (sets.length === 0) {
        self.$raise($scope.get('ArgumentError'), "ArgumentError: wrong number of arguments (0 for 1+)")
      }
      var char_class = char_class_from_char_sets(sets);
      if (char_class === null) {
        return 0;
      }
      return self.length - self.replace(new RegExp(char_class, 'g'), '').length;
    ;
    });

    Opal.defn(self, '$delete', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var sets = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        sets[$splat_index] = arguments[$splat_index + 0];
      }
      
      if (sets.length === 0) {
        self.$raise($scope.get('ArgumentError'), "ArgumentError: wrong number of arguments (0 for 1+)")
      }
      var char_class = char_class_from_char_sets(sets);
      if (char_class === null) {
        return self;
      }
      return self.replace(new RegExp(char_class, 'g'), '');
    ;
    });

    Opal.defn(self, '$downcase', function() {
      var self = this;

      return self.toLowerCase();
    });

    Opal.defn(self, '$each_char', TMP_2 = function() {
      var $a, $b, TMP_3, self = this, $iter = TMP_2.$$p, block = $iter || nil;

      TMP_2.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_3 = function(){var self = TMP_3.$$s || this;

        return self.$size()}, TMP_3.$$s = self, TMP_3), $a).call($b, "each_char")
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, self.charAt(i));

        if (value === $breaker) {
          return $breaker.$v;
        }
      }
    
      return self;
    });

    Opal.defn(self, '$each_line', TMP_4 = function(separator) {
      var self = this, $iter = TMP_4.$$p, block = $iter || nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"]
      }
      TMP_4.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("each_line", separator)
      };
      
      var value;

      if (separator === nil) {
        value = Opal.yield1(block, self);

        if (value === $breaker) {
          return value.$v;
        }
        else {
          return self;
        }
      }

      separator = $scope.get('Opal').$coerce_to(separator, $scope.get('String'), "to_str")

      var a, i, n, length, chomped, trailing, splitted;

      if (separator.length === 0) {
        for (a = self.split(/(\n{2,})/), i = 0, n = a.length; i < n; i += 2) {
          if (a[i] || a[i + 1]) {
            value = Opal.yield1(block, (a[i] || "") + (a[i + 1] || ""));

            if (value === $breaker) {
              return value.$v;
            }
          }
        }

        return self;
      }

      chomped  = self.$chomp(separator);
      trailing = self.length != chomped.length;
      splitted = chomped.split(separator);

      for (i = 0, length = splitted.length; i < length; i++) {
        if (i < length - 1 || trailing) {
          value = Opal.yield1(block, splitted[i] + separator);

          if (value === $breaker) {
            return value.$v;
          }
        }
        else {
          value = Opal.yield1(block, splitted[i]);

          if (value === $breaker) {
            return value.$v;
          }
        }
      }
    
      return self;
    });

    Opal.defn(self, '$empty?', function() {
      var self = this;

      return self.length === 0;
    });

    Opal.defn(self, '$end_with?', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var suffixes = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        suffixes[$splat_index] = arguments[$splat_index + 0];
      }
      
      for (var i = 0, length = suffixes.length; i < length; i++) {
        var suffix = $scope.get('Opal').$coerce_to(suffixes[i], $scope.get('String'), "to_str").$to_s();

        if (self.length >= suffix.length &&
            self.substr(self.length - suffix.length, suffix.length) == suffix) {
          return true;
        }
      }
    
      return false;
    });

    Opal.alias(self, 'eql?', '==');

    Opal.alias(self, 'equal?', '===');

    Opal.defn(self, '$gsub', TMP_5 = function(pattern, replacement) {
      var self = this, $iter = TMP_5.$$p, block = $iter || nil;

      TMP_5.$$p = null;
      
      if (replacement === undefined && block === nil) {
        return self.$enum_for("gsub", pattern);
      }

      var result = '', match_data = nil, index = 0, match, _replacement;

      if (pattern.$$is_regexp) {
        pattern = new RegExp(pattern.source, 'gm' + (pattern.ignoreCase ? 'i' : ''));
      } else {
        pattern = $scope.get('Opal').$coerce_to(pattern, $scope.get('String'), "to_str");
        pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
      }

      while (true) {
        match = pattern.exec(self);

        if (match === null) {
          $gvars["~"] = nil
          result += self.slice(index);
          break;
        }

        match_data = $scope.get('MatchData').$new(pattern, match);

        if (replacement === undefined) {
          _replacement = block(match[0]);
        }
        else if (replacement.$$is_hash) {
          _replacement = (replacement)['$[]'](match[0]).$to_s();
        }
        else {
          if (!replacement.$$is_string) {
            replacement = $scope.get('Opal').$coerce_to(replacement, $scope.get('String'), "to_str");
          }
          _replacement = replacement.replace(/([\\]+)([0-9+&`'])/g, function (original, slashes, command) {
            if (slashes.length % 2 === 0) {
              return original;
            }
            switch (command) {
            case "+":
              for (var i = match.length - 1; i > 0; i--) {
                if (match[i] !== undefined) {
                  return slashes.slice(1) + match[i];
                }
              }
              return '';
            case "&": return slashes.slice(1) + match[0];
            case "`": return slashes.slice(1) + self.slice(0, match.index);
            case "'": return slashes.slice(1) + self.slice(match.index + match[0].length);
            default:  return slashes.slice(1) + (match[command] || '');
            }
          }).replace(/\\\\/g, '\\');
        }

        if (pattern.lastIndex === match.index) {
          result += (_replacement + self.slice(index, match.index + 1))
          pattern.lastIndex += 1;
        }
        else {
          result += (self.slice(index, match.index) + _replacement)
        }
        index = pattern.lastIndex;
      }

      $gvars["~"] = match_data
      return result;
    ;
    });

    Opal.defn(self, '$hash', function() {
      var self = this;

      return self.toString();
    });

    Opal.defn(self, '$hex', function() {
      var self = this;

      return self.$to_i(16);
    });

    Opal.defn(self, '$include?', function(other) {
      var $a, self = this;

      
      if (other.$$is_string) {
        return self.indexOf(other) !== -1;
      }
    
      if ((($a = other['$respond_to?']("to_str")) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "no implicit conversion of " + (other.$class()) + " into String")
      };
      return self.indexOf(other.$to_str()) !== -1;
    });

    Opal.defn(self, '$index', function(search, offset) {
      var self = this;

      
      var index,
          match,
          regex;

      if (offset === undefined) {
        offset = 0;
      } else {
        offset = $scope.get('Opal').$coerce_to(offset, $scope.get('Integer'), "to_int");
        if (offset < 0) {
          offset += self.length;
          if (offset < 0) {
            return nil;
          }
        }
      }

      if (search.$$is_regexp) {
        regex = new RegExp(search.source, 'gm' + (search.ignoreCase ? 'i' : ''));
        while (true) {
          match = regex.exec(self);
          if (match === null) {
            $gvars["~"] = nil;
            index = -1;
            break;
          }
          if (match.index >= offset) {
            $gvars["~"] = $scope.get('MatchData').$new(regex, match)
            index = match.index;
            break;
          }
          regex.lastIndex = match.index + 1;
        }
      } else {
        search = $scope.get('Opal').$coerce_to(search, $scope.get('String'), "to_str");
        if (search.length === 0 && offset > self.length) {
          index = -1;
        } else {
          index = self.indexOf(search, offset);
        }
      }

      return index === -1 ? nil : index;
    
    });

    Opal.defn(self, '$inspect', function() {
      var self = this;

      
      var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
          meta = {
            '\u0007': '\\a',
            '\u001b': '\\e',
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '\v': '\\v',
            '"' : '\\"',
            '\\': '\\\\'
          },
          escaped = self.replace(escapable, function (chr) {
            return meta[chr] || '\\u' + ('0000' + chr.charCodeAt(0).toString(16).toUpperCase()).slice(-4);
          });
      return '"' + escaped.replace(/\#[\$\@\{]/g, '\\$&') + '"';
    
    });

    Opal.defn(self, '$intern', function() {
      var self = this;

      return self;
    });

    Opal.defn(self, '$lines', TMP_6 = function(separator) {
      var $a, $b, self = this, $iter = TMP_6.$$p, block = $iter || nil, e = nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"]
      }
      TMP_6.$$p = null;
      e = ($a = ($b = self).$each_line, $a.$$p = block.$to_proc(), $a).call($b, separator);
      if (block !== false && block !== nil) {
        return self
        } else {
        return e.$to_a()
      };
    });

    Opal.defn(self, '$length', function() {
      var self = this;

      return self.length;
    });

    Opal.defn(self, '$ljust', function(width, padstr) {
      var $a, self = this;

      if (padstr == null) {
        padstr = " "
      }
      width = $scope.get('Opal').$coerce_to(width, $scope.get('Integer'), "to_int");
      padstr = $scope.get('Opal').$coerce_to(padstr, $scope.get('String'), "to_str").$to_s();
      if ((($a = padstr['$empty?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "zero width padding")};
      if ((($a = width <= self.length) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      var index  = -1,
          result = "";

      width -= self.length;

      while (++index < width) {
        result += padstr;
      }

      return self + result.slice(0, width);
    
    });

    Opal.defn(self, '$lstrip', function() {
      var self = this;

      return self.replace(/^\s*/, '');
    });

    Opal.defn(self, '$match', TMP_7 = function(pattern, pos) {
      var $a, $b, self = this, $iter = TMP_7.$$p, block = $iter || nil;

      TMP_7.$$p = null;
      if ((($a = ((($b = $scope.get('String')['$==='](pattern)) !== false && $b !== nil) ? $b : pattern['$respond_to?']("to_str"))) !== nil && (!$a.$$is_boolean || $a == true))) {
        pattern = $scope.get('Regexp').$new(pattern.$to_str())};
      if ((($a = $scope.get('Regexp')['$==='](pattern)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "wrong argument type " + (pattern.$class()) + " (expected Regexp)")
      };
      return ($a = ($b = pattern).$match, $a.$$p = block.$to_proc(), $a).call($b, self, pos);
    });

    Opal.defn(self, '$next', function() {
      var self = this;

      
      var i = self.length;
      if (i === 0) {
        return '';
      }
      var result = self;
      var first_alphanum_char_index = self.search(/[a-zA-Z0-9]/);
      var carry = false;
      var code;
      while (i--) {
        code = self.charCodeAt(i);
        if ((code >= 48 && code <= 57) ||
          (code >= 65 && code <= 90) ||
          (code >= 97 && code <= 122)) {
          switch (code) {
          case 57:
            carry = true;
            code = 48;
            break;
          case 90:
            carry = true;
            code = 65;
            break;
          case 122:
            carry = true;
            code = 97;
            break;
          default:
            carry = false;
            code += 1;
          }
        } else {
          if (first_alphanum_char_index === -1) {
            if (code === 255) {
              carry = true;
              code = 0;
            } else {
              carry = false;
              code += 1;
            }
          } else {
            carry = true;
          }
        }
        result = result.slice(0, i) + String.fromCharCode(code) + result.slice(i + 1);
        if (carry && (i === 0 || i === first_alphanum_char_index)) {
          switch (code) {
          case 65:
            break;
          case 97:
            break;
          default:
            code += 1;
          }
          if (i === 0) {
            result = String.fromCharCode(code) + result;
          } else {
            result = result.slice(0, i) + String.fromCharCode(code) + result.slice(i);
          }
          carry = false;
        }
        if (!carry) {
          break;
        }
      }
      return result;
    
    });

    Opal.defn(self, '$oct', function() {
      var self = this;

      
      var result,
          string = self,
          radix = 8;

      if (/^\s*_/.test(string)) {
        return 0;
      }

      string = string.replace(/^(\s*[+-]?)(0[bodx]?)(.+)$/i, function (original, head, flag, tail) {
        switch (tail.charAt(0)) {
        case '+':
        case '-':
          return original;
        case '0':
          if (tail.charAt(1) === 'x' && flag === '0x') {
            return original;
          }
        }
        switch (flag) {
        case '0b':
          radix = 2;
          break;
        case '0':
        case '0o':
          radix = 8;
          break;
        case '0d':
          radix = 10;
          break;
        case '0x':
          radix = 16;
          break;
        }
        return head + tail;
      });

      result = parseInt(string.replace(/_(?!_)/g, ''), radix);
      return isNaN(result) ? 0 : result;
    
    });

    Opal.defn(self, '$ord', function() {
      var self = this;

      return self.charCodeAt(0);
    });

    Opal.defn(self, '$partition', function(sep) {
      var self = this;

      
      var i, m;

      if (sep.$$is_regexp) {
        m = sep.exec(self);
        if (m === null) {
          i = -1;
        } else {
          $scope.get('MatchData').$new(sep, m);
          sep = m[0];
          i = m.index;
        }
      } else {
        sep = $scope.get('Opal').$coerce_to(sep, $scope.get('String'), "to_str");
        i = self.indexOf(sep);
      }

      if (i === -1) {
        return [self, '', ''];
      }

      return [
        self.slice(0, i),
        self.slice(i, i + sep.length),
        self.slice(i + sep.length)
      ];
    
    });

    Opal.defn(self, '$reverse', function() {
      var self = this;

      return self.split('').reverse().join('');
    });

    Opal.defn(self, '$rindex', function(search, offset) {
      var self = this;

      
      var i, m, r, _m;

      if (offset === undefined) {
        offset = self.length;
      } else {
        offset = $scope.get('Opal').$coerce_to(offset, $scope.get('Integer'), "to_int");
        if (offset < 0) {
          offset += self.length;
          if (offset < 0) {
            return nil;
          }
        }
      }

      if (search.$$is_regexp) {
        m = null;
        r = new RegExp(search.source, 'gm' + (search.ignoreCase ? 'i' : ''));
        while (true) {
          _m = r.exec(self);
          if (_m === null || _m.index > offset) {
            break;
          }
          m = _m;
          r.lastIndex = m.index + 1;
        }
        if (m === null) {
          $gvars["~"] = nil
          i = -1;
        } else {
          $scope.get('MatchData').$new(r, m);
          i = m.index;
        }
      } else {
        search = $scope.get('Opal').$coerce_to(search, $scope.get('String'), "to_str");
        i = self.lastIndexOf(search, offset);
      }

      return i === -1 ? nil : i;
    
    });

    Opal.defn(self, '$rjust', function(width, padstr) {
      var $a, self = this;

      if (padstr == null) {
        padstr = " "
      }
      width = $scope.get('Opal').$coerce_to(width, $scope.get('Integer'), "to_int");
      padstr = $scope.get('Opal').$coerce_to(padstr, $scope.get('String'), "to_str").$to_s();
      if ((($a = padstr['$empty?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "zero width padding")};
      if ((($a = width <= self.length) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      var chars     = Math.floor(width - self.length),
          patterns  = Math.floor(chars / padstr.length),
          result    = Array(patterns + 1).join(padstr),
          remaining = chars - result.length;

      return result + padstr.slice(0, remaining) + self;
    
    });

    Opal.defn(self, '$rpartition', function(sep) {
      var self = this;

      
      var i, m, r, _m;

      if (sep.$$is_regexp) {
        m = null;
        r = new RegExp(sep.source, 'gm' + (sep.ignoreCase ? 'i' : ''));

        while (true) {
          _m = r.exec(self);
          if (_m === null) {
            break;
          }
          m = _m;
          r.lastIndex = m.index + 1;
        }

        if (m === null) {
          i = -1;
        } else {
          $scope.get('MatchData').$new(r, m);
          sep = m[0];
          i = m.index;
        }

      } else {
        sep = $scope.get('Opal').$coerce_to(sep, $scope.get('String'), "to_str");
        i = self.lastIndexOf(sep);
      }

      if (i === -1) {
        return ['', '', self];
      }

      return [
        self.slice(0, i),
        self.slice(i, i + sep.length),
        self.slice(i + sep.length)
      ];
    
    });

    Opal.defn(self, '$rstrip', function() {
      var self = this;

      return self.replace(/[\s\u0000]*$/, '');
    });

    Opal.defn(self, '$scan', TMP_8 = function(pattern) {
      var self = this, $iter = TMP_8.$$p, block = $iter || nil;

      TMP_8.$$p = null;
      
      var result = [],
          match_data = nil,
          match;

      if (pattern.$$is_regexp) {
        pattern = new RegExp(pattern.source, 'gm' + (pattern.ignoreCase ? 'i' : ''));
      } else {
        pattern = $scope.get('Opal').$coerce_to(pattern, $scope.get('String'), "to_str");
        pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
      }

      while ((match = pattern.exec(self)) != null) {
        match_data = $scope.get('MatchData').$new(pattern, match);
        if (block === nil) {
          match.length == 1 ? result.push(match[0]) : result.push((match_data).$captures());
        } else {
          match.length == 1 ? block(match[0]) : block.call(self, (match_data).$captures());
        }
        if (pattern.lastIndex === match.index) {
          pattern.lastIndex += 1;
        }
      }

      $gvars["~"] = match_data

      return (block !== nil ? self : result);
    
    });

    Opal.alias(self, 'size', 'length');

    Opal.alias(self, 'slice', '[]');

    Opal.defn(self, '$split', function(pattern, limit) {
      var $a, self = this;
      if ($gvars[";"] == null) $gvars[";"] = nil;

      
      if (self.length === 0) {
        return [];
      }

      if (limit === undefined) {
        limit = 0;
      } else {
        limit = $scope.get('Opal')['$coerce_to!'](limit, $scope.get('Integer'), "to_int");
        if (limit === 1) {
          return [self];
        }
      }

      if (pattern === undefined || pattern === nil) {
        pattern = ((($a = $gvars[";"]) !== false && $a !== nil) ? $a : " ");
      }

      var result = [],
          string = self.toString(),
          index = 0,
          match,
          i;

      if (pattern.$$is_regexp) {
        pattern = new RegExp(pattern.source, 'gm' + (pattern.ignoreCase ? 'i' : ''));
      } else {
        pattern = $scope.get('Opal').$coerce_to(pattern, $scope.get('String'), "to_str").$to_s();
        if (pattern === ' ') {
          pattern = /\s+/gm;
          string = string.replace(/^\s+/, '');
        } else {
          pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
        }
      }

      result = string.split(pattern);

      if (result.length === 1 && result[0] === string) {
        return result;
      }

      while ((i = result.indexOf(undefined)) !== -1) {
        result.splice(i, 1);
      }

      if (limit === 0) {
        while (result[result.length - 1] === '') {
          result.length -= 1;
        }
        return result;
      }

      match = pattern.exec(string);

      if (limit < 0) {
        if (match !== null && match[0] === '' && pattern.source.indexOf('(?=') === -1) {
          for (i = 0; i < match.length; i++) {
            result.push('');
          }
        }
        return result;
      }

      if (match !== null && match[0] === '') {
        result.splice(limit - 1, result.length - 1, result.slice(limit - 1).join(''));
        return result;
      }

      i = 0;
      while (match !== null) {
        i++;
        index = pattern.lastIndex;
        if (i + 1 === limit) {
          break;
        }
        match = pattern.exec(string);
      }

      result.splice(limit - 1, result.length - 1, string.slice(index));
      return result;
    
    });

    Opal.defn(self, '$squeeze', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var sets = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        sets[$splat_index] = arguments[$splat_index + 0];
      }
      
      if (sets.length === 0) {
        return self.replace(/(.)\1+/g, '$1');
      }
      var char_class = char_class_from_char_sets(sets);
      if (char_class === null) {
        return self;
      }
      return self.replace(new RegExp('(' + char_class + ')\\1+', 'g'), '$1');
    
    });

    Opal.defn(self, '$start_with?', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var prefixes = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        prefixes[$splat_index] = arguments[$splat_index + 0];
      }
      
      for (var i = 0, length = prefixes.length; i < length; i++) {
        var prefix = $scope.get('Opal').$coerce_to(prefixes[i], $scope.get('String'), "to_str").$to_s();

        if (self.indexOf(prefix) === 0) {
          return true;
        }
      }

      return false;
    
    });

    Opal.defn(self, '$strip', function() {
      var self = this;

      return self.replace(/^\s*/, '').replace(/[\s\u0000]*$/, '');
    });

    Opal.defn(self, '$sub', TMP_9 = function(pattern, replacement) {
      var self = this, $iter = TMP_9.$$p, block = $iter || nil;

      TMP_9.$$p = null;
      
      if (!pattern.$$is_regexp) {
        pattern = $scope.get('Opal').$coerce_to(pattern, $scope.get('String'), "to_str");
        pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }

      var result = pattern.exec(self);

      if (result === null) {
        $gvars["~"] = nil
        return self.toString();
      }

      $scope.get('MatchData').$new(pattern, result)

      if (replacement === undefined) {
        if (block === nil) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (1 for 2)")
        }
        return self.slice(0, result.index) + block(result[0]) + self.slice(result.index + result[0].length);
      }

      if (replacement.$$is_hash) {
        return self.slice(0, result.index) + (replacement)['$[]'](result[0]).$to_s() + self.slice(result.index + result[0].length);
      }

      replacement = $scope.get('Opal').$coerce_to(replacement, $scope.get('String'), "to_str");

      replacement = replacement.replace(/([\\]+)([0-9+&`'])/g, function (original, slashes, command) {
        if (slashes.length % 2 === 0) {
          return original;
        }
        switch (command) {
        case "+":
          for (var i = result.length - 1; i > 0; i--) {
            if (result[i] !== undefined) {
              return slashes.slice(1) + result[i];
            }
          }
          return '';
        case "&": return slashes.slice(1) + result[0];
        case "`": return slashes.slice(1) + self.slice(0, result.index);
        case "'": return slashes.slice(1) + self.slice(result.index + result[0].length);
        default:  return slashes.slice(1) + (result[command] || '');
        }
      }).replace(/\\\\/g, '\\');

      return self.slice(0, result.index) + replacement + self.slice(result.index + result[0].length);
    ;
    });

    Opal.alias(self, 'succ', 'next');

    Opal.defn(self, '$sum', function(n) {
      var self = this;

      if (n == null) {
        n = 16
      }
      
      n = $scope.get('Opal').$coerce_to(n, $scope.get('Integer'), "to_int");

      var result = 0,
          length = self.length,
          i = 0;

      for (; i < length; i++) {
        result += self.charCodeAt(i);
      }

      if (n <= 0) {
        return result;
      }

      return result & (Math.pow(2, n) - 1);
    ;
    });

    Opal.defn(self, '$swapcase', function() {
      var self = this;

      
      var str = self.replace(/([a-z]+)|([A-Z]+)/g, function($0,$1,$2) {
        return $1 ? $0.toUpperCase() : $0.toLowerCase();
      });

      if (self.constructor === String) {
        return str;
      }

      return self.$class().$new(str);
    
    });

    Opal.defn(self, '$to_f', function() {
      var self = this;

      
      if (self.charAt(0) === '_') {
        return 0;
      }

      var result = parseFloat(self.replace(/_/g, ''));

      if (isNaN(result) || result == Infinity || result == -Infinity) {
        return 0;
      }
      else {
        return result;
      }
    
    });

    Opal.defn(self, '$to_i', function(base) {
      var self = this;

      if (base == null) {
        base = 10
      }
      
      var result,
          string = self.toLowerCase(),
          radix = $scope.get('Opal').$coerce_to(base, $scope.get('Integer'), "to_int");

      if (radix === 1 || radix < 0 || radix > 36) {
        self.$raise($scope.get('ArgumentError'), "invalid radix " + (radix))
      }

      if (/^\s*_/.test(string)) {
        return 0;
      }

      string = string.replace(/^(\s*[+-]?)(0[bodx]?)(.+)$/, function (original, head, flag, tail) {
        switch (tail.charAt(0)) {
        case '+':
        case '-':
          return original;
        case '0':
          if (tail.charAt(1) === 'x' && flag === '0x' && (radix === 0 || radix === 16)) {
            return original;
          }
        }
        switch (flag) {
        case '0b':
          if (radix === 0 || radix === 2) {
            radix = 2;
            return head + tail;
          }
          break;
        case '0':
        case '0o':
          if (radix === 0 || radix === 8) {
            radix = 8;
            return head + tail;
          }
          break;
        case '0d':
          if (radix === 0 || radix === 10) {
            radix = 10;
            return head + tail;
          }
          break;
        case '0x':
          if (radix === 0 || radix === 16) {
            radix = 16;
            return head + tail;
          }
          break;
        }
        return original
      });

      result = parseInt(string.replace(/_(?!_)/g, ''), radix);
      return isNaN(result) ? 0 : result;
    ;
    });

    Opal.defn(self, '$to_proc', function() {
      var $a, $b, TMP_10, self = this, sym = nil;

      sym = self;
      return ($a = ($b = self).$proc, $a.$$p = (TMP_10 = function(args){var self = TMP_10.$$s || this, block, $a, $b, obj = nil;
args = $slice.call(arguments, 0);
        block = TMP_10.$$p || nil, TMP_10.$$p = null;
      if ((($a = args['$empty?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('ArgumentError'), "no receiver given")};
        obj = args.$shift();
        return ($a = ($b = obj).$__send__, $a.$$p = block.$to_proc(), $a).apply($b, [sym].concat(Opal.to_a(args)));}, TMP_10.$$s = self, TMP_10), $a).call($b);
    });

    Opal.defn(self, '$to_s', function() {
      var self = this;

      return self.toString();
    });

    Opal.alias(self, 'to_str', 'to_s');

    Opal.alias(self, 'to_sym', 'intern');

    Opal.defn(self, '$tr', function(from, to) {
      var self = this;

      from = $scope.get('Opal').$coerce_to(from, $scope.get('String'), "to_str").$to_s();
      to = $scope.get('Opal').$coerce_to(to, $scope.get('String'), "to_str").$to_s();
      
      if (from.length == 0 || from === to) {
        return self;
      }

      var i, in_range, c, ch, start, end, length;
      var subs = {};
      var from_chars = from.split('');
      var from_length = from_chars.length;
      var to_chars = to.split('');
      var to_length = to_chars.length;

      var inverse = false;
      var global_sub = null;
      if (from_chars[0] === '^' && from_chars.length > 1) {
        inverse = true;
        from_chars.shift();
        global_sub = to_chars[to_length - 1]
        from_length -= 1;
      }

      var from_chars_expanded = [];
      var last_from = null;
      in_range = false;
      for (i = 0; i < from_length; i++) {
        ch = from_chars[i];
        if (last_from == null) {
          last_from = ch;
          from_chars_expanded.push(ch);
        }
        else if (ch === '-') {
          if (last_from === '-') {
            from_chars_expanded.push('-');
            from_chars_expanded.push('-');
          }
          else if (i == from_length - 1) {
            from_chars_expanded.push('-');
          }
          else {
            in_range = true;
          }
        }
        else if (in_range) {
          start = last_from.charCodeAt(0);
          end = ch.charCodeAt(0);
          if (start > end) {
            self.$raise($scope.get('ArgumentError'), "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
          }
          for (c = start + 1; c < end; c++) {
            from_chars_expanded.push(String.fromCharCode(c));
          }
          from_chars_expanded.push(ch);
          in_range = null;
          last_from = null;
        }
        else {
          from_chars_expanded.push(ch);
        }
      }

      from_chars = from_chars_expanded;
      from_length = from_chars.length;

      if (inverse) {
        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = true;
        }
      }
      else {
        if (to_length > 0) {
          var to_chars_expanded = [];
          var last_to = null;
          in_range = false;
          for (i = 0; i < to_length; i++) {
            ch = to_chars[i];
            if (last_from == null) {
              last_from = ch;
              to_chars_expanded.push(ch);
            }
            else if (ch === '-') {
              if (last_to === '-') {
                to_chars_expanded.push('-');
                to_chars_expanded.push('-');
              }
              else if (i == to_length - 1) {
                to_chars_expanded.push('-');
              }
              else {
                in_range = true;
              }
            }
            else if (in_range) {
              start = last_from.charCodeAt(0);
              end = ch.charCodeAt(0);
              if (start > end) {
                self.$raise($scope.get('ArgumentError'), "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
              }
              for (c = start + 1; c < end; c++) {
                to_chars_expanded.push(String.fromCharCode(c));
              }
              to_chars_expanded.push(ch);
              in_range = null;
              last_from = null;
            }
            else {
              to_chars_expanded.push(ch);
            }
          }

          to_chars = to_chars_expanded;
          to_length = to_chars.length;
        }

        var length_diff = from_length - to_length;
        if (length_diff > 0) {
          var pad_char = (to_length > 0 ? to_chars[to_length - 1] : '');
          for (i = 0; i < length_diff; i++) {
            to_chars.push(pad_char);
          }
        }

        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = to_chars[i];
        }
      }

      var new_str = ''
      for (i = 0, length = self.length; i < length; i++) {
        ch = self.charAt(i);
        var sub = subs[ch];
        if (inverse) {
          new_str += (sub == null ? global_sub : ch);
        }
        else {
          new_str += (sub != null ? sub : ch);
        }
      }
      return new_str;
    
    });

    Opal.defn(self, '$tr_s', function(from, to) {
      var self = this;

      from = $scope.get('Opal').$coerce_to(from, $scope.get('String'), "to_str").$to_s();
      to = $scope.get('Opal').$coerce_to(to, $scope.get('String'), "to_str").$to_s();
      
      if (from.length == 0) {
        return self;
      }

      var i, in_range, c, ch, start, end, length;
      var subs = {};
      var from_chars = from.split('');
      var from_length = from_chars.length;
      var to_chars = to.split('');
      var to_length = to_chars.length;

      var inverse = false;
      var global_sub = null;
      if (from_chars[0] === '^' && from_chars.length > 1) {
        inverse = true;
        from_chars.shift();
        global_sub = to_chars[to_length - 1]
        from_length -= 1;
      }

      var from_chars_expanded = [];
      var last_from = null;
      in_range = false;
      for (i = 0; i < from_length; i++) {
        ch = from_chars[i];
        if (last_from == null) {
          last_from = ch;
          from_chars_expanded.push(ch);
        }
        else if (ch === '-') {
          if (last_from === '-') {
            from_chars_expanded.push('-');
            from_chars_expanded.push('-');
          }
          else if (i == from_length - 1) {
            from_chars_expanded.push('-');
          }
          else {
            in_range = true;
          }
        }
        else if (in_range) {
          start = last_from.charCodeAt(0);
          end = ch.charCodeAt(0);
          if (start > end) {
            self.$raise($scope.get('ArgumentError'), "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
          }
          for (c = start + 1; c < end; c++) {
            from_chars_expanded.push(String.fromCharCode(c));
          }
          from_chars_expanded.push(ch);
          in_range = null;
          last_from = null;
        }
        else {
          from_chars_expanded.push(ch);
        }
      }

      from_chars = from_chars_expanded;
      from_length = from_chars.length;

      if (inverse) {
        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = true;
        }
      }
      else {
        if (to_length > 0) {
          var to_chars_expanded = [];
          var last_to = null;
          in_range = false;
          for (i = 0; i < to_length; i++) {
            ch = to_chars[i];
            if (last_from == null) {
              last_from = ch;
              to_chars_expanded.push(ch);
            }
            else if (ch === '-') {
              if (last_to === '-') {
                to_chars_expanded.push('-');
                to_chars_expanded.push('-');
              }
              else if (i == to_length - 1) {
                to_chars_expanded.push('-');
              }
              else {
                in_range = true;
              }
            }
            else if (in_range) {
              start = last_from.charCodeAt(0);
              end = ch.charCodeAt(0);
              if (start > end) {
                self.$raise($scope.get('ArgumentError'), "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
              }
              for (c = start + 1; c < end; c++) {
                to_chars_expanded.push(String.fromCharCode(c));
              }
              to_chars_expanded.push(ch);
              in_range = null;
              last_from = null;
            }
            else {
              to_chars_expanded.push(ch);
            }
          }

          to_chars = to_chars_expanded;
          to_length = to_chars.length;
        }

        var length_diff = from_length - to_length;
        if (length_diff > 0) {
          var pad_char = (to_length > 0 ? to_chars[to_length - 1] : '');
          for (i = 0; i < length_diff; i++) {
            to_chars.push(pad_char);
          }
        }

        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = to_chars[i];
        }
      }
      var new_str = ''
      var last_substitute = null
      for (i = 0, length = self.length; i < length; i++) {
        ch = self.charAt(i);
        var sub = subs[ch]
        if (inverse) {
          if (sub == null) {
            if (last_substitute == null) {
              new_str += global_sub;
              last_substitute = true;
            }
          }
          else {
            new_str += ch;
            last_substitute = null;
          }
        }
        else {
          if (sub != null) {
            if (last_substitute == null || last_substitute !== sub) {
              new_str += sub;
              last_substitute = sub;
            }
          }
          else {
            new_str += ch;
            last_substitute = null;
          }
        }
      }
      return new_str;
    
    });

    Opal.defn(self, '$upcase', function() {
      var self = this;

      return self.toUpperCase();
    });

    Opal.defn(self, '$upto', TMP_11 = function(stop, excl) {
      var self = this, $iter = TMP_11.$$p, block = $iter || nil;

      if (excl == null) {
        excl = false
      }
      TMP_11.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("upto", stop, excl)
      };
      stop = $scope.get('Opal').$coerce_to(stop, $scope.get('String'), "to_str");
      
      var a, b, s = self.toString(), value;

      if (s.length === 1 && stop.length === 1) {

        a = s.charCodeAt(0);
        b = stop.charCodeAt(0);

        while (a <= b) {
          if (excl && a === b) {
            break;
          }

          value = block(String.fromCharCode(a));
          if (value === $breaker) { return $breaker.$v; }

          a += 1;
        }

      } else if (parseInt(s, 10).toString() === s && parseInt(stop, 10).toString() === stop) {

        a = parseInt(s, 10);
        b = parseInt(stop, 10);

        while (a <= b) {
          if (excl && a === b) {
            break;
          }

          value = block(a.toString());
          if (value === $breaker) { return $breaker.$v; }

          a += 1;
        }

      } else {

        while (s.length <= stop.length && s <= stop) {
          if (excl && s === stop) {
            break;
          }

          value = block(s);
          if (value === $breaker) { return $breaker.$v; }

          s = (s).$succ();
        }

      }
      return self;
    
    });

    
    function char_class_from_char_sets(sets) {
      function explode_sequences_in_character_set(set) {
        var result = '',
            i, len = set.length,
            curr_char,
            skip_next_dash,
            char_code_from,
            char_code_upto,
            char_code;
        for (i = 0; i < len; i++) {
          curr_char = set.charAt(i);
          if (curr_char === '-' && i > 0 && i < (len - 1) && !skip_next_dash) {
            char_code_from = set.charCodeAt(i - 1);
            char_code_upto = set.charCodeAt(i + 1);
            if (char_code_from > char_code_upto) {
              self.$raise($scope.get('ArgumentError'), "invalid range \"" + (char_code_from) + "-" + (char_code_upto) + "\" in string transliteration")
            }
            for (char_code = char_code_from + 1; char_code < char_code_upto + 1; char_code++) {
              result += String.fromCharCode(char_code);
            }
            skip_next_dash = true;
            i++;
          } else {
            skip_next_dash = (curr_char === '\\');
            result += curr_char;
          }
        }
        return result;
      }

      function intersection(setA, setB) {
        if (setA.length === 0) {
          return setB;
        }
        var result = '',
            i, len = setA.length,
            chr;
        for (i = 0; i < len; i++) {
          chr = setA.charAt(i);
          if (setB.indexOf(chr) !== -1) {
            result += chr;
          }
        }
        return result;
      }

      var i, len, set, neg, chr, tmp,
          pos_intersection = '',
          neg_intersection = '';

      for (i = 0, len = sets.length; i < len; i++) {
        set = $scope.get('Opal').$coerce_to(sets[i], $scope.get('String'), "to_str");
        neg = (set.charAt(0) === '^' && set.length > 1);
        set = explode_sequences_in_character_set(neg ? set.slice(1) : set);
        if (neg) {
          neg_intersection = intersection(neg_intersection, set);
        } else {
          pos_intersection = intersection(pos_intersection, set);
        }
      }

      if (pos_intersection.length > 0 && neg_intersection.length > 0) {
        tmp = '';
        for (i = 0, len = pos_intersection.length; i < len; i++) {
          chr = pos_intersection.charAt(i);
          if (neg_intersection.indexOf(chr) === -1) {
            tmp += chr;
          }
        }
        pos_intersection = tmp;
        neg_intersection = '';
      }

      if (pos_intersection.length > 0) {
        return '[' + $scope.get('Regexp').$escape(pos_intersection) + ']';
      }

      if (neg_intersection.length > 0) {
        return '[^' + $scope.get('Regexp').$escape(neg_intersection) + ']';
      }

      return null;
    }
  
  })($scope.base, String);
  return Opal.cdecl($scope, 'Symbol', $scope.get('String'));
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/enumerable"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$raise', '$new', '$yield', '$dup', '$enum_for', '$enumerator_size', '$flatten', '$map', '$==', '$destructure', '$respond_to?', '$coerce_to!', '$>', '$*', '$nil?', '$coerce_to', '$try_convert', '$<', '$+', '$-', '$ceil', '$/', '$size', '$===', '$<<', '$[]', '$[]=', '$inspect', '$__send__', '$compare', '$<=>', '$proc', '$call', '$to_a', '$lambda', '$sort!', '$map!', '$first', '$zip']);
  return (function($base) {
    var $Enumerable, self = $Enumerable = $module($base, 'Enumerable');

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_6, TMP_8, TMP_11, TMP_12, TMP_14, TMP_15, TMP_16, TMP_18, TMP_19, TMP_21, TMP_23, TMP_25, TMP_27, TMP_28, TMP_29, TMP_31, TMP_33, TMP_34, TMP_36, TMP_37, TMP_39, TMP_41, TMP_42, TMP_43, TMP_44, TMP_46, TMP_48, TMP_50, TMP_52, TMP_54, TMP_59, TMP_60;

    Opal.defn(self, '$all?', TMP_1 = function() {
      var $a, self = this, $iter = TMP_1.$$p, block = $iter || nil;

      TMP_1.$$p = null;
      
      var result = true;

      if (block !== nil) {
        self.$each.$$p = function() {
          var value = Opal.yieldX(block, arguments);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if ((($a = value) === nil || ($a.$$is_boolean && $a == false))) {
            result = false;
            return $breaker;
          }
        };
      }
      else {
        self.$each.$$p = function(obj) {
          if (arguments.length == 1 && (($a = obj) === nil || ($a.$$is_boolean && $a == false))) {
            result = false;
            return $breaker;
          }
        };
      }

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$any?', TMP_2 = function() {
      var $a, self = this, $iter = TMP_2.$$p, block = $iter || nil;

      TMP_2.$$p = null;
      
      var result = false;

      if (block !== nil) {
        self.$each.$$p = function() {
          var value = Opal.yieldX(block, arguments);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
            result = true;
            return $breaker;
          }
        };
      }
      else {
        self.$each.$$p = function(obj) {
          if (arguments.length != 1 || (($a = obj) !== nil && (!$a.$$is_boolean || $a == true))) {
            result = true;
            return $breaker;
          }
        }
      }

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$chunk', TMP_3 = function(state) {
      var $a, $b, TMP_4, self = this, $iter = TMP_3.$$p, original_block = $iter || nil;

      TMP_3.$$p = null;
      if (original_block !== false && original_block !== nil) {
        } else {
        $scope.get('Kernel').$raise($scope.get('ArgumentError'), "no block given")
      };
      return ($a = ($b = Opal.get('Enumerator')).$new, $a.$$p = (TMP_4 = function(yielder){var self = TMP_4.$$s || this, $a, $b, TMP_5;
if (yielder == null) yielder = nil;
      
        var block, previous = nil, accumulate = [];

        if (state == undefined || state === nil) {
          block = original_block;
        } else {
          block = ($a = ($b = $scope.get('Proc')).$new, $a.$$p = (TMP_5 = function(val){var self = TMP_5.$$s || this;
if (val == null) val = nil;
        return original_block.$yield(val, state.$dup())}, TMP_5.$$s = self, TMP_5), $a).call($b)
        }

        function releaseAccumulate() {
          if (accumulate.length > 0) {
            yielder.$yield(previous, accumulate)
          }
        }

        self.$each.$$p = function(value) {
          var key = Opal.yield1(block, value);

          if (key === $breaker) {
            return $breaker;
          }

          if (key === nil) {
            releaseAccumulate();
            accumulate = [];
            previous = nil;
          } else {
            if (previous === nil || previous === key) {
              accumulate.push(value);
            } else {
              releaseAccumulate();
              accumulate = [value];
            }

            previous = key;
          }
        }

        self.$each();

        releaseAccumulate();
      ;}, TMP_4.$$s = self, TMP_4), $a).call($b);
    });

    Opal.defn(self, '$collect', TMP_6 = function() {
      var $a, $b, TMP_7, self = this, $iter = TMP_6.$$p, block = $iter || nil;

      TMP_6.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_7 = function(){var self = TMP_7.$$s || this;

        return self.$enumerator_size()}, TMP_7.$$s = self, TMP_7), $a).call($b, "collect")
      };
      
      var result = [];

      self.$each.$$p = function() {
        var value = Opal.yieldX(block, arguments);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        result.push(value);
      };

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$collect_concat', TMP_8 = function() {
      var $a, $b, TMP_9, $c, TMP_10, self = this, $iter = TMP_8.$$p, block = $iter || nil;

      TMP_8.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_9 = function(){var self = TMP_9.$$s || this;

        return self.$enumerator_size()}, TMP_9.$$s = self, TMP_9), $a).call($b, "collect_concat")
      };
      return ($a = ($c = self).$map, $a.$$p = (TMP_10 = function(item){var self = TMP_10.$$s || this, $a;
if (item == null) item = nil;
      return $a = Opal.yield1(block, item), $a === $breaker ? $a : $a}, TMP_10.$$s = self, TMP_10), $a).call($c).$flatten(1);
    });

    Opal.defn(self, '$count', TMP_11 = function(object) {
      var $a, self = this, $iter = TMP_11.$$p, block = $iter || nil;

      TMP_11.$$p = null;
      
      var result = 0;

      if (object != null) {
        block = function() {
          return $scope.get('Opal').$destructure(arguments)['$=='](object);
        };
      }
      else if (block === nil) {
        block = function() { return true; };
      }

      self.$each.$$p = function() {
        var value = Opal.yieldX(block, arguments);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
          result++;
        }
      }

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$cycle', TMP_12 = function(n) {
      var $a, $b, TMP_13, self = this, $iter = TMP_12.$$p, block = $iter || nil;

      if (n == null) {
        n = nil
      }
      TMP_12.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_13 = function(){var self = TMP_13.$$s || this, $a;

        if (n['$=='](nil)) {
            if ((($a = self['$respond_to?']("size")) !== nil && (!$a.$$is_boolean || $a == true))) {
              return (($scope.get('Float')).$$scope.get('INFINITY'))
              } else {
              return nil
            }
            } else {
            n = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
            if ((($a = $rb_gt(n, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
              return $rb_times(self.$enumerator_size(), n)
              } else {
              return 0
            };
          }}, TMP_13.$$s = self, TMP_13), $a).call($b, "cycle", n)
      };
      if ((($a = n['$nil?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        n = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
        if ((($a = n <= 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          return nil};
      };
      
      var result,
          all = [], i, length, value;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        all.push(param);
      }

      self.$each();

      if (result !== undefined) {
        return result;
      }

      if (all.length === 0) {
        return nil;
      }

      if (n === nil) {
        while (true) {
          for (i = 0, length = all.length; i < length; i++) {
            value = Opal.yield1(block, all[i]);

            if (value === $breaker) {
              return $breaker.$v;
            }
          }
        }
      }
      else {
        while (n > 1) {
          for (i = 0, length = all.length; i < length; i++) {
            value = Opal.yield1(block, all[i]);

            if (value === $breaker) {
              return $breaker.$v;
            }
          }

          n--;
        }
      }
    
    });

    Opal.defn(self, '$detect', TMP_14 = function(ifnone) {
      var $a, self = this, $iter = TMP_14.$$p, block = $iter || nil;

      TMP_14.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("detect", ifnone)
      };
      
      var result;

      self.$each.$$p = function() {
        var params = $scope.get('Opal').$destructure(arguments),
            value  = Opal.yield1(block, params);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
          result = params;
          return $breaker;
        }
      };

      self.$each();

      if (result === undefined && ifnone !== undefined) {
        if (typeof(ifnone) === 'function') {
          result = ifnone();
        }
        else {
          result = ifnone;
        }
      }

      return result === undefined ? nil : result;
    
    });

    Opal.defn(self, '$drop', function(number) {
      var $a, self = this;

      number = $scope.get('Opal').$coerce_to(number, $scope.get('Integer'), "to_int");
      if ((($a = number < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "attempt to drop negative size")};
      
      var result  = [],
          current = 0;

      self.$each.$$p = function() {
        if (number <= current) {
          result.push($scope.get('Opal').$destructure(arguments));
        }

        current++;
      };

      self.$each()

      return result;
    
    });

    Opal.defn(self, '$drop_while', TMP_15 = function() {
      var $a, self = this, $iter = TMP_15.$$p, block = $iter || nil;

      TMP_15.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("drop_while")
      };
      
      var result   = [],
          dropping = true;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments);

        if (dropping) {
          var value = Opal.yield1(block, param);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if ((($a = value) === nil || ($a.$$is_boolean && $a == false))) {
            dropping = false;
            result.push(param);
          }
        }
        else {
          result.push(param);
        }
      };

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$each_cons', TMP_16 = function(n) {
      var $a, $b, TMP_17, self = this, $iter = TMP_16.$$p, block = $iter || nil;

      TMP_16.$$p = null;
      if ((($a = arguments.length != 1) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 1)")};
      n = $scope.get('Opal').$try_convert(n, $scope.get('Integer'), "to_int");
      if ((($a = n <= 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "invalid size")};
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_17 = function(){var self = TMP_17.$$s || this, $a, $b, enum_size = nil;

        enum_size = self.$enumerator_size();
          if ((($a = enum_size['$nil?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
            return nil
          } else if ((($a = ((($b = enum_size['$=='](0)) !== false && $b !== nil) ? $b : $rb_lt(enum_size, n))) !== nil && (!$a.$$is_boolean || $a == true))) {
            return 0
            } else {
            return $rb_plus($rb_minus(enum_size, n), 1)
          };}, TMP_17.$$s = self, TMP_17), $a).call($b, "each_cons", n)
      };
      
      var buffer = [], result = nil;

      self.$each.$$p = function() {
        var element = $scope.get('Opal').$destructure(arguments);
        buffer.push(element);
        if (buffer.length > n) {
          buffer.shift();
        }
        if (buffer.length == n) {
          var value = Opal.yield1(block, buffer.slice(0, n));

          if (value == $breaker) {
            result = $breaker.$v;
            return $breaker;
          }
        }
      }

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$each_entry', TMP_18 = function() {
      var self = this, $iter = TMP_18.$$p, block = $iter || nil;

      TMP_18.$$p = null;
      return self.$raise($scope.get('NotImplementedError'));
    });

    Opal.defn(self, '$each_slice', TMP_19 = function(n) {
      var $a, $b, TMP_20, self = this, $iter = TMP_19.$$p, block = $iter || nil;

      TMP_19.$$p = null;
      n = $scope.get('Opal').$coerce_to(n, $scope.get('Integer'), "to_int");
      if ((($a = n <= 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "invalid slice size")};
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_20 = function(){var self = TMP_20.$$s || this, $a;

        if ((($a = self['$respond_to?']("size")) !== nil && (!$a.$$is_boolean || $a == true))) {
            return ($rb_divide(self.$size(), n)).$ceil()
            } else {
            return nil
          }}, TMP_20.$$s = self, TMP_20), $a).call($b, "each_slice", n)
      };
      
      var result,
          slice = []

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments);

        slice.push(param);

        if (slice.length === n) {
          if (Opal.yield1(block, slice) === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          slice = [];
        }
      };

      self.$each();

      if (result !== undefined) {
        return result;
      }

      // our "last" group, if smaller than n then won't have been yielded
      if (slice.length > 0) {
        if (Opal.yield1(block, slice) === $breaker) {
          return $breaker.$v;
        }
      }
    ;
      return nil;
    });

    Opal.defn(self, '$each_with_index', TMP_21 = function() {
      var $a, $b, TMP_22, self = this, $iter = TMP_21.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_21.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_22 = function(){var self = TMP_22.$$s || this;

        return self.$enumerator_size()}, TMP_22.$$s = self, TMP_22), $a).apply($b, ["each_with_index"].concat(Opal.to_a(args)))
      };
      
      var result,
          index = 0;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = block(param, index);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        index++;
      };

      self.$each.apply(self, args);

      if (result !== undefined) {
        return result;
      }
    
      return self;
    });

    Opal.defn(self, '$each_with_object', TMP_23 = function(object) {
      var $a, $b, TMP_24, self = this, $iter = TMP_23.$$p, block = $iter || nil;

      TMP_23.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_24 = function(){var self = TMP_24.$$s || this;

        return self.$enumerator_size()}, TMP_24.$$s = self, TMP_24), $a).call($b, "each_with_object", object)
      };
      
      var result;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = block(param, object);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }
      };

      self.$each();

      if (result !== undefined) {
        return result;
      }
    
      return object;
    });

    Opal.defn(self, '$entries', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      
      var result = [];

      self.$each.$$p = function() {
        result.push($scope.get('Opal').$destructure(arguments));
      };

      self.$each.apply(self, args);

      return result;
    
    });

    Opal.alias(self, 'find', 'detect');

    Opal.defn(self, '$find_all', TMP_25 = function() {
      var $a, $b, TMP_26, self = this, $iter = TMP_25.$$p, block = $iter || nil;

      TMP_25.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_26 = function(){var self = TMP_26.$$s || this;

        return self.$enumerator_size()}, TMP_26.$$s = self, TMP_26), $a).call($b, "find_all")
      };
      
      var result = [];

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
          result.push(param);
        }
      };

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$find_index', TMP_27 = function(object) {
      var $a, self = this, $iter = TMP_27.$$p, block = $iter || nil;

      TMP_27.$$p = null;
      if ((($a = object === undefined && block === nil) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$enum_for("find_index")};
      
      var result = nil,
          index  = 0;

      if (object != null) {
        self.$each.$$p = function() {
          var param = $scope.get('Opal').$destructure(arguments);

          if ((param)['$=='](object)) {
            result = index;
            return $breaker;
          }

          index += 1;
        };
      }
      else if (block !== nil) {
        self.$each.$$p = function() {
          var value = Opal.yieldX(block, arguments);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
            result = index;
            return $breaker;
          }

          index += 1;
        };
      }

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$first', function(number) {
      var $a, self = this, result = nil;

      if ((($a = number === undefined) !== nil && (!$a.$$is_boolean || $a == true))) {
        result = nil;
        
        self.$each.$$p = function() {
          result = $scope.get('Opal').$destructure(arguments);

          return $breaker;
        };

        self.$each();
      ;
        } else {
        result = [];
        number = $scope.get('Opal').$coerce_to(number, $scope.get('Integer'), "to_int");
        if ((($a = number < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('ArgumentError'), "attempt to take negative size")};
        if ((($a = number == 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          return []};
        
        var current = 0;
        number = $scope.get('Opal').$coerce_to(number, $scope.get('Integer'), "to_int");

        self.$each.$$p = function() {
          result.push($scope.get('Opal').$destructure(arguments));

          if (number <= ++current) {
            return $breaker;
          }
        };

        self.$each();
      
      };
      return result;
    });

    Opal.alias(self, 'flat_map', 'collect_concat');

    Opal.defn(self, '$grep', TMP_28 = function(pattern) {
      var $a, self = this, $iter = TMP_28.$$p, block = $iter || nil;

      TMP_28.$$p = null;
      
      var result = [];

      if (block !== nil) {
        self.$each.$$p = function() {
          var param = $scope.get('Opal').$destructure(arguments),
              value = pattern['$==='](param);

          if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
            value = Opal.yield1(block, param);

            if (value === $breaker) {
              result = $breaker.$v;
              return $breaker;
            }

            result.push(value);
          }
        };
      }
      else {
        self.$each.$$p = function() {
          var param = $scope.get('Opal').$destructure(arguments),
              value = pattern['$==='](param);

          if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
            result.push(param);
          }
        };
      }

      self.$each();

      return result;
    ;
    });

    Opal.defn(self, '$group_by', TMP_29 = function() {
      var $a, $b, TMP_30, $c, $d, self = this, $iter = TMP_29.$$p, block = $iter || nil, hash = nil;

      TMP_29.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_30 = function(){var self = TMP_30.$$s || this;

        return self.$enumerator_size()}, TMP_30.$$s = self, TMP_30), $a).call($b, "group_by")
      };
      hash = $scope.get('Hash').$new();
      
      var result;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        (($a = value, $c = hash, ((($d = $c['$[]']($a)) !== false && $d !== nil) ? $d : $c['$[]=']($a, []))))['$<<'](param);
      }

      self.$each();

      if (result !== undefined) {
        return result;
      }
    
      return hash;
    });

    Opal.defn(self, '$include?', function(obj) {
      var self = this;

      
      var result = false;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments);

        if ((param)['$=='](obj)) {
          result = true;
          return $breaker;
        }
      }

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$inject', TMP_31 = function(object, sym) {
      var self = this, $iter = TMP_31.$$p, block = $iter || nil;

      TMP_31.$$p = null;
      
      var result = object;

      if (block !== nil && sym === undefined) {
        self.$each.$$p = function() {
          var value = $scope.get('Opal').$destructure(arguments);

          if (result === undefined) {
            result = value;
            return;
          }

          value = Opal.yieldX(block, [result, value]);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          result = value;
        };
      }
      else {
        if (sym === undefined) {
          if (!$scope.get('Symbol')['$==='](object)) {
            self.$raise($scope.get('TypeError'), "" + (object.$inspect()) + " is not a Symbol");
          }

          sym    = object;
          result = undefined;
        }

        self.$each.$$p = function() {
          var value = $scope.get('Opal').$destructure(arguments);

          if (result === undefined) {
            result = value;
            return;
          }

          result = (result).$__send__(sym, value);
        };
      }

      self.$each();

      return result == undefined ? nil : result;
    ;
    });

    Opal.defn(self, '$lazy', function() {
      var $a, $b, TMP_32, self = this;

      return ($a = ($b = (($scope.get('Enumerator')).$$scope.get('Lazy'))).$new, $a.$$p = (TMP_32 = function(enum$, args){var self = TMP_32.$$s || this, $a;
if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
      return ($a = enum$).$yield.apply($a, Opal.to_a(args))}, TMP_32.$$s = self, TMP_32), $a).call($b, self, self.$enumerator_size());
    });

    Opal.defn(self, '$enumerator_size', function() {
      var $a, self = this;

      if ((($a = self['$respond_to?']("size")) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$size()
        } else {
        return nil
      };
    });

    Opal.alias(self, 'map', 'collect');

    Opal.defn(self, '$max', TMP_33 = function() {
      var self = this, $iter = TMP_33.$$p, block = $iter || nil;

      TMP_33.$$p = null;
      
      var result;

      if (block !== nil) {
        self.$each.$$p = function() {
          var param = $scope.get('Opal').$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          var value = block(param, result);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if (value === nil) {
            self.$raise($scope.get('ArgumentError'), "comparison failed");
          }

          if (value > 0) {
            result = param;
          }
        };
      }
      else {
        self.$each.$$p = function() {
          var param = $scope.get('Opal').$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          if ($scope.get('Opal').$compare(param, result) > 0) {
            result = param;
          }
        };
      }

      self.$each();

      return result === undefined ? nil : result;
    
    });

    Opal.defn(self, '$max_by', TMP_34 = function() {
      var $a, $b, TMP_35, self = this, $iter = TMP_34.$$p, block = $iter || nil;

      TMP_34.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_35 = function(){var self = TMP_35.$$s || this;

        return self.$enumerator_size()}, TMP_35.$$s = self, TMP_35), $a).call($b, "max_by")
      };
      
      var result,
          by;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if (result === undefined) {
          result = param;
          by     = value;
          return;
        }

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if ((value)['$<=>'](by) > 0) {
          result = param
          by     = value;
        }
      };

      self.$each();

      return result === undefined ? nil : result;
    
    });

    Opal.alias(self, 'member?', 'include?');

    Opal.defn(self, '$min', TMP_36 = function() {
      var self = this, $iter = TMP_36.$$p, block = $iter || nil;

      TMP_36.$$p = null;
      
      var result;

      if (block !== nil) {
        self.$each.$$p = function() {
          var param = $scope.get('Opal').$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          var value = block(param, result);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if (value === nil) {
            self.$raise($scope.get('ArgumentError'), "comparison failed");
          }

          if (value < 0) {
            result = param;
          }
        };
      }
      else {
        self.$each.$$p = function() {
          var param = $scope.get('Opal').$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          if ($scope.get('Opal').$compare(param, result) < 0) {
            result = param;
          }
        };
      }

      self.$each();

      return result === undefined ? nil : result;
    
    });

    Opal.defn(self, '$min_by', TMP_37 = function() {
      var $a, $b, TMP_38, self = this, $iter = TMP_37.$$p, block = $iter || nil;

      TMP_37.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_38 = function(){var self = TMP_38.$$s || this;

        return self.$enumerator_size()}, TMP_38.$$s = self, TMP_38), $a).call($b, "min_by")
      };
      
      var result,
          by;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if (result === undefined) {
          result = param;
          by     = value;
          return;
        }

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if ((value)['$<=>'](by) < 0) {
          result = param
          by     = value;
        }
      };

      self.$each();

      return result === undefined ? nil : result;
    
    });

    Opal.defn(self, '$minmax', TMP_39 = function() {
      var $a, $b, $c, TMP_40, self = this, $iter = TMP_39.$$p, block = $iter || nil;

      TMP_39.$$p = null;
      ((($a = block) !== false && $a !== nil) ? $a : block = ($b = ($c = self).$proc, $b.$$p = (TMP_40 = function(a, b){var self = TMP_40.$$s || this;
if (a == null) a = nil;if (b == null) b = nil;
      return a['$<=>'](b)}, TMP_40.$$s = self, TMP_40), $b).call($c));
      
      var min = nil, max = nil, first_time = true;

      self.$each.$$p = function() {
        var element = $scope.get('Opal').$destructure(arguments);
        if (first_time) {
          min = max = element;
          first_time = false;
        } else {
          var min_cmp = block.$call(min, element);

          if (min_cmp === nil) {
            self.$raise($scope.get('ArgumentError'), "comparison failed")
          } else if (min_cmp > 0) {
            min = element;
          }

          var max_cmp = block.$call(max, element);

          if (max_cmp === nil) {
            self.$raise($scope.get('ArgumentError'), "comparison failed")
          } else if (max_cmp < 0) {
            max = element;
          }
        }
      }

      self.$each();

      return [min, max];
    
    });

    Opal.defn(self, '$minmax_by', TMP_41 = function() {
      var self = this, $iter = TMP_41.$$p, block = $iter || nil;

      TMP_41.$$p = null;
      return self.$raise($scope.get('NotImplementedError'));
    });

    Opal.defn(self, '$none?', TMP_42 = function() {
      var $a, self = this, $iter = TMP_42.$$p, block = $iter || nil;

      TMP_42.$$p = null;
      
      var result = true;

      if (block !== nil) {
        self.$each.$$p = function() {
          var value = Opal.yieldX(block, arguments);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
            result = false;
            return $breaker;
          }
        }
      }
      else {
        self.$each.$$p = function() {
          var value = $scope.get('Opal').$destructure(arguments);

          if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
            result = false;
            return $breaker;
          }
        };
      }

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$one?', TMP_43 = function() {
      var $a, self = this, $iter = TMP_43.$$p, block = $iter || nil;

      TMP_43.$$p = null;
      
      var result = false;

      if (block !== nil) {
        self.$each.$$p = function() {
          var value = Opal.yieldX(block, arguments);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
            if (result === true) {
              result = false;
              return $breaker;
            }

            result = true;
          }
        }
      }
      else {
        self.$each.$$p = function() {
          var value = $scope.get('Opal').$destructure(arguments);

          if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
            if (result === true) {
              result = false;
              return $breaker;
            }

            result = true;
          }
        }
      }

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$partition', TMP_44 = function() {
      var $a, $b, TMP_45, self = this, $iter = TMP_44.$$p, block = $iter || nil;

      TMP_44.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_45 = function(){var self = TMP_45.$$s || this;

        return self.$enumerator_size()}, TMP_45.$$s = self, TMP_45), $a).call($b, "partition")
      };
      
      var truthy = [], falsy = [], result;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
          truthy.push(param);
        }
        else {
          falsy.push(param);
        }
      };

      self.$each();

      return [truthy, falsy];
    
    });

    Opal.alias(self, 'reduce', 'inject');

    Opal.defn(self, '$reject', TMP_46 = function() {
      var $a, $b, TMP_47, self = this, $iter = TMP_46.$$p, block = $iter || nil;

      TMP_46.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_47 = function(){var self = TMP_47.$$s || this;

        return self.$enumerator_size()}, TMP_47.$$s = self, TMP_47), $a).call($b, "reject")
      };
      
      var result = [];

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if ((($a = value) === nil || ($a.$$is_boolean && $a == false))) {
          result.push(param);
        }
      };

      self.$each();

      return result;
    
    });

    Opal.defn(self, '$reverse_each', TMP_48 = function() {
      var $a, $b, TMP_49, self = this, $iter = TMP_48.$$p, block = $iter || nil;

      TMP_48.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_49 = function(){var self = TMP_49.$$s || this;

        return self.$enumerator_size()}, TMP_49.$$s = self, TMP_49), $a).call($b, "reverse_each")
      };
      
      var result = [];

      self.$each.$$p = function() {
        result.push(arguments);
      };

      self.$each();

      for (var i = result.length - 1; i >= 0; i--) {
        Opal.yieldX(block, result[i]);
      }

      return result;
    
    });

    Opal.alias(self, 'select', 'find_all');

    Opal.defn(self, '$slice_before', TMP_50 = function(pattern) {
      var $a, $b, TMP_51, self = this, $iter = TMP_50.$$p, block = $iter || nil;

      TMP_50.$$p = null;
      if ((($a = pattern === undefined && block === nil || arguments.length > 1) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 1)")};
      return ($a = ($b = $scope.get('Enumerator')).$new, $a.$$p = (TMP_51 = function(e){var self = TMP_51.$$s || this, $a;
if (e == null) e = nil;
      
        var slice = [];

        if (block !== nil) {
          if (pattern === undefined) {
            self.$each.$$p = function() {
              var param = $scope.get('Opal').$destructure(arguments),
                  value = Opal.yield1(block, param);

              if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true)) && slice.length > 0) {
                e['$<<'](slice);
                slice = [];
              }

              slice.push(param);
            };
          }
          else {
            self.$each.$$p = function() {
              var param = $scope.get('Opal').$destructure(arguments),
                  value = block(param, pattern.$dup());

              if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true)) && slice.length > 0) {
                e['$<<'](slice);
                slice = [];
              }

              slice.push(param);
            };
          }
        }
        else {
          self.$each.$$p = function() {
            var param = $scope.get('Opal').$destructure(arguments),
                value = pattern['$==='](param);

            if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true)) && slice.length > 0) {
              e['$<<'](slice);
              slice = [];
            }

            slice.push(param);
          };
        }

        self.$each();

        if (slice.length > 0) {
          e['$<<'](slice);
        }
      ;}, TMP_51.$$s = self, TMP_51), $a).call($b);
    });

    Opal.defn(self, '$sort', TMP_52 = function() {
      var $a, $b, TMP_53, self = this, $iter = TMP_52.$$p, block = $iter || nil, ary = nil;

      TMP_52.$$p = null;
      ary = self.$to_a();
      if ((block !== nil)) {
        } else {
        block = ($a = ($b = self).$lambda, $a.$$p = (TMP_53 = function(a, b){var self = TMP_53.$$s || this;
if (a == null) a = nil;if (b == null) b = nil;
        return a['$<=>'](b)}, TMP_53.$$s = self, TMP_53), $a).call($b)
      };
      return ary.sort(block);
    });

    Opal.defn(self, '$sort_by', TMP_54 = function() {
      var $a, $b, TMP_55, $c, TMP_56, $d, TMP_57, $e, TMP_58, self = this, $iter = TMP_54.$$p, block = $iter || nil, dup = nil;

      TMP_54.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_55 = function(){var self = TMP_55.$$s || this;

        return self.$enumerator_size()}, TMP_55.$$s = self, TMP_55), $a).call($b, "sort_by")
      };
      dup = ($a = ($c = self).$map, $a.$$p = (TMP_56 = function(){var self = TMP_56.$$s || this, arg = nil;

      arg = $scope.get('Opal').$destructure(arguments);
        return [block.$call(arg), arg];}, TMP_56.$$s = self, TMP_56), $a).call($c);
      ($a = ($d = dup)['$sort!'], $a.$$p = (TMP_57 = function(a, b){var self = TMP_57.$$s || this;
if (a == null) a = nil;if (b == null) b = nil;
      return (a[0])['$<=>'](b[0])}, TMP_57.$$s = self, TMP_57), $a).call($d);
      return ($a = ($e = dup)['$map!'], $a.$$p = (TMP_58 = function(i){var self = TMP_58.$$s || this;
if (i == null) i = nil;
      return i[1];}, TMP_58.$$s = self, TMP_58), $a).call($e);
    });

    Opal.defn(self, '$take', function(num) {
      var self = this;

      return self.$first(num);
    });

    Opal.defn(self, '$take_while', TMP_59 = function() {
      var $a, self = this, $iter = TMP_59.$$p, block = $iter || nil;

      TMP_59.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return self.$enum_for("take_while")
      };
      
      var result = [];

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if ((($a = value) === nil || ($a.$$is_boolean && $a == false))) {
          return $breaker;
        }

        result.push(param);
      };

      self.$each();

      return result;
    
    });

    Opal.alias(self, 'to_a', 'entries');

    Opal.defn(self, '$zip', TMP_60 = function() {
      var $a, self = this, $iter = TMP_60.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var others = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        others[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_60.$$p = null;
      return ($a = self.$to_a()).$zip.apply($a, Opal.to_a(others));
    });
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/enumerator"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$include', '$allocate', '$new', '$to_proc', '$coerce_to', '$nil?', '$empty?', '$+', '$class', '$__send__', '$===', '$call', '$enum_for', '$size', '$destructure', '$inspect', '$[]', '$raise', '$yield', '$each', '$enumerator_size', '$respond_to?', '$try_convert', '$<', '$for']);
  self.$require("corelib/enumerable");
  return (function($base, $super) {
    function $Enumerator(){};
    var self = $Enumerator = $klass($base, $super, 'Enumerator', $Enumerator);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4;

    def.size = def.args = def.object = def.method = nil;
    self.$include($scope.get('Enumerable'));

    def.$$is_enumerator = true;

    Opal.defs(self, '$for', TMP_1 = function(object, method) {
      var self = this, $iter = TMP_1.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 2;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 2];
      }
      if (method == null) {
        method = "each"
      }
      TMP_1.$$p = null;
      
      var obj = self.$allocate();

      obj.object = object;
      obj.size   = block;
      obj.method = method;
      obj.args   = args;

      return obj;
    ;
    });

    Opal.defn(self, '$initialize', TMP_2 = function() {
      var $a, $b, self = this, $iter = TMP_2.$$p, block = $iter || nil;

      TMP_2.$$p = null;
      if (block !== false && block !== nil) {
        self.object = ($a = ($b = $scope.get('Generator')).$new, $a.$$p = block.$to_proc(), $a).call($b);
        self.method = "each";
        self.args = [];
        self.size = arguments[0] || nil;
        if ((($a = self.size) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self.size = $scope.get('Opal').$coerce_to(self.size, $scope.get('Integer'), "to_int")
          } else {
          return nil
        };
        } else {
        self.object = arguments[0];
        self.method = arguments[1] || "each";
        self.args = $slice.call(arguments, 2);
        return self.size = nil;
      };
    });

    Opal.defn(self, '$each', TMP_3 = function() {
      var $a, $b, $c, self = this, $iter = TMP_3.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_3.$$p = null;
      if ((($a = ($b = block['$nil?'](), $b !== false && $b !== nil ?args['$empty?']() : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self};
      args = $rb_plus(self.args, args);
      if ((($a = block['$nil?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return ($a = self.$class()).$new.apply($a, [self.object, self.method].concat(Opal.to_a(args)))};
      return ($b = ($c = self.object).$__send__, $b.$$p = block.$to_proc(), $b).apply($c, [self.method].concat(Opal.to_a(args)));
    });

    Opal.defn(self, '$size', function() {
      var $a, self = this;

      if ((($a = $scope.get('Proc')['$==='](self.size)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return ($a = self.size).$call.apply($a, Opal.to_a(self.args))
        } else {
        return self.size
      };
    });

    Opal.defn(self, '$with_index', TMP_4 = function(offset) {
      var $a, $b, TMP_5, self = this, $iter = TMP_4.$$p, block = $iter || nil;

      if (offset == null) {
        offset = 0
      }
      TMP_4.$$p = null;
      if (offset !== false && offset !== nil) {
        offset = $scope.get('Opal').$coerce_to(offset, $scope.get('Integer'), "to_int")
        } else {
        offset = 0
      };
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_5 = function(){var self = TMP_5.$$s || this;

        return self.$size()}, TMP_5.$$s = self, TMP_5), $a).call($b, "with_index", offset)
      };
      
      var result, index = offset;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = block(param, index);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        index++;

        return value;
      }

      self.$each();

      if (result !== undefined) {
        return result;
      }

      return self.object;
    
    });

    Opal.alias(self, 'with_object', 'each_with_object');

    Opal.defn(self, '$inspect', function() {
      var $a, self = this, result = nil;

      result = "#<" + (self.$class()) + ": " + (self.object.$inspect()) + ":" + (self.method);
      if ((($a = self.args['$empty?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        result = $rb_plus(result, "(" + (self.args.$inspect()['$[]']($scope.get('Range').$new(1, -2))) + ")")
      };
      return $rb_plus(result, ">");
    });

    (function($base, $super) {
      function $Generator(){};
      var self = $Generator = $klass($base, $super, 'Generator', $Generator);

      var def = self.$$proto, $scope = self.$$scope, TMP_6, TMP_7;

      def.block = nil;
      self.$include($scope.get('Enumerable'));

      Opal.defn(self, '$initialize', TMP_6 = function() {
        var self = this, $iter = TMP_6.$$p, block = $iter || nil;

        TMP_6.$$p = null;
        if (block !== false && block !== nil) {
          } else {
          self.$raise($scope.get('LocalJumpError'), "no block given")
        };
        return self.block = block;
      });

      return (Opal.defn(self, '$each', TMP_7 = function() {
        var $a, $b, self = this, $iter = TMP_7.$$p, block = $iter || nil, yielder = nil, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var args = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          args[$splat_index] = arguments[$splat_index + 0];
        }
        TMP_7.$$p = null;
        yielder = ($a = ($b = $scope.get('Yielder')).$new, $a.$$p = block.$to_proc(), $a).call($b);
        
        try {
          args.unshift(yielder);

          if (Opal.yieldX(self.block, args) === $breaker) {
            return $breaker.$v;
          }
        }
        catch (e) {
          if (e === $breaker) {
            return $breaker.$v;
          }
          else {
            throw e;
          }
        }
      ;
        return self;
      }), nil) && 'each';
    })($scope.base, null);

    (function($base, $super) {
      function $Yielder(){};
      var self = $Yielder = $klass($base, $super, 'Yielder', $Yielder);

      var def = self.$$proto, $scope = self.$$scope, TMP_8;

      def.block = nil;
      Opal.defn(self, '$initialize', TMP_8 = function() {
        var self = this, $iter = TMP_8.$$p, block = $iter || nil;

        TMP_8.$$p = null;
        return self.block = block;
      });

      Opal.defn(self, '$yield', function() {
        var self = this, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var values = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          values[$splat_index] = arguments[$splat_index + 0];
        }
        
        var value = Opal.yieldX(self.block, values);

        if (value === $breaker) {
          throw $breaker;
        }

        return value;
      ;
      });

      return (Opal.defn(self, '$<<', function() {
        var $a, self = this, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var values = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          values[$splat_index] = arguments[$splat_index + 0];
        }
        ($a = self).$yield.apply($a, Opal.to_a(values));
        return self;
      }), nil) && '<<';
    })($scope.base, null);

    return (function($base, $super) {
      function $Lazy(){};
      var self = $Lazy = $klass($base, $super, 'Lazy', $Lazy);

      var def = self.$$proto, $scope = self.$$scope, TMP_9, TMP_12, TMP_14, TMP_19, TMP_21, TMP_22, TMP_24, TMP_27, TMP_30;

      def.enumerator = nil;
      (function($base, $super) {
        function $StopLazyError(){};
        var self = $StopLazyError = $klass($base, $super, 'StopLazyError', $StopLazyError);

        var def = self.$$proto, $scope = self.$$scope;

        return nil;
      })($scope.base, $scope.get('Exception'));

      Opal.defn(self, '$initialize', TMP_9 = function(object, size) {
        var TMP_10, self = this, $iter = TMP_9.$$p, block = $iter || nil;

        if (size == null) {
          size = nil
        }
        TMP_9.$$p = null;
        if ((block !== nil)) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy new without a block")
        };
        self.enumerator = object;
        return Opal.find_super_dispatcher(self, 'initialize', TMP_9, (TMP_10 = function(yielder, each_args){var self = TMP_10.$$s || this, $a, $b, TMP_11;
if (yielder == null) yielder = nil;each_args = $slice.call(arguments, 1);
        try {
          return ($a = ($b = object).$each, $a.$$p = (TMP_11 = function(args){var self = TMP_11.$$s || this;
args = $slice.call(arguments, 0);
            
              args.unshift(yielder);

              if (Opal.yieldX(block, args) === $breaker) {
                return $breaker;
              }
            ;}, TMP_11.$$s = self, TMP_11), $a).apply($b, Opal.to_a(each_args))
          } catch ($err) {if (Opal.rescue($err, [$scope.get('Exception')])) {
            try {
              return nil
            } finally {
              Opal.gvars["!"] = Opal.exceptions.pop() || Opal.nil;
            }
            }else { throw $err; }
          }}, TMP_10.$$s = self, TMP_10)).apply(self, [size]);
      });

      Opal.alias(self, 'force', 'to_a');

      Opal.defn(self, '$lazy', function() {
        var self = this;

        return self;
      });

      Opal.defn(self, '$collect', TMP_12 = function() {
        var $a, $b, TMP_13, self = this, $iter = TMP_12.$$p, block = $iter || nil;

        TMP_12.$$p = null;
        if (block !== false && block !== nil) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy map without a block")
        };
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_13 = function(enum$, args){var self = TMP_13.$$s || this;
if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        
          var value = Opal.yieldX(block, args);

          if (value === $breaker) {
            return $breaker;
          }

          enum$.$yield(value);
        }, TMP_13.$$s = self, TMP_13), $a).call($b, self, self.$enumerator_size());
      });

      Opal.defn(self, '$collect_concat', TMP_14 = function() {
        var $a, $b, TMP_15, self = this, $iter = TMP_14.$$p, block = $iter || nil;

        TMP_14.$$p = null;
        if (block !== false && block !== nil) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy map without a block")
        };
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_15 = function(enum$, args){var self = TMP_15.$$s || this, $a, $b, TMP_16, $c, TMP_17;
if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        
          var value = Opal.yieldX(block, args);

          if (value === $breaker) {
            return $breaker;
          }

          if ((value)['$respond_to?']("force") && (value)['$respond_to?']("each")) {
            ($a = ($b = (value)).$each, $a.$$p = (TMP_16 = function(v){var self = TMP_16.$$s || this;
if (v == null) v = nil;
          return enum$.$yield(v)}, TMP_16.$$s = self, TMP_16), $a).call($b)
          }
          else {
            var array = $scope.get('Opal').$try_convert(value, $scope.get('Array'), "to_ary");

            if (array === nil) {
              enum$.$yield(value);
            }
            else {
              ($a = ($c = (value)).$each, $a.$$p = (TMP_17 = function(v){var self = TMP_17.$$s || this;
if (v == null) v = nil;
          return enum$.$yield(v)}, TMP_17.$$s = self, TMP_17), $a).call($c);
            }
          }
        ;}, TMP_15.$$s = self, TMP_15), $a).call($b, self, nil);
      });

      Opal.defn(self, '$drop', function(n) {
        var $a, $b, TMP_18, self = this, current_size = nil, set_size = nil, dropped = nil;

        n = $scope.get('Opal').$coerce_to(n, $scope.get('Integer'), "to_int");
        if ((($a = $rb_lt(n, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('ArgumentError'), "attempt to drop negative size")};
        current_size = self.$enumerator_size();
        set_size = (function() {if ((($a = $scope.get('Integer')['$==='](current_size)) !== nil && (!$a.$$is_boolean || $a == true))) {
          if ((($a = $rb_lt(n, current_size)) !== nil && (!$a.$$is_boolean || $a == true))) {
            return n
            } else {
            return current_size
          }
          } else {
          return current_size
        }; return nil; })();
        dropped = 0;
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_18 = function(enum$, args){var self = TMP_18.$$s || this, $a;
if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        if ((($a = $rb_lt(dropped, n)) !== nil && (!$a.$$is_boolean || $a == true))) {
            return dropped = $rb_plus(dropped, 1)
            } else {
            return ($a = enum$).$yield.apply($a, Opal.to_a(args))
          }}, TMP_18.$$s = self, TMP_18), $a).call($b, self, set_size);
      });

      Opal.defn(self, '$drop_while', TMP_19 = function() {
        var $a, $b, TMP_20, self = this, $iter = TMP_19.$$p, block = $iter || nil, succeeding = nil;

        TMP_19.$$p = null;
        if (block !== false && block !== nil) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy drop_while without a block")
        };
        succeeding = true;
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_20 = function(enum$, args){var self = TMP_20.$$s || this, $a, $b;
if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        if (succeeding !== false && succeeding !== nil) {
            
            var value = Opal.yieldX(block, args);

            if (value === $breaker) {
              return $breaker;
            }

            if ((($a = value) === nil || ($a.$$is_boolean && $a == false))) {
              succeeding = false;

              ($a = enum$).$yield.apply($a, Opal.to_a(args));
            }
          
            } else {
            return ($b = enum$).$yield.apply($b, Opal.to_a(args))
          }}, TMP_20.$$s = self, TMP_20), $a).call($b, self, nil);
      });

      Opal.defn(self, '$enum_for', TMP_21 = function(method) {
        var $a, $b, self = this, $iter = TMP_21.$$p, block = $iter || nil, $splat_index = nil;

        var array_size = arguments.length - 1;
        if(array_size < 0) array_size = 0;
        var args = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          args[$splat_index] = arguments[$splat_index + 1];
        }
        if (method == null) {
          method = "each"
        }
        TMP_21.$$p = null;
        return ($a = ($b = self.$class()).$for, $a.$$p = block.$to_proc(), $a).apply($b, [self, method].concat(Opal.to_a(args)));
      });

      Opal.defn(self, '$find_all', TMP_22 = function() {
        var $a, $b, TMP_23, self = this, $iter = TMP_22.$$p, block = $iter || nil;

        TMP_22.$$p = null;
        if (block !== false && block !== nil) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy select without a block")
        };
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_23 = function(enum$, args){var self = TMP_23.$$s || this, $a;
if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        
          var value = Opal.yieldX(block, args);

          if (value === $breaker) {
            return $breaker;
          }

          if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
            ($a = enum$).$yield.apply($a, Opal.to_a(args));
          }
        ;}, TMP_23.$$s = self, TMP_23), $a).call($b, self, nil);
      });

      Opal.alias(self, 'flat_map', 'collect_concat');

      Opal.defn(self, '$grep', TMP_24 = function(pattern) {
        var $a, $b, TMP_25, $c, TMP_26, self = this, $iter = TMP_24.$$p, block = $iter || nil;

        TMP_24.$$p = null;
        if (block !== false && block !== nil) {
          return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_25 = function(enum$, args){var self = TMP_25.$$s || this, $a;
if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
          
            var param = $scope.get('Opal').$destructure(args),
                value = pattern['$==='](param);

            if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
              value = Opal.yield1(block, param);

              if (value === $breaker) {
                return $breaker;
              }

              enum$.$yield(Opal.yield1(block, param));
            }
          ;}, TMP_25.$$s = self, TMP_25), $a).call($b, self, nil)
          } else {
          return ($a = ($c = $scope.get('Lazy')).$new, $a.$$p = (TMP_26 = function(enum$, args){var self = TMP_26.$$s || this, $a;
if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
          
            var param = $scope.get('Opal').$destructure(args),
                value = pattern['$==='](param);

            if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
              enum$.$yield(param);
            }
          ;}, TMP_26.$$s = self, TMP_26), $a).call($c, self, nil)
        };
      });

      Opal.alias(self, 'map', 'collect');

      Opal.alias(self, 'select', 'find_all');

      Opal.defn(self, '$reject', TMP_27 = function() {
        var $a, $b, TMP_28, self = this, $iter = TMP_27.$$p, block = $iter || nil;

        TMP_27.$$p = null;
        if (block !== false && block !== nil) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy reject without a block")
        };
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_28 = function(enum$, args){var self = TMP_28.$$s || this, $a;
if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        
          var value = Opal.yieldX(block, args);

          if (value === $breaker) {
            return $breaker;
          }

          if ((($a = value) === nil || ($a.$$is_boolean && $a == false))) {
            ($a = enum$).$yield.apply($a, Opal.to_a(args));
          }
        ;}, TMP_28.$$s = self, TMP_28), $a).call($b, self, nil);
      });

      Opal.defn(self, '$take', function(n) {
        var $a, $b, TMP_29, self = this, current_size = nil, set_size = nil, taken = nil;

        n = $scope.get('Opal').$coerce_to(n, $scope.get('Integer'), "to_int");
        if ((($a = $rb_lt(n, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('ArgumentError'), "attempt to take negative size")};
        current_size = self.$enumerator_size();
        set_size = (function() {if ((($a = $scope.get('Integer')['$==='](current_size)) !== nil && (!$a.$$is_boolean || $a == true))) {
          if ((($a = $rb_lt(n, current_size)) !== nil && (!$a.$$is_boolean || $a == true))) {
            return n
            } else {
            return current_size
          }
          } else {
          return current_size
        }; return nil; })();
        taken = 0;
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_29 = function(enum$, args){var self = TMP_29.$$s || this, $a;
if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        if ((($a = $rb_lt(taken, n)) !== nil && (!$a.$$is_boolean || $a == true))) {
            ($a = enum$).$yield.apply($a, Opal.to_a(args));
            return taken = $rb_plus(taken, 1);
            } else {
            return self.$raise($scope.get('StopLazyError'))
          }}, TMP_29.$$s = self, TMP_29), $a).call($b, self, set_size);
      });

      Opal.defn(self, '$take_while', TMP_30 = function() {
        var $a, $b, TMP_31, self = this, $iter = TMP_30.$$p, block = $iter || nil;

        TMP_30.$$p = null;
        if (block !== false && block !== nil) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy take_while without a block")
        };
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_31 = function(enum$, args){var self = TMP_31.$$s || this, $a;
if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        
          var value = Opal.yieldX(block, args);

          if (value === $breaker) {
            return $breaker;
          }

          if ((($a = value) !== nil && (!$a.$$is_boolean || $a == true))) {
            ($a = enum$).$yield.apply($a, Opal.to_a(args));
          }
          else {
            self.$raise($scope.get('StopLazyError'));
          }
        ;}, TMP_31.$$s = self, TMP_31), $a).call($b, self, nil);
      });

      Opal.alias(self, 'to_enum', 'enum_for');

      return (Opal.defn(self, '$inspect', function() {
        var self = this;

        return "#<" + (self.$class()) + ": " + (self.enumerator.$inspect()) + ">";
      }), nil) && 'inspect';
    })($scope.base, self);
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/numeric"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$include', '$instance_of?', '$class', '$Float', '$coerce', '$===', '$raise', '$__send__', '$equal?', '$coerce_to!', '$-@', '$**', '$-', '$*', '$div', '$<', '$ceil', '$to_f', '$denominator', '$to_r', '$==', '$floor', '$/', '$%', '$Complex', '$zero?', '$numerator', '$abs', '$arg', '$round', '$to_i', '$truncate', '$>']);
  self.$require("corelib/comparable");
  return (function($base, $super) {
    function $Numeric(){};
    var self = $Numeric = $klass($base, $super, 'Numeric', $Numeric);

    var def = self.$$proto, $scope = self.$$scope;

    self.$include($scope.get('Comparable'));

    Opal.defn(self, '$coerce', function(other) {
      var $a, self = this;

      if ((($a = other['$instance_of?'](self.$class())) !== nil && (!$a.$$is_boolean || $a == true))) {
        return [other, self]};
      return [self.$Float(other), self.$Float(self)];
    });

    Opal.defn(self, '$__coerced__', function(method, other) {
      var $a, $b, self = this, a = nil, b = nil, $case = nil;

      try {
      $b = other.$coerce(self), $a = Opal.to_ary($b), a = ($a[0] == null ? nil : $a[0]), b = ($a[1] == null ? nil : $a[1]), $b
      } catch ($err) {if (true) {
        try {
          $case = method;if ("+"['$===']($case) || "-"['$===']($case) || "*"['$===']($case) || "/"['$===']($case) || "%"['$===']($case) || "&"['$===']($case) || "|"['$===']($case) || "^"['$===']($case) || "**"['$===']($case)) {self.$raise($scope.get('TypeError'), "" + (other.$class()) + " can't be coerce into Numeric")}else if (">"['$===']($case) || ">="['$===']($case) || "<"['$===']($case) || "<="['$===']($case) || "<=>"['$===']($case)) {self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")}
        } finally {
          Opal.gvars["!"] = Opal.exceptions.pop() || Opal.nil;
        }
        }else { throw $err; }
      };
      return a.$__send__(method, b);
    });

    Opal.defn(self, '$<=>', function(other) {
      var $a, self = this;

      if ((($a = self['$equal?'](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return 0};
      return nil;
    });

    Opal.defn(self, '$[]', function(bit) {
      var self = this, min = nil, max = nil;

      bit = $scope.get('Opal')['$coerce_to!'](bit, $scope.get('Integer'), "to_int");
      min = ((2)['$**'](30))['$-@']();
      max = $rb_minus(((2)['$**'](30)), 1);
      return (bit < min || bit > max) ? 0 : (self >> bit) % 2;
    });

    Opal.defn(self, '$+@', function() {
      var self = this;

      return self;
    });

    Opal.defn(self, '$-@', function() {
      var self = this;

      return $rb_minus(0, self);
    });

    Opal.defn(self, '$%', function(other) {
      var self = this;

      return $rb_minus(self, $rb_times(other, self.$div(other)));
    });

    Opal.defn(self, '$abs', function() {
      var self = this;

      if ($rb_lt(self, 0)) {
        return self['$-@']()
        } else {
        return self
      };
    });

    Opal.defn(self, '$abs2', function() {
      var self = this;

      return $rb_times(self, self);
    });

    Opal.defn(self, '$angle', function() {
      var self = this;

      if ($rb_lt(self, 0)) {
        return (($scope.get('Math')).$$scope.get('PI'))
        } else {
        return 0
      };
    });

    Opal.alias(self, 'arg', 'angle');

    Opal.defn(self, '$ceil', function() {
      var self = this;

      return self.$to_f().$ceil();
    });

    Opal.defn(self, '$conj', function() {
      var self = this;

      return self;
    });

    Opal.alias(self, 'conjugate', 'conj');

    Opal.defn(self, '$denominator', function() {
      var self = this;

      return self.$to_r().$denominator();
    });

    Opal.defn(self, '$div', function(other) {
      var self = this;

      if (other['$=='](0)) {
        self.$raise($scope.get('ZeroDivisionError'), "divided by o")};
      return ($rb_divide(self, other)).$floor();
    });

    Opal.defn(self, '$divmod', function(other) {
      var self = this;

      return [self.$div(other), self['$%'](other)];
    });

    Opal.defn(self, '$fdiv', function(other) {
      var self = this;

      return $rb_divide(self.$to_f(), other);
    });

    Opal.defn(self, '$floor', function() {
      var self = this;

      return self.$to_f().$floor();
    });

    Opal.defn(self, '$i', function() {
      var self = this;

      return self.$Complex(0, self);
    });

    Opal.defn(self, '$imag', function() {
      var self = this;

      return 0;
    });

    Opal.alias(self, 'imaginary', 'imag');

    Opal.defn(self, '$integer?', function() {
      var self = this;

      return false;
    });

    Opal.alias(self, 'magnitude', 'abs');

    Opal.alias(self, 'modulo', '%');

    Opal.defn(self, '$nonzero?', function() {
      var $a, self = this;

      if ((($a = self['$zero?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return nil
        } else {
        return self
      };
    });

    Opal.defn(self, '$numerator', function() {
      var self = this;

      return self.$to_r().$numerator();
    });

    Opal.alias(self, 'phase', 'arg');

    Opal.defn(self, '$polar', function() {
      var self = this;

      return [self.$abs(), self.$arg()];
    });

    Opal.defn(self, '$quo', function(other) {
      var self = this;

      return $rb_divide($scope.get('Opal')['$coerce_to!'](self, $scope.get('Rational'), "to_r"), other);
    });

    Opal.defn(self, '$real', function() {
      var self = this;

      return self;
    });

    Opal.defn(self, '$real?', function() {
      var self = this;

      return true;
    });

    Opal.defn(self, '$rect', function() {
      var self = this;

      return [self, 0];
    });

    Opal.alias(self, 'rectangular', 'rect');

    Opal.defn(self, '$round', function(digits) {
      var self = this;

      return self.$to_f().$round(digits);
    });

    Opal.defn(self, '$to_c', function() {
      var self = this;

      return self.$Complex(self, 0);
    });

    Opal.defn(self, '$to_int', function() {
      var self = this;

      return self.$to_i();
    });

    Opal.defn(self, '$truncate', function() {
      var self = this;

      return self.$to_f().$truncate();
    });

    Opal.defn(self, '$zero?', function() {
      var self = this;

      return self['$=='](0);
    });

    Opal.defn(self, '$positive?', function() {
      var self = this;

      return $rb_gt(self, 0);
    });

    Opal.defn(self, '$negative?', function() {
      var self = this;

      return $rb_lt(self, 0);
    });

    Opal.defn(self, '$dup', function() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't dup " + (self.$class()));
    });

    return (Opal.defn(self, '$clone', function() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't clone " + (self.$class()));
    }), nil) && 'clone';
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/array"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$include', '$raise', '$===', '$to_a', '$respond_to?', '$to_ary', '$coerce_to', '$initialize', '$to_proc', '$coerce_to?', '$join', '$to_str', '$class', '$clone', '$hash', '$<=>', '$==', '$object_id', '$inspect', '$enum_for', '$coerce_to!', '$>', '$*', '$enumerator_size', '$empty?', '$copy_singleton_methods', '$initialize_clone', '$initialize_dup', '$replace', '$size', '$eql?', '$length', '$begin', '$end', '$exclude_end?', '$flatten', '$__id__', '$[]', '$to_s', '$new', '$!', '$delete_if', '$each', '$reverse', '$rotate', '$rand', '$at', '$keep_if', '$shuffle!', '$dup', '$<', '$sort', '$!=', '$times', '$[]=', '$<<', '$kind_of?', '$last', '$first', '$upto']);
  self.$require("corelib/enumerable");
  self.$require("corelib/numeric");
  return (function($base, $super) {
    function $Array(){};
    var self = $Array = $klass($base, $super, 'Array', $Array);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_6, TMP_8, TMP_10, TMP_12, TMP_13, TMP_15, TMP_17, TMP_19, TMP_20, TMP_21, TMP_22, TMP_24, TMP_26, TMP_27, TMP_29, TMP_31, TMP_33, TMP_34, TMP_36, TMP_38, TMP_39, TMP_40, TMP_43, TMP_44, TMP_47;

    def.length = nil;
    self.$include($scope.get('Enumerable'));

    def.$$is_array = true;

    Opal.defs(self, '$[]', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var objects = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        objects[$splat_index] = arguments[$splat_index + 0];
      }
      return objects;
    });

    Opal.defn(self, '$initialize', TMP_1 = function(size, obj) {
      var $a, self = this, $iter = TMP_1.$$p, block = $iter || nil;

      if (size == null) {
        size = nil
      }
      if (obj == null) {
        obj = nil
      }
      TMP_1.$$p = null;
      if ((($a = arguments.length > 2) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 0..2)")};
      
      if (arguments.length === 0) {
        self.splice(0, self.length);
        return self;
      }
    
      if ((($a = arguments.length === 1) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $scope.get('Array')['$==='](size)) !== nil && (!$a.$$is_boolean || $a == true))) {
          return size.$to_a()
        } else if ((($a = size['$respond_to?']("to_ary")) !== nil && (!$a.$$is_boolean || $a == true))) {
          return size.$to_ary()}};
      size = $scope.get('Opal').$coerce_to(size, $scope.get('Integer'), "to_int");
      if ((($a = size < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "negative array size")};
      
      self.splice(0, self.length);
      var i, value;

      if (block === nil) {
        for (i = 0; i < size; i++) {
          self.push(obj);
        }
      }
      else {
        for (i = 0, value; i < size; i++) {
          value = block(i);

          if (value === $breaker) {
            return $breaker.$v;
          }

          self[i] = value;
        }
      }

      return self;
    
    });

    Opal.defs(self, '$new', TMP_2 = function() {
      var $a, $b, self = this, $iter = TMP_2.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_2.$$p = null;
      return ($a = ($b = []).$initialize, $a.$$p = block.$to_proc(), $a).apply($b, Opal.to_a(args));
    });

    Opal.defs(self, '$try_convert', function(obj) {
      var self = this;

      return $scope.get('Opal')['$coerce_to?'](obj, $scope.get('Array'), "to_ary");
    });

    Opal.defn(self, '$&', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      
      var result = [], hash = $hash2([], {}), i, length, item;

      for (i = 0, length = other.length; i < length; i++) {
        Opal.hash_put(hash, other[i], true);
      }

      for (i = 0, length = self.length; i < length; i++) {
        item = self[i];
        if (Opal.hash_delete(hash, item) !== undefined) {
          result.push(item);
        }
      }

      return result;
    ;
    });

    Opal.defn(self, '$|', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      
      var hash = $hash2([], {}), i, length, item;

      for (i = 0, length = self.length; i < length; i++) {
        Opal.hash_put(hash, self[i], true);
      }

      for (i = 0, length = other.length; i < length; i++) {
        Opal.hash_put(hash, other[i], true);
      }

      return hash.$keys();
    ;
    });

    Opal.defn(self, '$*', function(other) {
      var $a, self = this;

      if ((($a = other['$respond_to?']("to_str")) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$join(other.$to_str())};
      if ((($a = other['$respond_to?']("to_int")) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "no implicit conversion of " + (other.$class()) + " into Integer")
      };
      other = $scope.get('Opal').$coerce_to(other, $scope.get('Integer'), "to_int");
      if ((($a = other < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "negative argument")};
      
      var result = [];

      for (var i = 0; i < other; i++) {
        result = result.concat(self);
      }

      return result;
    
    });

    Opal.defn(self, '$+', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      return self.concat(other);
    });

    Opal.defn(self, '$-', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      if ((($a = self.length === 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        return []};
      if ((($a = other.length === 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$clone()};
      
      var result = [], hash = $hash2([], {}), i, length, item;

      for (i = 0, length = other.length; i < length; i++) {
        Opal.hash_put(hash, other[i], true);
      }

      for (i = 0, length = self.length; i < length; i++) {
        item = self[i];
        if (Opal.hash_get(hash, item) === undefined) {
          result.push(item);
        }
      }

      return result;
    ;
    });

    Opal.defn(self, '$<<', function(object) {
      var self = this;

      self.push(object);
      return self;
    });

    Opal.defn(self, '$<=>', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
      } else if ((($a = other['$respond_to?']("to_ary")) !== nil && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_ary().$to_a()
        } else {
        return nil
      };
      
      if (self.$hash() === other.$hash()) {
        return 0;
      }

      var count = Math.min(self.length, other.length);

      for (var i = 0; i < count; i++) {
        var tmp = (self[i])['$<=>'](other[i]);

        if (tmp !== 0) {
          return tmp;
        }
      }

      return (self.length)['$<=>'](other.length);
    ;
    });

    Opal.defn(self, '$==', function(other) {
      var self = this;

      
      var recursed = {};

      function _eqeq(array, other) {
        var i, length, a, b;

        if (array === other)
          return true;

        if (!other.$$is_array) {
          if ($scope.get('Opal')['$respond_to?'](other, "to_ary")) {
            return (other)['$=='](array);
          } else {
            return false;
          }
        }

        if (array.constructor !== Array)
          array = array.literal;
        if (other.constructor !== Array)
          other = other.literal;

        if (array.length !== other.length) {
          return false;
        }

        recursed[(array).$object_id()] = true;

        for (i = 0, length = array.length; i < length; i++) {
          a = array[i];
          b = other[i];
          if (a.$$is_array) {
            if (b.$$is_array && b.length !== a.length) {
              return false;
            }
            if (!recursed.hasOwnProperty((a).$object_id())) {
              if (!_eqeq(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$=='](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eqeq(self, other);
    ;
    });

    Opal.defn(self, '$[]', function(index, length) {
      var self = this;

      
      var size = self.length,
          exclude, from, to;

      if (index.$$is_range) {
        exclude = index.exclude;
        from    = $scope.get('Opal').$coerce_to(index.begin, $scope.get('Integer'), "to_int");
        to      = $scope.get('Opal').$coerce_to(index.end, $scope.get('Integer'), "to_int");

        if (from < 0) {
          from += size;

          if (from < 0) {
            return nil;
          }
        }

        if (from > size) {
          return nil;
        }

        if (to < 0) {
          to += size;

          if (to < 0) {
            return [];
          }
        }

        if (!exclude) {
          to += 1;
        }

        return self.slice(from, to);
      }
      else {
        index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");

        if (index < 0) {
          index += size;

          if (index < 0) {
            return nil;
          }
        }

        if (length === undefined) {
          if (index >= size || index < 0) {
            return nil;
          }

          return self[index];
        }
        else {
          length = $scope.get('Opal').$coerce_to(length, $scope.get('Integer'), "to_int");

          if (length < 0 || index > size || index < 0) {
            return nil;
          }

          return self.slice(index, index + length);
        }
      }
    
    });

    Opal.defn(self, '$[]=', function(index, value, extra) {
      var $a, self = this, data = nil, length = nil;

      
      var i, size = self.length;
    
      if ((($a = $scope.get('Range')['$==='](index)) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $scope.get('Array')['$==='](value)) !== nil && (!$a.$$is_boolean || $a == true))) {
          data = value.$to_a()
        } else if ((($a = value['$respond_to?']("to_ary")) !== nil && (!$a.$$is_boolean || $a == true))) {
          data = value.$to_ary().$to_a()
          } else {
          data = [value]
        };
        
        var exclude = index.exclude,
            from    = $scope.get('Opal').$coerce_to(index.begin, $scope.get('Integer'), "to_int"),
            to      = $scope.get('Opal').$coerce_to(index.end, $scope.get('Integer'), "to_int");

        if (from < 0) {
          from += size;

          if (from < 0) {
            self.$raise($scope.get('RangeError'), "" + (index.$inspect()) + " out of range");
          }
        }

        if (to < 0) {
          to += size;
        }

        if (!exclude) {
          to += 1;
        }

        if (from > size) {
          for (i = size; i < from; i++) {
            self[i] = nil;
          }
        }

        if (to < 0) {
          self.splice.apply(self, [from, 0].concat(data));
        }
        else {
          self.splice.apply(self, [from, to - from].concat(data));
        }

        return value;
      ;
        } else {
        if ((($a = extra === undefined) !== nil && (!$a.$$is_boolean || $a == true))) {
          length = 1
          } else {
          length = value;
          value = extra;
          if ((($a = $scope.get('Array')['$==='](value)) !== nil && (!$a.$$is_boolean || $a == true))) {
            data = value.$to_a()
          } else if ((($a = value['$respond_to?']("to_ary")) !== nil && (!$a.$$is_boolean || $a == true))) {
            data = value.$to_ary().$to_a()
            } else {
            data = [value]
          };
        };
        
        var old;

        index  = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");
        length = $scope.get('Opal').$coerce_to(length, $scope.get('Integer'), "to_int");

        if (index < 0) {
          old    = index;
          index += size;

          if (index < 0) {
            self.$raise($scope.get('IndexError'), "index " + (old) + " too small for array; minimum " + (-self.length));
          }
        }

        if (length < 0) {
          self.$raise($scope.get('IndexError'), "negative length (" + (length) + ")")
        }

        if (index > size) {
          for (i = size; i < index; i++) {
            self[i] = nil;
          }
        }

        if (extra === undefined) {
          self[index] = value;
        }
        else {
          self.splice.apply(self, [index, length].concat(data));
        }

        return value;
      
      };
    });

    Opal.defn(self, '$assoc', function(object) {
      var self = this;

      
      for (var i = 0, length = self.length, item; i < length; i++) {
        if (item = self[i], item.length && (item[0])['$=='](object)) {
          return item;
        }
      }

      return nil;
    
    });

    Opal.defn(self, '$at', function(index) {
      var self = this;

      index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");
      
      if (index < 0) {
        index += self.length;
      }

      if (index < 0 || index >= self.length) {
        return nil;
      }

      return self[index];
    
    });

    Opal.defn(self, '$bsearch', TMP_3 = function() {
      var self = this, $iter = TMP_3.$$p, block = $iter || nil;

      TMP_3.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("bsearch")
      };
      
      var min = 0,
          max = self.length,
          mid,
          val,
          ret,
          smaller = false,
          satisfied = nil;

      while (min < max) {
        mid = min + Math.floor((max - min) / 2);
        val = self[mid];
        ret = block(val);

        if (ret === $breaker) {
          return $breaker.$v;
        }
        else if (ret === true) {
          satisfied = val;
          smaller = true;
        }
        else if (ret === false || ret === nil) {
          smaller = false;
        }
        else if (ret.$$is_number) {
          if (ret === 0) { return val; }
          smaller = (ret < 0);
        }
        else {
          self.$raise($scope.get('TypeError'), "wrong argument type " + ((ret).$class()) + " (must be numeric, true, false or nil)")
        }

        if (smaller) { max = mid; } else { min = mid + 1; }
      }

      return satisfied;
    
    });

    Opal.defn(self, '$cycle', TMP_4 = function(n) {
      var $a, $b, TMP_5, $c, self = this, $iter = TMP_4.$$p, block = $iter || nil;

      if (n == null) {
        n = nil
      }
      TMP_4.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_5 = function(){var self = TMP_5.$$s || this, $a;

        if (n['$=='](nil)) {
            return (($scope.get('Float')).$$scope.get('INFINITY'))
            } else {
            n = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
            if ((($a = $rb_gt(n, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
              return $rb_times(self.$enumerator_size(), n)
              } else {
              return 0
            };
          }}, TMP_5.$$s = self, TMP_5), $a).call($b, "cycle", n)
      };
      if ((($a = ((($c = self['$empty?']()) !== false && $c !== nil) ? $c : n['$=='](0))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return nil};
      
      var i, length, value;

      if (n === nil) {
        while (true) {
          for (i = 0, length = self.length; i < length; i++) {
            value = Opal.yield1(block, self[i]);

            if (value === $breaker) {
              return $breaker.$v;
            }
          }
        }
      }
      else {
        n = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
        if (n <= 0) {
          return self;
        }

        while (n > 0) {
          for (i = 0, length = self.length; i < length; i++) {
            value = Opal.yield1(block, self[i]);

            if (value === $breaker) {
              return $breaker.$v;
            }
          }

          n--;
        }
      }
    
      return self;
    });

    Opal.defn(self, '$clear', function() {
      var self = this;

      self.splice(0, self.length);
      return self;
    });

    Opal.defn(self, '$clone', function() {
      var self = this, copy = nil;

      copy = [];
      copy.$copy_singleton_methods(self);
      copy.$initialize_clone(self);
      return copy;
    });

    Opal.defn(self, '$dup', function() {
      var self = this, copy = nil;

      copy = [];
      copy.$initialize_dup(self);
      return copy;
    });

    Opal.defn(self, '$initialize_copy', function(other) {
      var self = this;

      return self.$replace(other);
    });

    Opal.defn(self, '$collect', TMP_6 = function() {
      var $a, $b, TMP_7, self = this, $iter = TMP_6.$$p, block = $iter || nil;

      TMP_6.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_7 = function(){var self = TMP_7.$$s || this;

        return self.$size()}, TMP_7.$$s = self, TMP_7), $a).call($b, "collect")
      };
      
      var result = [];

      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, self[i]);

        if (value === $breaker) {
          return $breaker.$v;
        }

        result.push(value);
      }

      return result;
    
    });

    Opal.defn(self, '$collect!', TMP_8 = function() {
      var $a, $b, TMP_9, self = this, $iter = TMP_8.$$p, block = $iter || nil;

      TMP_8.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_9 = function(){var self = TMP_9.$$s || this;

        return self.$size()}, TMP_9.$$s = self, TMP_9), $a).call($b, "collect!")
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, self[i]);

        if (value === $breaker) {
          return $breaker.$v;
        }

        self[i] = value;
      }
    
      return self;
    });

    
    function binomial_coefficient(n, k) {
      if (n === k || k === 0) {
        return 1;
      }

      if (k > 0 && n > k) {
        return binomial_coefficient(n - 1, k - 1) + binomial_coefficient(n - 1, k);
      }

      return 0;
    }
  

    Opal.defn(self, '$combination', TMP_10 = function(n) {
      var $a, $b, TMP_11, self = this, $iter = TMP_10.$$p, $yield = $iter || nil, num = nil;

      TMP_10.$$p = null;
      num = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
      if (($yield !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_11 = function(){var self = TMP_11.$$s || this;

        return binomial_coefficient(self.length, num);}, TMP_11.$$s = self, TMP_11), $a).call($b, "combination", num)
      };
      
      var i, length, stack, chosen, lev, done, next;

      if (num === 0) {
        ((($a = Opal.yield1($yield, [])) === $breaker) ? $breaker.$v : $a)
      } else if (num === 1) {
        for (i = 0, length = self.length; i < length; i++) {
          ((($a = Opal.yield1($yield, [self[i]])) === $breaker) ? $breaker.$v : $a)
        }
      }
      else if (num === self.length) {
        ((($a = Opal.yield1($yield, self.slice())) === $breaker) ? $breaker.$v : $a)
      }
      else if (num >= 0 && num < self.length) {
        stack = [];
        for (i = 0; i <= num + 1; i++) {
          stack.push(0);
        }

        chosen = [];
        lev = 0;
        done = false;
        stack[0] = -1;

        while (!done) {
          chosen[lev] = self[stack[lev+1]];
          while (lev < num - 1) {
            lev++;
            next = stack[lev+1] = stack[lev] + 1;
            chosen[lev] = self[next];
          }
          ((($a = Opal.yield1($yield, chosen.slice())) === $breaker) ? $breaker.$v : $a)
          lev++;
          do {
            done = (lev === 0);
            stack[lev]++;
            lev--;
          } while ( stack[lev+1] + num === self.length + lev + 1 );
        }
      }
    ;
      return self;
    });

    Opal.defn(self, '$compact', function() {
      var self = this;

      
      var result = [];

      for (var i = 0, length = self.length, item; i < length; i++) {
        if ((item = self[i]) !== nil) {
          result.push(item);
        }
      }

      return result;
    
    });

    Opal.defn(self, '$compact!', function() {
      var self = this;

      
      var original = self.length;

      for (var i = 0, length = self.length; i < length; i++) {
        if (self[i] === nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }

      return self.length === original ? nil : self;
    
    });

    Opal.defn(self, '$concat', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      
      for (var i = 0, length = other.length; i < length; i++) {
        self.push(other[i]);
      }
    
      return self;
    });

    Opal.defn(self, '$delete', TMP_12 = function(object) {
      var $a, self = this, $iter = TMP_12.$$p, $yield = $iter || nil;

      TMP_12.$$p = null;
      
      var original = self.length;

      for (var i = 0, length = original; i < length; i++) {
        if ((self[i])['$=='](object)) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }

      if (self.length === original) {
        if (($yield !== nil)) {
          return ((($a = Opal.yieldX($yield, [])) === $breaker) ? $breaker.$v : $a);
        }
        return nil;
      }
      return object;
    ;
    });

    Opal.defn(self, '$delete_at', function(index) {
      var self = this;

      
      index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");

      if (index < 0) {
        index += self.length;
      }

      if (index < 0 || index >= self.length) {
        return nil;
      }

      var result = self[index];

      self.splice(index, 1);

      return result;
    ;
    });

    Opal.defn(self, '$delete_if', TMP_13 = function() {
      var $a, $b, TMP_14, self = this, $iter = TMP_13.$$p, block = $iter || nil;

      TMP_13.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_14 = function(){var self = TMP_14.$$s || this;

        return self.$size()}, TMP_14.$$s = self, TMP_14), $a).call($b, "delete_if")
      };
      
      for (var i = 0, length = self.length, value; i < length; i++) {
        if ((value = block(self[i])) === $breaker) {
          return $breaker.$v;
        }

        if (value !== false && value !== nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }
    
      return self;
    });

    Opal.defn(self, '$drop', function(number) {
      var self = this;

      
      if (number < 0) {
        self.$raise($scope.get('ArgumentError'))
      }

      return self.slice(number);
    ;
    });

    Opal.defn(self, '$each', TMP_15 = function() {
      var $a, $b, TMP_16, self = this, $iter = TMP_15.$$p, block = $iter || nil;

      TMP_15.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_16 = function(){var self = TMP_16.$$s || this;

        return self.$size()}, TMP_16.$$s = self, TMP_16), $a).call($b, "each")
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, self[i]);

        if (value == $breaker) {
          return $breaker.$v;
        }
      }
    
      return self;
    });

    Opal.defn(self, '$each_index', TMP_17 = function() {
      var $a, $b, TMP_18, self = this, $iter = TMP_17.$$p, block = $iter || nil;

      TMP_17.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_18 = function(){var self = TMP_18.$$s || this;

        return self.$size()}, TMP_18.$$s = self, TMP_18), $a).call($b, "each_index")
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, i);

        if (value === $breaker) {
          return $breaker.$v;
        }
      }
    
      return self;
    });

    Opal.defn(self, '$empty?', function() {
      var self = this;

      return self.length === 0;
    });

    Opal.defn(self, '$eql?', function(other) {
      var self = this;

      
      var recursed = {};

      function _eql(array, other) {
        var i, length, a, b;

        if (!other.$$is_array) {
          return false;
        }

        other = other.$to_a();

        if (array.length !== other.length) {
          return false;
        }

        recursed[(array).$object_id()] = true;

        for (i = 0, length = array.length; i < length; i++) {
          a = array[i];
          b = other[i];
          if (a.$$is_array) {
            if (b.$$is_array && b.length !== a.length) {
              return false;
            }
            if (!recursed.hasOwnProperty((a).$object_id())) {
              if (!_eql(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$eql?'](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eql(self, other);
    
    });

    Opal.defn(self, '$fetch', TMP_19 = function(index, defaults) {
      var self = this, $iter = TMP_19.$$p, block = $iter || nil;

      TMP_19.$$p = null;
      
      var original = index;

      index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");

      if (index < 0) {
        index += self.length;
      }

      if (index >= 0 && index < self.length) {
        return self[index];
      }

      if (block !== nil) {
        return block(original);
      }

      if (defaults != null) {
        return defaults;
      }

      if (self.length === 0) {
        self.$raise($scope.get('IndexError'), "index " + (original) + " outside of array bounds: 0...0")
      }
      else {
        self.$raise($scope.get('IndexError'), "index " + (original) + " outside of array bounds: -" + (self.length) + "..." + (self.length));
      }
    ;
    });

    Opal.defn(self, '$fill', TMP_20 = function() {
      var $a, $b, self = this, $iter = TMP_20.$$p, block = $iter || nil, one = nil, two = nil, obj = nil, left = nil, right = nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_20.$$p = null;
      
      var i, length, value;
    
      if (block !== false && block !== nil) {
        if ((($a = args.length > 2) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (args.$length()) + " for 0..2)")};
        $b = args, $a = Opal.to_ary($b), one = ($a[0] == null ? nil : $a[0]), two = ($a[1] == null ? nil : $a[1]), $b;
        } else {
        if ((($a = args.length == 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (0 for 1..3)")
        } else if ((($a = args.length > 3) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (args.$length()) + " for 1..3)")};
        $b = args, $a = Opal.to_ary($b), obj = ($a[0] == null ? nil : $a[0]), one = ($a[1] == null ? nil : $a[1]), two = ($a[2] == null ? nil : $a[2]), $b;
      };
      if ((($a = $scope.get('Range')['$==='](one)) !== nil && (!$a.$$is_boolean || $a == true))) {
        if (two !== false && two !== nil) {
          self.$raise($scope.get('TypeError'), "length invalid with range")};
        left = $scope.get('Opal').$coerce_to(one.$begin(), $scope.get('Integer'), "to_int");
        if ((($a = left < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          left += self.length;};
        if ((($a = left < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('RangeError'), "" + (one.$inspect()) + " out of range")};
        right = $scope.get('Opal').$coerce_to(one.$end(), $scope.get('Integer'), "to_int");
        if ((($a = right < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          right += self.length;};
        if ((($a = one['$exclude_end?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
          } else {
          right += 1;
        };
        if ((($a = right <= left) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self};
      } else if (one !== false && one !== nil) {
        left = $scope.get('Opal').$coerce_to(one, $scope.get('Integer'), "to_int");
        if ((($a = left < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          left += self.length;};
        if ((($a = left < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          left = 0};
        if (two !== false && two !== nil) {
          right = $scope.get('Opal').$coerce_to(two, $scope.get('Integer'), "to_int");
          if ((($a = right == 0) !== nil && (!$a.$$is_boolean || $a == true))) {
            return self};
          right += left;
          } else {
          right = self.length
        };
        } else {
        left = 0;
        right = self.length;
      };
      if ((($a = left > self.length) !== nil && (!$a.$$is_boolean || $a == true))) {
        
        for (i = self.length; i < right; i++) {
          self[i] = nil;
        }
      ;};
      if ((($a = right > self.length) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.length = right};
      if (block !== false && block !== nil) {
        
        for (length = self.length; left < right; left++) {
          value = block(left);

          if (value === $breaker) {
            return $breaker.$v;
          }

          self[left] = value;
        }
      ;
        } else {
        
        for (length = self.length; left < right; left++) {
          self[left] = obj;
        }
      ;
      };
      return self;
    });

    Opal.defn(self, '$first', function(count) {
      var self = this;

      
      if (count == null) {
        return self.length === 0 ? nil : self[0];
      }

      count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");

      if (count < 0) {
        self.$raise($scope.get('ArgumentError'), "negative array size");
      }

      return self.slice(0, count);
    
    });

    Opal.defn(self, '$flatten', function(level) {
      var self = this;

      
      function _flatten(array, level) {
        var result = [],
            i, length,
            item, ary;

        array = (array).$to_a();

        for (i = 0, length = array.length; i < length; i++) {
          item = array[i];

          if (!$scope.get('Opal')['$respond_to?'](item, "to_ary")) {
            result.push(item);
            continue;
          }

          ary = (item).$to_ary();

          if (ary === nil) {
            result.push(item);
            continue;
          }

          if (!ary.$$is_array) {
            self.$raise($scope.get('TypeError'));
          }

          if (ary === self) {
            self.$raise($scope.get('ArgumentError'));
          }

          switch (level) {
          case undefined:
            result.push.apply(result, _flatten(ary));
            break;
          case 0:
            result.push(ary);
            break;
          default:
            result.push.apply(result, _flatten(ary, level - 1));
          }
        }
        return result;
      }

      if (level !== undefined) {
        level = $scope.get('Opal').$coerce_to(level, $scope.get('Integer'), "to_int");
      }

      return _flatten(self, level);
    
    });

    Opal.defn(self, '$flatten!', function(level) {
      var self = this;

      
      var flattened = self.$flatten(level);

      if (self.length == flattened.length) {
        for (var i = 0, length = self.length; i < length; i++) {
          if (self[i] !== flattened[i]) {
            break;
          }
        }

        if (i == length) {
          return nil;
        }
      }

      self.$replace(flattened);
    ;
      return self;
    });

    Opal.defn(self, '$hash', function() {
      var self = this;

      
      var top = (Opal.hash_ids == undefined),
          result = ['A'],
          hash_id = self.$object_id(),
          item, i, key;

      try {
        if (top) {
          Opal.hash_ids = {};
        }

        if (Opal.hash_ids.hasOwnProperty(hash_id)) {
          return 'self';
        }

        for (key in Opal.hash_ids) {
          if (Opal.hash_ids.hasOwnProperty(key)) {
            item = Opal.hash_ids[key];
            if (self['$eql?'](item)) {
              return 'self';
            }
          }
        }

        Opal.hash_ids[hash_id] = self;

        for (i = 0; i < self.length; i++) {
          item = self[i];
          result.push(item.$hash());
        }

        return result.join(',');
      } finally {
        if (top) {
          delete Opal.hash_ids;
        }
      }
    
    });

    Opal.defn(self, '$include?', function(member) {
      var self = this;

      
      for (var i = 0, length = self.length; i < length; i++) {
        if ((self[i])['$=='](member)) {
          return true;
        }
      }

      return false;
    
    });

    Opal.defn(self, '$index', TMP_21 = function(object) {
      var self = this, $iter = TMP_21.$$p, block = $iter || nil;

      TMP_21.$$p = null;
      
      var i, length, value;

      if (object != null) {
        for (i = 0, length = self.length; i < length; i++) {
          if ((self[i])['$=='](object)) {
            return i;
          }
        }
      }
      else if (block !== nil) {
        for (i = 0, length = self.length; i < length; i++) {
          if ((value = block(self[i])) === $breaker) {
            return $breaker.$v;
          }

          if (value !== false && value !== nil) {
            return i;
          }
        }
      }
      else {
        return self.$enum_for("index");
      }

      return nil;
    
    });

    Opal.defn(self, '$insert', function(index) {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 1;
      if(array_size < 0) array_size = 0;
      var objects = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        objects[$splat_index] = arguments[$splat_index + 1];
      }
      
      index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");

      if (objects.length > 0) {
        if (index < 0) {
          index += self.length + 1;

          if (index < 0) {
            self.$raise($scope.get('IndexError'), "" + (index) + " is out of bounds");
          }
        }
        if (index > self.length) {
          for (var i = self.length; i < index; i++) {
            self.push(nil);
          }
        }

        self.splice.apply(self, [index, 0].concat(objects));
      }
    ;
      return self;
    });

    Opal.defn(self, '$inspect', function() {
      var self = this;

      
      var result = [],
          id     = self.$__id__();

      for (var i = 0, length = self.length; i < length; i++) {
        var item = self['$[]'](i);

        if ((item).$__id__() === id) {
          result.push('[...]');
        }
        else {
          result.push((item).$inspect());
        }
      }

      return '[' + result.join(', ') + ']';
    ;
    });

    Opal.defn(self, '$join', function(sep) {
      var $a, self = this;
      if ($gvars[","] == null) $gvars[","] = nil;

      if (sep == null) {
        sep = nil
      }
      if ((($a = self.length === 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        return ""};
      if ((($a = sep === nil) !== nil && (!$a.$$is_boolean || $a == true))) {
        sep = $gvars[","]};
      
      var result = [];
      var i, length, item, tmp;

      for (i = 0, length = self.length; i < length; i++) {
        item = self[i];

        if ($scope.get('Opal')['$respond_to?'](item, "to_str")) {
          tmp = (item).$to_str();

          if (tmp !== nil) {
            result.push((tmp).$to_s());

            continue;
          }
        }

        if ($scope.get('Opal')['$respond_to?'](item, "to_ary")) {
          tmp = (item).$to_ary();

          if (tmp === self) {
            self.$raise($scope.get('ArgumentError'));
          }

          if (tmp !== nil) {
            result.push((tmp).$join(sep));

            continue;
          }
        }

        if ($scope.get('Opal')['$respond_to?'](item, "to_s")) {
          tmp = (item).$to_s();

          if (tmp !== nil) {
            result.push(tmp);

            continue;
          }
        }

        self.$raise($scope.get('NoMethodError').$new("" + ($scope.get('Opal').$inspect(item)) + " doesn't respond to #to_str, #to_ary or #to_s", "to_str"));
      }

      if (sep === nil) {
        return result.join('');
      }
      else {
        return result.join($scope.get('Opal')['$coerce_to!'](sep, $scope.get('String'), "to_str").$to_s());
      }
    ;
    });

    Opal.defn(self, '$keep_if', TMP_22 = function() {
      var $a, $b, TMP_23, self = this, $iter = TMP_22.$$p, block = $iter || nil;

      TMP_22.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_23 = function(){var self = TMP_23.$$s || this;

        return self.$size()}, TMP_23.$$s = self, TMP_23), $a).call($b, "keep_if")
      };
      
      for (var i = 0, length = self.length, value; i < length; i++) {
        if ((value = block(self[i])) === $breaker) {
          return $breaker.$v;
        }

        if (value === false || value === nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }
    
      return self;
    });

    Opal.defn(self, '$last', function(count) {
      var self = this;

      
      if (count == null) {
        return self.length === 0 ? nil : self[self.length - 1];
      }

      count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");

      if (count < 0) {
        self.$raise($scope.get('ArgumentError'), "negative array size");
      }

      if (count > self.length) {
        count = self.length;
      }

      return self.slice(self.length - count, self.length);
    
    });

    Opal.defn(self, '$length', function() {
      var self = this;

      return self.length;
    });

    Opal.alias(self, 'map', 'collect');

    Opal.alias(self, 'map!', 'collect!');

    Opal.defn(self, '$permutation', TMP_24 = function(num) {
      var $a, $b, TMP_25, self = this, $iter = TMP_24.$$p, block = $iter || nil, perm = nil, used = nil;

      TMP_24.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_25 = function(){var self = TMP_25.$$s || this;

        return self.$size()}, TMP_25.$$s = self, TMP_25), $a).call($b, "permutation", num)
      };
      
      var permute, offensive, output;

      if (num === undefined) {
        num = self.length;
      }
      else {
        num = $scope.get('Opal').$coerce_to(num, $scope.get('Integer'), "to_int")
      }

      if (num < 0 || self.length < num) {
        // no permutations, yield nothing
      }
      else if (num === 0) {
        // exactly one permutation: the zero-length array
        ((($a = Opal.yield1(block, [])) === $breaker) ? $breaker.$v : $a)
      }
      else if (num === 1) {
        // this is a special, easy case
        for (var i = 0; i < self.length; i++) {
          ((($a = Opal.yield1(block, [self[i]])) === $breaker) ? $breaker.$v : $a)
        }
      }
      else {
        // this is the general case
        perm = $scope.get('Array').$new(num)
        used = $scope.get('Array').$new(self.length, false)

        permute = function(num, perm, index, used, blk) {
          self = this;
          for(var i = 0; i < self.length; i++){
            if(used['$[]'](i)['$!']()) {
              perm[index] = i;
              if(index < num - 1) {
                used[i] = true;
                permute.call(self, num, perm, index + 1, used, blk);
                used[i] = false;
              }
              else {
                output = [];
                for (var j = 0; j < perm.length; j++) {
                  output.push(self[perm[j]]);
                }
                Opal.yield1(blk, output);
              }
            }
          }
        }

        if ((block !== nil)) {
          // offensive (both definitions) copy.
          offensive = self.slice();
          permute.call(offensive, num, perm, 0, used, block);
        }
        else {
          permute.call(self, num, perm, 0, used, block);
        }
      }
    ;
      return self;
    });

    Opal.defn(self, '$pop', function(count) {
      var $a, self = this;

      if ((($a = count === undefined) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = self.length === 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          return nil};
        return self.pop();};
      count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");
      if ((($a = count < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "negative array size")};
      if ((($a = self.length === 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        return []};
      if ((($a = count > self.length) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.splice(0, self.length);
        } else {
        return self.splice(self.length - count, self.length);
      };
    });

    Opal.defn(self, '$product', TMP_26 = function() {
      var $a, self = this, $iter = TMP_26.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_26.$$p = null;
      
      var result = (block !== nil) ? null : [],
          n = args.length + 1,
          counters = new Array(n),
          lengths  = new Array(n),
          arrays   = new Array(n),
          i, m, subarray, len, resultlen = 1;

      arrays[0] = self;
      for (i = 1; i < n; i++) {
        arrays[i] = $scope.get('Opal').$coerce_to(args[i - 1], $scope.get('Array'), "to_ary");
      }

      for (i = 0; i < n; i++) {
        len = arrays[i].length;
        if (len === 0) {
          return result || self;
        }
        resultlen *= len;
        if (resultlen > 2147483647) {
          self.$raise($scope.get('RangeError'), "too big to product")
        }
        lengths[i] = len;
        counters[i] = 0;
      }

      outer_loop: for (;;) {
        subarray = [];
        for (i = 0; i < n; i++) {
          subarray.push(arrays[i][counters[i]]);
        }
        if (result) {
          result.push(subarray);
        } else {
          ((($a = Opal.yield1(block, subarray)) === $breaker) ? $breaker.$v : $a)
        }
        m = n - 1;
        counters[m]++;
        while (counters[m] === lengths[m]) {
          counters[m] = 0;
          if (--m < 0) break outer_loop;
          counters[m]++;
        }
      }

      return result || self;
    ;
    });

    Opal.defn(self, '$push', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var objects = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        objects[$splat_index] = arguments[$splat_index + 0];
      }
      
      for (var i = 0, length = objects.length; i < length; i++) {
        self.push(objects[i]);
      }
    
      return self;
    });

    Opal.defn(self, '$rassoc', function(object) {
      var self = this;

      
      for (var i = 0, length = self.length, item; i < length; i++) {
        item = self[i];

        if (item.length && item[1] !== undefined) {
          if ((item[1])['$=='](object)) {
            return item;
          }
        }
      }

      return nil;
    
    });

    Opal.defn(self, '$reject', TMP_27 = function() {
      var $a, $b, TMP_28, self = this, $iter = TMP_27.$$p, block = $iter || nil;

      TMP_27.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_28 = function(){var self = TMP_28.$$s || this;

        return self.$size()}, TMP_28.$$s = self, TMP_28), $a).call($b, "reject")
      };
      
      var result = [];

      for (var i = 0, length = self.length, value; i < length; i++) {
        if ((value = block(self[i])) === $breaker) {
          return $breaker.$v;
        }

        if (value === false || value === nil) {
          result.push(self[i]);
        }
      }
      return result;
    
    });

    Opal.defn(self, '$reject!', TMP_29 = function() {
      var $a, $b, TMP_30, $c, self = this, $iter = TMP_29.$$p, block = $iter || nil, original = nil;

      TMP_29.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_30 = function(){var self = TMP_30.$$s || this;

        return self.$size()}, TMP_30.$$s = self, TMP_30), $a).call($b, "reject!")
      };
      original = self.$length();
      ($a = ($c = self).$delete_if, $a.$$p = block.$to_proc(), $a).call($c);
      if (self.$length()['$=='](original)) {
        return nil
        } else {
        return self
      };
    });

    Opal.defn(self, '$replace', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      
      self.splice(0, self.length);
      self.push.apply(self, other);
    
      return self;
    });

    Opal.defn(self, '$reverse', function() {
      var self = this;

      return self.slice(0).reverse();
    });

    Opal.defn(self, '$reverse!', function() {
      var self = this;

      return self.reverse();
    });

    Opal.defn(self, '$reverse_each', TMP_31 = function() {
      var $a, $b, TMP_32, $c, self = this, $iter = TMP_31.$$p, block = $iter || nil;

      TMP_31.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_32 = function(){var self = TMP_32.$$s || this;

        return self.$size()}, TMP_32.$$s = self, TMP_32), $a).call($b, "reverse_each")
      };
      ($a = ($c = self.$reverse()).$each, $a.$$p = block.$to_proc(), $a).call($c);
      return self;
    });

    Opal.defn(self, '$rindex', TMP_33 = function(object) {
      var self = this, $iter = TMP_33.$$p, block = $iter || nil;

      TMP_33.$$p = null;
      
      var i, value;

      if (object != null) {
        for (i = self.length - 1; i >= 0; i--) {
          if (i >= self.length) {
            break;
          }
          if ((self[i])['$=='](object)) {
            return i;
          }
        }
      }
      else if (block !== nil) {
        for (i = self.length - 1; i >= 0; i--) {
          if (i >= self.length) {
            break;
          }
          if ((value = block(self[i])) === $breaker) {
            return $breaker.$v;
          }
          if (value !== false && value !== nil) {
            return i;
          }
        }
      }
      else if (object == null) {
        return self.$enum_for("rindex");
      }

      return nil;
    
    });

    Opal.defn(self, '$rotate', function(n) {
      var self = this;

      if (n == null) {
        n = 1
      }
      n = $scope.get('Opal').$coerce_to(n, $scope.get('Integer'), "to_int");
      
      var ary, idx, firstPart, lastPart;

      if (self.length === 1) {
        return self.slice();
      }
      if (self.length === 0) {
        return [];
      }

      ary = self.slice();
      idx = n % ary.length;

      firstPart = ary.slice(idx);
      lastPart = ary.slice(0, idx);
      return firstPart.concat(lastPart);
    
    });

    Opal.defn(self, '$rotate!', function(cnt) {
      var self = this, ary = nil;

      if (cnt == null) {
        cnt = 1
      }
      
      if (self.length === 0 || self.length === 1) {
        return self;
      }
    
      cnt = $scope.get('Opal').$coerce_to(cnt, $scope.get('Integer'), "to_int");
      ary = self.$rotate(cnt);
      return self.$replace(ary);
    });

    (function($base, $super) {
      function $SampleRandom(){};
      var self = $SampleRandom = $klass($base, $super, 'SampleRandom', $SampleRandom);

      var def = self.$$proto, $scope = self.$$scope;

      def.rng = nil;
      Opal.defn(self, '$initialize', function(rng) {
        var self = this;

        return self.rng = rng;
      });

      return (Opal.defn(self, '$rand', function(size) {
        var $a, self = this, random = nil;

        random = $scope.get('Opal').$coerce_to(self.rng.$rand(size), $scope.get('Integer'), "to_int");
        if ((($a = random < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('RangeError'), "random value must be >= 0")};
        if ((($a = random < size) !== nil && (!$a.$$is_boolean || $a == true))) {
          } else {
          self.$raise($scope.get('RangeError'), "random value must be less than Array size")
        };
        return random;
      }), nil) && 'rand';
    })($scope.base, null);

    Opal.defn(self, '$sample', function(count, options) {
      var $a, $b, self = this, o = nil, rng = nil;

      if ((($a = count === undefined) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$at($scope.get('Kernel').$rand(self.length))};
      if ((($a = options === undefined) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = (o = $scope.get('Opal')['$coerce_to?'](count, $scope.get('Hash'), "to_hash"))) !== nil && (!$a.$$is_boolean || $a == true))) {
          options = o;
          count = nil;
          } else {
          options = nil;
          count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");
        }
        } else {
        count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");
        options = $scope.get('Opal').$coerce_to(options, $scope.get('Hash'), "to_hash");
      };
      if ((($a = (($b = count !== false && count !== nil) ? count < 0 : count)) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "count must be greater than 0")};
      if (options !== false && options !== nil) {
        rng = options['$[]']("random")};
      if ((($a = (($b = rng !== false && rng !== nil) ? rng['$respond_to?']("rand") : rng)) !== nil && (!$a.$$is_boolean || $a == true))) {
        rng = $scope.get('SampleRandom').$new(rng)
        } else {
        rng = $scope.get('Kernel')
      };
      if (count !== false && count !== nil) {
        } else {
        return self[rng.$rand(self.length)]
      };
      

      var abandon, spin, result, i, j, k, targetIndex, oldValue;

      if (count > self.length) {
        count = self.length;
      }

      switch (count) {
        case 0:
          return [];
          break;
        case 1:
          return [self[rng.$rand(self.length)]];
          break;
        case 2:
          i = rng.$rand(self.length);
          j = rng.$rand(self.length);
          if (i === j) {
            j = i === 0 ? i + 1 : i - 1;
          }
          return [self[i], self[j]];
          break;
        default:
          if (self.length / count > 3) {
            abandon = false;
            spin = 0;

            result = $scope.get('Array').$new(count);
            i = 1;

            result[0] = rng.$rand(self.length);
            while (i < count) {
              k = rng.$rand(self.length);
              j = 0;

              while (j < i) {
                while (k === result[j]) {
                  spin++;
                  if (spin > 100) {
                    abandon = true;
                    break;
                  }
                  k = rng.$rand(self.length);
                }
                if (abandon) { break; }

                j++;
              }

              if (abandon) { break; }

              result[i] = k;

              i++;
            }

            if (!abandon) {
              i = 0;
              while (i < count) {
                result[i] = self[result[i]];
                i++;
              }

              return result;
            }
          }

          result = self.slice();

          for (var c = 0; c < count; c++) {
            targetIndex = rng.$rand(self.length);
            oldValue = result[c];
            result[c] = result[targetIndex];
            result[targetIndex] = oldValue;
          }

          return count === self.length ? result : (result)['$[]'](0, count);
      }
    
    });

    Opal.defn(self, '$select', TMP_34 = function() {
      var $a, $b, TMP_35, self = this, $iter = TMP_34.$$p, block = $iter || nil;

      TMP_34.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_35 = function(){var self = TMP_35.$$s || this;

        return self.$size()}, TMP_35.$$s = self, TMP_35), $a).call($b, "select")
      };
      
      var result = [];

      for (var i = 0, length = self.length, item, value; i < length; i++) {
        item = self[i];

        if ((value = Opal.yield1(block, item)) === $breaker) {
          return $breaker.$v;
        }

        if (value !== false && value !== nil) {
          result.push(item);
        }
      }

      return result;
    
    });

    Opal.defn(self, '$select!', TMP_36 = function() {
      var $a, $b, TMP_37, $c, self = this, $iter = TMP_36.$$p, block = $iter || nil;

      TMP_36.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_37 = function(){var self = TMP_37.$$s || this;

        return self.$size()}, TMP_37.$$s = self, TMP_37), $a).call($b, "select!")
      };
      
      var original = self.length;
      ($a = ($c = self).$keep_if, $a.$$p = block.$to_proc(), $a).call($c);
      return self.length === original ? nil : self;
    
    });

    Opal.defn(self, '$shift', function(count) {
      var $a, self = this;

      if ((($a = count === undefined) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = self.length === 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          return nil};
        return self.shift();};
      count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");
      if ((($a = count < 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "negative array size")};
      if ((($a = self.length === 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        return []};
      return self.splice(0, count);
    });

    Opal.alias(self, 'size', 'length');

    Opal.defn(self, '$shuffle', function(rng) {
      var self = this;

      return self.$dup()['$shuffle!'](rng);
    });

    Opal.defn(self, '$shuffle!', function(rng) {
      var self = this;

      
      var randgen, i = self.length, j, tmp;

      if (rng !== undefined) {
        rng = $scope.get('Opal')['$coerce_to?'](rng, $scope.get('Hash'), "to_hash");

        if (rng !== nil) {
          rng = rng['$[]']("random");

          if (rng !== nil && rng['$respond_to?']("rand")) {
            randgen = rng;
          }
        }
      }

      while (i) {
        if (randgen) {
          j = randgen.$rand(i).$to_int();

          if (j < 0) {
            self.$raise($scope.get('RangeError'), "random number too small " + (j))
          }

          if (j >= i) {
            self.$raise($scope.get('RangeError'), "random number too big " + (j))
          }
        }
        else {
          j = Math.floor(Math.random() * i);
        }

        tmp = self[--i];
        self[i] = self[j];
        self[j] = tmp;
      }

      return self;
    ;
    });

    Opal.alias(self, 'slice', '[]');

    Opal.defn(self, '$slice!', function(index, length) {
      var self = this;

      
      if (index < 0) {
        index += self.length;
      }

      if (length != null) {
        return self.splice(index, length);
      }

      if (index < 0 || index >= self.length) {
        return nil;
      }

      return self.splice(index, 1)[0];
    
    });

    Opal.defn(self, '$sort', TMP_38 = function() {
      var $a, self = this, $iter = TMP_38.$$p, block = $iter || nil;

      TMP_38.$$p = null;
      if ((($a = self.length > 1) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        return self
      };
      
      if (block === nil) {
        block = function(a, b) {
          return (a)['$<=>'](b);
        };
      }

      try {
        return self.slice().sort(function(x, y) {
          var ret = block(x, y);

          if (ret === $breaker) {
            throw $breaker;
          }
          else if (ret === nil) {
            self.$raise($scope.get('ArgumentError'), "comparison of " + ((x).$inspect()) + " with " + ((y).$inspect()) + " failed");
          }

          return $rb_gt(ret, 0) ? 1 : ($rb_lt(ret, 0) ? -1 : 0);
        });
      }
      catch (e) {
        if (e === $breaker) {
          return $breaker.$v;
        }
        else {
          throw e;
        }
      }
    ;
    });

    Opal.defn(self, '$sort!', TMP_39 = function() {
      var $a, $b, self = this, $iter = TMP_39.$$p, block = $iter || nil;

      TMP_39.$$p = null;
      
      var result;

      if ((block !== nil)) {
        result = ($a = ($b = (self.slice())).$sort, $a.$$p = block.$to_proc(), $a).call($b);
      }
      else {
        result = (self.slice()).$sort();
      }

      self.length = 0;
      for(var i = 0, length = result.length; i < length; i++) {
        self.push(result[i]);
      }

      return self;
    ;
    });

    Opal.defn(self, '$take', function(count) {
      var self = this;

      
      if (count < 0) {
        self.$raise($scope.get('ArgumentError'));
      }

      return self.slice(0, count);
    ;
    });

    Opal.defn(self, '$take_while', TMP_40 = function() {
      var self = this, $iter = TMP_40.$$p, block = $iter || nil;

      TMP_40.$$p = null;
      
      var result = [];

      for (var i = 0, length = self.length, item, value; i < length; i++) {
        item = self[i];

        if ((value = block(item)) === $breaker) {
          return $breaker.$v;
        }

        if (value === false || value === nil) {
          return result;
        }

        result.push(item);
      }

      return result;
    
    });

    Opal.defn(self, '$to_a', function() {
      var self = this;

      return self;
    });

    Opal.alias(self, 'to_ary', 'to_a');

    Opal.defn(self, '$to_h', function() {
      var self = this;

      
      var i, len = self.length, ary, key, val, hash = $hash2([], {});

      for (i = 0; i < len; i++) {
        ary = $scope.get('Opal')['$coerce_to?'](self[i], $scope.get('Array'), "to_ary");
        if (!ary.$$is_array) {
          self.$raise($scope.get('TypeError'), "wrong element type " + ((ary).$class()) + " at " + (i) + " (expected array)")
        }
        if (ary.length !== 2) {
          self.$raise($scope.get('ArgumentError'), "wrong array length at " + (i) + " (expected 2, was " + ((ary).$length()) + ")")
        }
        key = ary[0];
        val = ary[1];
        Opal.hash_put(hash, key, val);
      }

      return hash;
    ;
    });

    Opal.alias(self, 'to_s', 'inspect');

    Opal.defn(self, '$transpose', function() {
      var $a, $b, TMP_41, self = this, result = nil, max = nil;

      if ((($a = self['$empty?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return []};
      result = [];
      max = nil;
      ($a = ($b = self).$each, $a.$$p = (TMP_41 = function(row){var self = TMP_41.$$s || this, $a, $b, TMP_42;
if (row == null) row = nil;
      if ((($a = $scope.get('Array')['$==='](row)) !== nil && (!$a.$$is_boolean || $a == true))) {
          row = row.$to_a()
          } else {
          row = $scope.get('Opal').$coerce_to(row, $scope.get('Array'), "to_ary").$to_a()
        };
        ((($a = max) !== false && $a !== nil) ? $a : max = row.length);
        if ((($a = (row.length)['$!='](max)) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('IndexError'), "element size differs (" + (row.length) + " should be " + (max))};
        return ($a = ($b = (row.length)).$times, $a.$$p = (TMP_42 = function(i){var self = TMP_42.$$s || this, $a, $b, $c, entry = nil;
if (i == null) i = nil;
        entry = (($a = i, $b = result, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, []))));
          return entry['$<<'](row.$at(i));}, TMP_42.$$s = self, TMP_42), $a).call($b);}, TMP_41.$$s = self, TMP_41), $a).call($b);
      return result;
    });

    Opal.defn(self, '$uniq', TMP_43 = function() {
      var self = this, $iter = TMP_43.$$p, block = $iter || nil;

      TMP_43.$$p = null;
      
      var hash = $hash2([], {}), i, length, item, key;

      if (block === nil) {
        for (i = 0, length = self.length; i < length; i++) {
          item = self[i];
          if (Opal.hash_get(hash, item) === undefined) {
            Opal.hash_put(hash, item, item);
          }
        }
      }
      else {
        for (i = 0, length = self.length; i < length; i++) {
          item = self[i];
          key = Opal.yield1(block, item);
          if (Opal.hash_get(hash, key) === undefined) {
            Opal.hash_put(hash, key, item);
          }
        }
      }

      return hash.$values();
    ;
    });

    Opal.defn(self, '$uniq!', TMP_44 = function() {
      var self = this, $iter = TMP_44.$$p, block = $iter || nil;

      TMP_44.$$p = null;
      
      var original_length = self.length, hash = $hash2([], {}), i, length, item, key;

      for (i = 0, length = original_length; i < length; i++) {
        item = self[i];
        key = (block === nil ? item : Opal.yield1(block, item));

        if (Opal.hash_get(hash, key) === undefined) {
          Opal.hash_put(hash, key, item);
          continue;
        }

        self.splice(i, 1);
        length--;
        i--;
      }

      return self.length === original_length ? nil : self;
    ;
    });

    Opal.defn(self, '$unshift', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var objects = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        objects[$splat_index] = arguments[$splat_index + 0];
      }
      
      for (var i = objects.length - 1; i >= 0; i--) {
        self.unshift(objects[i]);
      }
    
      return self;
    });

    Opal.defn(self, '$values_at', function() {
      var $a, $b, TMP_45, self = this, out = nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      out = [];
      ($a = ($b = args).$each, $a.$$p = (TMP_45 = function(elem){var self = TMP_45.$$s || this, $a, $b, TMP_46, finish = nil, start = nil, i = nil;
if (elem == null) elem = nil;
      if ((($a = elem['$kind_of?']($scope.get('Range'))) !== nil && (!$a.$$is_boolean || $a == true))) {
          finish = $scope.get('Opal').$coerce_to(elem.$last(), $scope.get('Integer'), "to_int");
          start = $scope.get('Opal').$coerce_to(elem.$first(), $scope.get('Integer'), "to_int");
          
          if (start < 0) {
            start = start + self.length;
            return nil;;
          }
        
          
          if (finish < 0) {
            finish = finish + self.length;
          }
          if (elem['$exclude_end?']()) {
            finish--;
          }
          if (finish < start) {
            return nil;;
          }
        
          return ($a = ($b = start).$upto, $a.$$p = (TMP_46 = function(i){var self = TMP_46.$$s || this;
if (i == null) i = nil;
          return out['$<<'](self.$at(i))}, TMP_46.$$s = self, TMP_46), $a).call($b, finish);
          } else {
          i = $scope.get('Opal').$coerce_to(elem, $scope.get('Integer'), "to_int");
          return out['$<<'](self.$at(i));
        }}, TMP_45.$$s = self, TMP_45), $a).call($b);
      return out;
    });

    return (Opal.defn(self, '$zip', TMP_47 = function() {
      var $a, self = this, $iter = TMP_47.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var others = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        others[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_47.$$p = null;
      
      var result = [], size = self.length, part, o, i, j, jj;

      for (j = 0, jj = others.length; j < jj; j++) {
        o = others[j];
        if (o.$$is_array) {
          continue;
        }
        if (o.$$is_enumerator) {
          if (o.$size() === Infinity) {
            others[j] = o.$take(size);
          } else {
            others[j] = o.$to_a();
          }
          continue;
        }
        others[j] = (((($a = $scope.get('Opal')['$coerce_to?'](o, $scope.get('Array'), "to_ary")) !== false && $a !== nil) ? $a : $scope.get('Opal')['$coerce_to!'](o, $scope.get('Enumerator'), "each"))).$to_a();
      }

      for (i = 0; i < size; i++) {
        part = [self[i]];

        for (j = 0, jj = others.length; j < jj; j++) {
          o = others[j][i];

          if (o == null) {
            o = nil;
          }

          part[j + 1] = o;
        }

        result[i] = part;
      }

      if (block !== nil) {
        for (i = 0; i < size; i++) {
          block(result[i]);
        }

        return nil;
      }

      return result;
    
    }), nil) && 'zip';
  })($scope.base, Array);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/hash"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$include', '$coerce_to?', '$[]', '$merge!', '$allocate', '$raise', '$==', '$coerce_to!', '$lambda?', '$abs', '$arity', '$call', '$enum_for', '$size', '$inspect', '$flatten', '$eql?', '$default', '$to_proc', '$dup', '$===', '$default_proc', '$default_proc=', '$default=', '$alias_method']);
  self.$require("corelib/enumerable");
  return (function($base, $super) {
    function $Hash(){};
    var self = $Hash = $klass($base, $super, 'Hash', $Hash);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_5, TMP_7, TMP_9, TMP_11, TMP_12, TMP_14, TMP_15, TMP_16, TMP_18, TMP_20, TMP_22;

    def.proc = def.none = nil;
    self.$include($scope.get('Enumerable'));

    def.$$is_hash = true;

    Opal.defs(self, '$[]', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var argv = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        argv[$splat_index] = arguments[$splat_index + 0];
      }
      
      var hash, argc = argv.length, i;

      if (argc === 1) {
        hash = $scope.get('Opal')['$coerce_to?'](argv['$[]'](0), $scope.get('Hash'), "to_hash");
        if (hash !== nil) {
          return self.$allocate()['$merge!'](hash);
        }

        argv = $scope.get('Opal')['$coerce_to?'](argv['$[]'](0), $scope.get('Array'), "to_ary");
        if (argv === nil) {
          self.$raise($scope.get('ArgumentError'), "odd number of arguments for Hash")
        }

        argc = argv.length;
        hash = self.$allocate();

        for (i = 0; i < argc; i++) {
          if (!argv[i].$$is_array) continue;
          switch(argv[i].length) {
          case 1:
            hash.$store(argv[i][0], nil);
            break;
          case 2:
            hash.$store(argv[i][0], argv[i][1]);
            break;
          default:
            self.$raise($scope.get('ArgumentError'), "invalid number of elements (" + (argv[i].length) + " for 1..2)")
          }
        }

        return hash;
      }

      if (argc % 2 !== 0) {
        self.$raise($scope.get('ArgumentError'), "odd number of arguments for Hash")
      }

      hash = self.$allocate();

      for (i = 0; i < argc; i += 2) {
        hash.$store(argv[i], argv[i + 1]);
      }

      return hash;
    ;
    });

    Opal.defs(self, '$allocate', function() {
      var self = this;

      
      var hash = new self.$$alloc();

      Opal.hash_init(hash);

      hash.none = nil;
      hash.proc = nil;

      return hash;
    
    });

    Opal.defs(self, '$try_convert', function(obj) {
      var self = this;

      return $scope.get('Opal')['$coerce_to?'](obj, $scope.get('Hash'), "to_hash");
    });

    Opal.defn(self, '$initialize', TMP_1 = function(defaults) {
      var self = this, $iter = TMP_1.$$p, block = $iter || nil;

      TMP_1.$$p = null;
      
      if (defaults !== undefined && block !== nil) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (1 for 0)")
      }
      self.none = (defaults === undefined ? nil : defaults);
      self.proc = block;
    ;
      return self;
    });

    Opal.defn(self, '$==', function(other) {
      var self = this;

      
      if (self === other) {
        return true;
      }

      if (!other.$$is_hash) {
        return false;
      }

      if (self.$$keys.length !== other.$$keys.length) {
        return false;
      }

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, other_value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
          other_value = other.$$smap[key];
        } else {
          value = key.value;
          other_value = Opal.hash_get(other, key.key);
        }

        if (other_value === undefined || !value['$eql?'](other_value)) {
          return false;
        }
      }

      return true;
    
    });

    Opal.defn(self, '$[]', function(key) {
      var self = this;

      
      var value = Opal.hash_get(self, key);

      if (value !== undefined) {
        return value;
      }

      return self.$default(key);
    
    });

    Opal.defn(self, '$[]=', function(key, value) {
      var self = this;

      
      Opal.hash_put(self, key, value);
      return value;
    
    });

    Opal.defn(self, '$assoc', function(object) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          if ((key)['$=='](object)) {
            return [key, self.$$smap[key]];
          }
        } else {
          if ((key.key)['$=='](object)) {
            return [key.key, key.value];
          }
        }
      }

      return nil;
    
    });

    Opal.defn(self, '$clear', function() {
      var self = this;

      
      Opal.hash_init(self);
      return self;
    
    });

    Opal.defn(self, '$clone', function() {
      var self = this;

      
      var hash = new self.$$class.$$alloc();

      Opal.hash_init(hash);
      Opal.hash_clone(self, hash);

      return hash;
    
    });

    Opal.defn(self, '$default', function(key) {
      var self = this;

      
      if (key !== undefined && self.proc !== nil) {
        return self.proc.$call(self, key);
      }
      return self.none;
    ;
    });

    Opal.defn(self, '$default=', function(object) {
      var self = this;

      
      self.proc = nil;
      self.none = object;

      return object;
    
    });

    Opal.defn(self, '$default_proc', function() {
      var self = this;

      return self.proc;
    });

    Opal.defn(self, '$default_proc=', function(proc) {
      var self = this;

      
      if (proc !== nil) {
        proc = $scope.get('Opal')['$coerce_to!'](proc, $scope.get('Proc'), "to_proc");

        if (proc['$lambda?']() && proc.$arity().$abs() !== 2) {
          self.$raise($scope.get('TypeError'), "default_proc takes two arguments");
        }
      }

      self.none = nil;
      self.proc = proc;

      return proc;
    ;
    });

    Opal.defn(self, '$delete', TMP_2 = function(key) {
      var self = this, $iter = TMP_2.$$p, block = $iter || nil;

      TMP_2.$$p = null;
      
      var value = Opal.hash_delete(self, key);

      if (value !== undefined) {
        return value;
      }

      if (block !== nil) {
        return block.$call(key);
      }

      return nil;
    
    });

    Opal.defn(self, '$delete_if', TMP_3 = function() {
      var $a, $b, TMP_4, self = this, $iter = TMP_3.$$p, block = $iter || nil;

      TMP_3.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_4 = function(){var self = TMP_4.$$s || this;

        return self.$size()}, TMP_4.$$s = self, TMP_4), $a).call($b, "delete_if")
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === $breaker) {
          return $breaker.$v;
        }

        if (obj !== false && obj !== nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            length--;
            i--;
          }
        }
      }

      return self;
    
    });

    Opal.alias(self, 'dup', 'clone');

    Opal.defn(self, '$each', TMP_5 = function() {
      var $a, $b, TMP_6, self = this, $iter = TMP_5.$$p, block = $iter || nil;

      TMP_5.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_6 = function(){var self = TMP_6.$$s || this;

        return self.$size()}, TMP_6.$$s = self, TMP_6), $a).call($b, "each")
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = Opal.yield1(block, [key, value]);

        if (obj === $breaker) {
          return $breaker.$v;
        }
      }

      return self;
    
    });

    Opal.defn(self, '$each_key', TMP_7 = function() {
      var $a, $b, TMP_8, self = this, $iter = TMP_7.$$p, block = $iter || nil;

      TMP_7.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_8 = function(){var self = TMP_8.$$s || this;

        return self.$size()}, TMP_8.$$s = self, TMP_8), $a).call($b, "each_key")
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (block(key.$$is_string ? key : key.key) === $breaker) {
          return $breaker.$v;
        }
      }

      return self;
    
    });

    Opal.alias(self, 'each_pair', 'each');

    Opal.defn(self, '$each_value', TMP_9 = function() {
      var $a, $b, TMP_10, self = this, $iter = TMP_9.$$p, block = $iter || nil;

      TMP_9.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_10 = function(){var self = TMP_10.$$s || this;

        return self.$size()}, TMP_10.$$s = self, TMP_10), $a).call($b, "each_value")
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (block(key.$$is_string ? self.$$smap[key] : key.value) === $breaker) {
          return $breaker.$v;
        }
      }

      return self;
    
    });

    Opal.defn(self, '$empty?', function() {
      var self = this;

      return self.$$keys.length === 0;
    });

    Opal.alias(self, 'eql?', '==');

    Opal.defn(self, '$fetch', TMP_11 = function(key, defaults) {
      var self = this, $iter = TMP_11.$$p, block = $iter || nil;

      TMP_11.$$p = null;
      
      var value = Opal.hash_get(self, key);

      if (value !== undefined) {
        return value;
      }

      if (block !== nil) {
        value = block(key);

        if (value === $breaker) {
          return $breaker.$v;
        }

        return value;
      }

      if (defaults !== undefined) {
        return defaults;
      }
    
      return self.$raise($scope.get('KeyError'), "key not found: " + (key.$inspect()));
    });

    Opal.defn(self, '$flatten', function(level) {
      var self = this;

      if (level == null) {
        level = 1
      }
      level = $scope.get('Opal')['$coerce_to!'](level, $scope.get('Integer'), "to_int");
      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        result.push(key);

        if (value.$$is_array) {
          if (level === 1) {
            result.push(value);
            continue;
          }

          result = result.concat((value).$flatten(level - 2));
          continue;
        }

        result.push(value);
      }

      return result;
    
    });

    Opal.defn(self, '$has_key?', function(key) {
      var self = this;

      return Opal.hash_get(self, key) !== undefined;
    });

    Opal.defn(self, '$has_value?', function(value) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (((key.$$is_string ? self.$$smap[key] : key.value))['$=='](value)) {
          return true;
        }
      }

      return false;
    
    });

    Opal.defn(self, '$hash', function() {
      var self = this;

      
      var top = (Opal.hash_ids === undefined),
          hash_id = self.$object_id(),
          result = ['Hash'],
          key, item;

      try {
        if (top) {
          Opal.hash_ids = {};
        }

        if (Opal.hash_ids.hasOwnProperty(hash_id)) {
          return 'self';
        }

        for (key in Opal.hash_ids) {
          if (Opal.hash_ids.hasOwnProperty(key)) {
            item = Opal.hash_ids[key];
            if (self['$eql?'](item)) {
              return 'self';
            }
          }
        }

        Opal.hash_ids[hash_id] = self;

        for (var i = 0, keys = self.$$keys, length = keys.length; i < length; i++) {
          key = keys[i];

          if (key.$$is_string) {
            result.push([key, self.$$smap[key].$hash()]);
          } else {
            result.push([key.key_hash, key.value.$hash()]);
          }
        }

        return result.sort().join();

      } finally {
        if (top) {
          delete Opal.hash_ids;
        }
      }
    
    });

    Opal.alias(self, 'include?', 'has_key?');

    Opal.defn(self, '$index', function(object) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        if ((value)['$=='](object)) {
          return key;
        }
      }

      return nil;
    
    });

    Opal.defn(self, '$indexes', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      
      var result = [];

      for (var i = 0, length = args.length, key, value; i < length; i++) {
        key = args[i];
        value = Opal.hash_get(self, key);

        if (value === undefined) {
          result.push(self.$default());
          continue;
        }

        result.push(value);
      }

      return result;
    
    });

    Opal.alias(self, 'indices', 'indexes');

    var inspect_ids;

    Opal.defn(self, '$inspect', function() {
      var self = this;

      
      var top = (inspect_ids === undefined),
          hash_id = self.$object_id(),
          result = [];

      try {
        if (top) {
          inspect_ids = {};
        }

        if (inspect_ids.hasOwnProperty(hash_id)) {
          return '{...}';
        }

        inspect_ids[hash_id] = true;

        for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
          key = keys[i];

          if (key.$$is_string) {
            value = self.$$smap[key];
          } else {
            value = key.value;
            key = key.key;
          }

          result.push(key.$inspect() + '=>' + value.$inspect());
        }

        return '{' + result.join(', ') + '}';

      } finally {
        if (top) {
          inspect_ids = undefined;
        }
      }
    
    });

    Opal.defn(self, '$invert', function() {
      var self = this;

      
      var hash = Opal.hash();

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        Opal.hash_put(hash, value, key);
      }

      return hash;
    
    });

    Opal.defn(self, '$keep_if', TMP_12 = function() {
      var $a, $b, TMP_13, self = this, $iter = TMP_12.$$p, block = $iter || nil;

      TMP_12.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_13 = function(){var self = TMP_13.$$s || this;

        return self.$size()}, TMP_13.$$s = self, TMP_13), $a).call($b, "keep_if")
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === $breaker) {
          return $breaker.$v;
        }

        if (obj === false || obj === nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            length--;
            i--;
          }
        }
      }

      return self;
    
    });

    Opal.alias(self, 'key', 'index');

    Opal.alias(self, 'key?', 'has_key?');

    Opal.defn(self, '$keys', function() {
      var self = this;

      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          result.push(key);
        } else {
          result.push(key.key);
        }
      }

      return result;
    
    });

    Opal.defn(self, '$length', function() {
      var self = this;

      return self.$$keys.length;
    });

    Opal.alias(self, 'member?', 'has_key?');

    Opal.defn(self, '$merge', TMP_14 = function(other) {
      var $a, $b, self = this, $iter = TMP_14.$$p, block = $iter || nil;

      TMP_14.$$p = null;
      return ($a = ($b = self.$dup())['$merge!'], $a.$$p = block.$to_proc(), $a).call($b, other);
    });

    Opal.defn(self, '$merge!', TMP_15 = function(other) {
      var self = this, $iter = TMP_15.$$p, block = $iter || nil;

      TMP_15.$$p = null;
      
      if (!$scope.get('Hash')['$==='](other)) {
        other = $scope.get('Opal')['$coerce_to!'](other, $scope.get('Hash'), "to_hash");
      }

      var i, other_keys = other.$$keys, length = other_keys.length, key, value, other_value;

      if (block === nil) {
        for (i = 0; i < length; i++) {
          key = other_keys[i];

          if (key.$$is_string) {
            other_value = other.$$smap[key];
          } else {
            other_value = key.value;
            key = key.key;
          }

          Opal.hash_put(self, key, other_value);
        }

        return self;
      }

      for (i = 0; i < length; i++) {
        key = other_keys[i];

        if (key.$$is_string) {
          other_value = other.$$smap[key];
        } else {
          other_value = key.value;
          key = key.key;
        }

        value = Opal.hash_get(self, key);

        if (value === undefined) {
          Opal.hash_put(self, key, other_value);
          continue;
        }

        Opal.hash_put(self, key, block(key, value, other_value));
      }

      return self;
    ;
    });

    Opal.defn(self, '$rassoc', function(object) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        if ((value)['$=='](object)) {
          return [key, value];
        }
      }

      return nil;
    
    });

    Opal.defn(self, '$rehash', function() {
      var self = this;

      
      Opal.hash_rehash(self);
      return self;
    
    });

    Opal.defn(self, '$reject', TMP_16 = function() {
      var $a, $b, TMP_17, self = this, $iter = TMP_16.$$p, block = $iter || nil;

      TMP_16.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_17 = function(){var self = TMP_17.$$s || this;

        return self.$size()}, TMP_17.$$s = self, TMP_17), $a).call($b, "reject")
      };
      
      var hash = Opal.hash();

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === $breaker) {
          return $breaker.$v;
        }

        if (obj === false || obj === nil) {
          Opal.hash_put(hash, key, value);
        }
      }

      return hash;
    
    });

    Opal.defn(self, '$reject!', TMP_18 = function() {
      var $a, $b, TMP_19, self = this, $iter = TMP_18.$$p, block = $iter || nil;

      TMP_18.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_19 = function(){var self = TMP_19.$$s || this;

        return self.$size()}, TMP_19.$$s = self, TMP_19), $a).call($b, "reject!")
      };
      
      var changes_were_made = false;

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === $breaker) {
          return $breaker.$v;
        }

        if (obj !== false && obj !== nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            changes_were_made = true;
            length--;
            i--;
          }
        }
      }

      return changes_were_made ? self : nil;
    
    });

    Opal.defn(self, '$replace', function(other) {
      var $a, $b, self = this;

      other = $scope.get('Opal')['$coerce_to!'](other, $scope.get('Hash'), "to_hash");
      
      Opal.hash_init(self);

      for (var i = 0, other_keys = other.$$keys, length = other_keys.length, key, value, other_value; i < length; i++) {
        key = other_keys[i];

        if (key.$$is_string) {
          other_value = other.$$smap[key];
        } else {
          other_value = key.value;
          key = key.key;
        }

        Opal.hash_put(self, key, other_value);
      }
    
      if ((($a = other.$default_proc()) !== nil && (!$a.$$is_boolean || $a == true))) {
        (($a = [other.$default_proc()]), $b = self, $b['$default_proc='].apply($b, $a), $a[$a.length-1])
        } else {
        (($a = [other.$default()]), $b = self, $b['$default='].apply($b, $a), $a[$a.length-1])
      };
      return self;
    });

    Opal.defn(self, '$select', TMP_20 = function() {
      var $a, $b, TMP_21, self = this, $iter = TMP_20.$$p, block = $iter || nil;

      TMP_20.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_21 = function(){var self = TMP_21.$$s || this;

        return self.$size()}, TMP_21.$$s = self, TMP_21), $a).call($b, "select")
      };
      
      var hash = Opal.hash();

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === $breaker) {
          return $breaker.$v;
        }

        if (obj !== false && obj !== nil) {
          Opal.hash_put(hash, key, value);
        }
      }

      return hash;
    
    });

    Opal.defn(self, '$select!', TMP_22 = function() {
      var $a, $b, TMP_23, self = this, $iter = TMP_22.$$p, block = $iter || nil;

      TMP_22.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_23 = function(){var self = TMP_23.$$s || this;

        return self.$size()}, TMP_23.$$s = self, TMP_23), $a).call($b, "select!")
      };
      
      var result = nil;

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === $breaker) {
          return $breaker.$v;
        }

        if (obj === false || obj === nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            length--;
            i--;
          }
          result = self;
        }
      }

      return result;
    
    });

    Opal.defn(self, '$shift', function() {
      var self = this;

      
      var keys = self.$$keys,
          key;

      if (keys.length > 0) {
        key = keys[0];

        key = key.$$is_string ? key : key.key;

        return [key, Opal.hash_delete(self, key)];
      }

      return self.$default(nil);
    
    });

    Opal.alias(self, 'size', 'length');

    self.$alias_method("store", "[]=");

    Opal.defn(self, '$to_a', function() {
      var self = this;

      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        result.push([key, value]);
      }

      return result;
    
    });

    Opal.defn(self, '$to_h', function() {
      var self = this;

      
      if (self.$$class === Opal.Hash) {
        return self;
      }

      var hash = new Opal.Hash.$$alloc();

      Opal.hash_init(hash);
      Opal.hash_clone(self, hash);

      return hash;
    
    });

    Opal.defn(self, '$to_hash', function() {
      var self = this;

      return self;
    });

    Opal.alias(self, 'to_s', 'inspect');

    Opal.alias(self, 'update', 'merge!');

    Opal.alias(self, 'value?', 'has_value?');

    Opal.alias(self, 'values_at', 'indexes');

    return (Opal.defn(self, '$values', function() {
      var self = this;

      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          result.push(self.$$smap[key]);
        } else {
          result.push(key.value);
        }
      }

      return result;
    
    }), nil) && 'values';
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/number"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$bridge', '$raise', '$class', '$Float', '$respond_to?', '$coerce_to!', '$__coerced__', '$===', '$!', '$>', '$**', '$new', '$<', '$to_f', '$==', '$nan?', '$infinite?', '$enum_for', '$+', '$-', '$gcd', '$lcm', '$/', '$frexp', '$to_i', '$ldexp', '$rationalize', '$*', '$<<', '$to_r', '$-@', '$size', '$<=', '$>=']);
  self.$require("corelib/numeric");
  (function($base, $super) {
    function $Number(){};
    var self = $Number = $klass($base, $super, 'Number', $Number);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11;

    $scope.get('Opal').$bridge(self, Number);

    Number.prototype.$$is_number = true;

    Opal.defn(self, '$coerce', function(other) {
      var self = this;

      
      if (other === nil) {
        self.$raise($scope.get('TypeError'), "can't convert " + (other.$class()) + " into Float");
      }
      else if (other.$$is_string) {
        return [self.$Float(other), self];
      }
      else if (other['$respond_to?']("to_f")) {
        return [$scope.get('Opal')['$coerce_to!'](other, $scope.get('Float'), "to_f"), self];
      }
      else if (other.$$is_number) {
        return [other, self];
      }
      else {
        self.$raise($scope.get('TypeError'), "can't convert " + (other.$class()) + " into Float");
      }
    ;
    });

    Opal.defn(self, '$__id__', function() {
      var self = this;

      return (self * 2) + 1;
    });

    Opal.alias(self, 'object_id', '__id__');

    Opal.defn(self, '$+', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self + other;
      }
      else {
        return self.$__coerced__("+", other);
      }
    
    });

    Opal.defn(self, '$-', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self - other;
      }
      else {
        return self.$__coerced__("-", other);
      }
    
    });

    Opal.defn(self, '$*', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self * other;
      }
      else {
        return self.$__coerced__("*", other);
      }
    
    });

    Opal.defn(self, '$/', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self / other;
      }
      else {
        return self.$__coerced__("/", other);
      }
    
    });

    Opal.alias(self, 'fdiv', '/');

    Opal.defn(self, '$%', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        if (other == -Infinity) {
          return other;
        }
        else if (other == 0) {
          self.$raise($scope.get('ZeroDivisionError'), "divided by 0");
        }
        else if (other < 0 || self < 0) {
          return (self % other + other) % other;
        }
        else {
          return self % other;
        }
      }
      else {
        return self.$__coerced__("%", other);
      }
    
    });

    Opal.defn(self, '$&', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self & other;
      }
      else {
        return self.$__coerced__("&", other);
      }
    
    });

    Opal.defn(self, '$|', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self | other;
      }
      else {
        return self.$__coerced__("|", other);
      }
    
    });

    Opal.defn(self, '$^', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self ^ other;
      }
      else {
        return self.$__coerced__("^", other);
      }
    
    });

    Opal.defn(self, '$<', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self < other;
      }
      else {
        return self.$__coerced__("<", other);
      }
    
    });

    Opal.defn(self, '$<=', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self <= other;
      }
      else {
        return self.$__coerced__("<=", other);
      }
    
    });

    Opal.defn(self, '$>', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self > other;
      }
      else {
        return self.$__coerced__(">", other);
      }
    
    });

    Opal.defn(self, '$>=', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self >= other;
      }
      else {
        return self.$__coerced__(">=", other);
      }
    
    });

    Opal.defn(self, '$<=>', function(other) {
      var self = this;

      try {
      
      if (other.$$is_number) {
        if (isNaN(self) || isNaN(other)) {
          return nil;
        }

        return self > other ? 1 : (self < other ? -1 : 0);
      }
      else {
        return self.$__coerced__("<=>", other);
      }
    
      } catch ($err) {if (Opal.rescue($err, [$scope.get('ArgumentError')])) {
        try {
          return nil
        } finally {
          Opal.gvars["!"] = Opal.exceptions.pop() || Opal.nil;
        }
        }else { throw $err; }
      };
    });

    Opal.defn(self, '$<<', function(count) {
      var self = this;

      count = $scope.get('Opal')['$coerce_to!'](count, $scope.get('Integer'), "to_int");
      return count > 0 ? self << count : self >> -count;
    });

    Opal.defn(self, '$>>', function(count) {
      var self = this;

      count = $scope.get('Opal')['$coerce_to!'](count, $scope.get('Integer'), "to_int");
      return count > 0 ? self >> count : self << -count;
    });

    Opal.defn(self, '$[]', function(bit) {
      var self = this;

      bit = $scope.get('Opal')['$coerce_to!'](bit, $scope.get('Integer'), "to_int");
      
      if (bit < (($scope.get('Integer')).$$scope.get('MIN')) || bit > (($scope.get('Integer')).$$scope.get('MAX'))) {
        return 0;
      }

      if (self < 0) {
        return (((~self) + 1) >> bit) % 2;
      }
      else {
        return (self >> bit) % 2;
      }
    ;
    });

    Opal.defn(self, '$+@', function() {
      var self = this;

      return +self;
    });

    Opal.defn(self, '$-@', function() {
      var self = this;

      return -self;
    });

    Opal.defn(self, '$~', function() {
      var self = this;

      return ~self;
    });

    Opal.defn(self, '$**', function(other) {
      var $a, $b, $c, self = this;

      if ((($a = $scope.get('Integer')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ((($b = ($scope.get('Integer')['$==='](self))['$!']()) !== false && $b !== nil) ? $b : $rb_gt(other, 0))) !== nil && (!$a.$$is_boolean || $a == true))) {
          return Math.pow(self, other);
          } else {
          return $scope.get('Rational').$new(self, 1)['$**'](other)
        }
      } else if ((($a = (($b = $rb_lt(self, 0)) ? (((($c = $scope.get('Float')['$==='](other)) !== false && $c !== nil) ? $c : $scope.get('Rational')['$==='](other))) : $rb_lt(self, 0))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Complex').$new(self, 0)['$**'](other.$to_f())
      } else if ((($a = other.$$is_number != null) !== nil && (!$a.$$is_boolean || $a == true))) {
        return Math.pow(self, other);
        } else {
        return self.$__coerced__("**", other)
      };
    });

    Opal.defn(self, '$==', function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self == Number(other);
      }
      else if (other['$respond_to?']("==")) {
        return other['$=='](self);
      }
      else {
        return false;
      }
    ;
    });

    Opal.defn(self, '$abs', function() {
      var self = this;

      return Math.abs(self);
    });

    Opal.defn(self, '$abs2', function() {
      var self = this;

      return Math.abs(self * self);
    });

    Opal.defn(self, '$angle', function() {
      var $a, self = this;

      if ((($a = self['$nan?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      if (self == 0) {
        if (1 / self > 0) {
          return 0;
        }
        else {
          return Math.PI;
        }
      }
      else if (self < 0) {
        return Math.PI;
      }
      else {
        return 0;
      }
    
    });

    Opal.alias(self, 'arg', 'angle');

    Opal.alias(self, 'phase', 'angle');

    Opal.defn(self, '$bit_length', function() {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](self)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('NoMethodError').$new("undefined method `bit_length` for " + (self) + ":Float", "bit_length"))
      };
      
      if (self === 0 || self === -1) {
        return 0;
      }

      var result = 0,
          value  = self < 0 ? ~self : self;

      while (value != 0) {
        result   += 1;
        value  >>>= 1;
      }

      return result;
    
    });

    Opal.defn(self, '$ceil', function() {
      var self = this;

      return Math.ceil(self);
    });

    Opal.defn(self, '$chr', function(encoding) {
      var self = this;

      return String.fromCharCode(self);
    });

    Opal.defn(self, '$denominator', TMP_1 = function() {
      var $a, $b, self = this, $iter = TMP_1.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil;

      TMP_1.$$p = null;
      $zuper = [];
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil) ? $b : self['$infinite?']())) !== nil && (!$a.$$is_boolean || $a == true))) {
        return 1
        } else {
        return Opal.find_super_dispatcher(self, 'denominator', TMP_1, $iter).apply(self, $zuper)
      };
    });

    Opal.defn(self, '$downto', TMP_2 = function(stop) {
      var $a, $b, TMP_3, self = this, $iter = TMP_2.$$p, block = $iter || nil;

      TMP_2.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_3 = function(){var self = TMP_3.$$s || this, $a;

        if ((($a = $scope.get('Numeric')['$==='](stop)) !== nil && (!$a.$$is_boolean || $a == true))) {
            } else {
            self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
          };
          if ((($a = $rb_gt(stop, self)) !== nil && (!$a.$$is_boolean || $a == true))) {
            return 0
            } else {
            return $rb_plus($rb_minus(self, stop), 1)
          };}, TMP_3.$$s = self, TMP_3), $a).call($b, "downto", stop)
      };
      
      if (!stop.$$is_number) {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
      }
      for (var i = self; i >= stop; i--) {
        if (block(i) === $breaker) {
          return $breaker.$v;
        }
      }
    ;
      return self;
    });

    Opal.alias(self, 'eql?', '==');

    Opal.defn(self, '$equal?', function(other) {
      var $a, self = this;

      return ((($a = self['$=='](other)) !== false && $a !== nil) ? $a : isNaN(self) && isNaN(other));
    });

    Opal.defn(self, '$even?', function() {
      var self = this;

      return self % 2 === 0;
    });

    Opal.defn(self, '$floor', function() {
      var self = this;

      return Math.floor(self);
    });

    Opal.defn(self, '$gcd', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "not an integer")
      };
      
      var min = Math.abs(self),
          max = Math.abs(other);

      while (min > 0) {
        var tmp = min;

        min = max % min;
        max = tmp;
      }

      return max;
    
    });

    Opal.defn(self, '$gcdlcm', function(other) {
      var self = this;

      return [self.$gcd(), self.$lcm()];
    });

    Opal.defn(self, '$integer?', function() {
      var self = this;

      return self % 1 === 0;
    });

    Opal.defn(self, '$is_a?', TMP_4 = function(klass) {
      var $a, $b, self = this, $iter = TMP_4.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil;

      TMP_4.$$p = null;
      $zuper = [];
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = (($b = klass['$==']($scope.get('Fixnum'))) ? $scope.get('Integer')['$==='](self) : klass['$==']($scope.get('Fixnum')))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$==']($scope.get('Integer'))) ? $scope.get('Integer')['$==='](self) : klass['$==']($scope.get('Integer')))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$==']($scope.get('Float'))) ? $scope.get('Float')['$==='](self) : klass['$==']($scope.get('Float')))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return true};
      return Opal.find_super_dispatcher(self, 'is_a?', TMP_4, $iter).apply(self, $zuper);
    });

    Opal.alias(self, 'kind_of?', 'is_a?');

    Opal.defn(self, '$instance_of?', TMP_5 = function(klass) {
      var $a, $b, self = this, $iter = TMP_5.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil;

      TMP_5.$$p = null;
      $zuper = [];
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = (($b = klass['$==']($scope.get('Fixnum'))) ? $scope.get('Integer')['$==='](self) : klass['$==']($scope.get('Fixnum')))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$==']($scope.get('Integer'))) ? $scope.get('Integer')['$==='](self) : klass['$==']($scope.get('Integer')))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$==']($scope.get('Float'))) ? $scope.get('Float')['$==='](self) : klass['$==']($scope.get('Float')))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return true};
      return Opal.find_super_dispatcher(self, 'instance_of?', TMP_5, $iter).apply(self, $zuper);
    });

    Opal.defn(self, '$lcm', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "not an integer")
      };
      
      if (self == 0 || other == 0) {
        return 0;
      }
      else {
        return Math.abs(self * other / self.$gcd(other));
      }
    
    });

    Opal.alias(self, 'magnitude', 'abs');

    Opal.alias(self, 'modulo', '%');

    Opal.defn(self, '$next', function() {
      var self = this;

      return self + 1;
    });

    Opal.defn(self, '$nonzero?', function() {
      var self = this;

      return self == 0 ? nil : self;
    });

    Opal.defn(self, '$numerator', TMP_6 = function() {
      var $a, $b, self = this, $iter = TMP_6.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil;

      TMP_6.$$p = null;
      $zuper = [];
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil) ? $b : self['$infinite?']())) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self
        } else {
        return Opal.find_super_dispatcher(self, 'numerator', TMP_6, $iter).apply(self, $zuper)
      };
    });

    Opal.defn(self, '$odd?', function() {
      var self = this;

      return self % 2 !== 0;
    });

    Opal.defn(self, '$ord', function() {
      var self = this;

      return self;
    });

    Opal.defn(self, '$pred', function() {
      var self = this;

      return self - 1;
    });

    Opal.defn(self, '$quo', TMP_7 = function(other) {
      var $a, self = this, $iter = TMP_7.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil;

      TMP_7.$$p = null;
      $zuper = [];
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = $scope.get('Integer')['$==='](self)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return Opal.find_super_dispatcher(self, 'quo', TMP_7, $iter).apply(self, $zuper)
        } else {
        return $rb_divide(self, other)
      };
    });

    Opal.defn(self, '$rationalize', function(eps) {
      var $a, $b, self = this, f = nil, n = nil;

      
      if (arguments.length > 1) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 0..1)");
      }
    ;
      if ((($a = $scope.get('Integer')['$==='](self)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Rational').$new(self, 1)
      } else if ((($a = self['$infinite?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('FloatDomainError'), "Infinity")
      } else if ((($a = self['$nan?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('FloatDomainError'), "NaN")
      } else if ((($a = eps == null) !== nil && (!$a.$$is_boolean || $a == true))) {
        $b = $scope.get('Math').$frexp(self), $a = Opal.to_ary($b), f = ($a[0] == null ? nil : $a[0]), n = ($a[1] == null ? nil : $a[1]), $b;
        f = $scope.get('Math').$ldexp(f, (($scope.get('Float')).$$scope.get('MANT_DIG'))).$to_i();
        n = $rb_minus(n, (($scope.get('Float')).$$scope.get('MANT_DIG')));
        return $scope.get('Rational').$new($rb_times(2, f), (1)['$<<'](($rb_minus(1, n)))).$rationalize($scope.get('Rational').$new(1, (1)['$<<'](($rb_minus(1, n)))));
        } else {
        return self.$to_r().$rationalize(eps)
      };
    });

    Opal.defn(self, '$round', function(ndigits) {
      var $a, $b, self = this, _ = nil, exp = nil;

      if ((($a = $scope.get('Integer')['$==='](self)) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ndigits == null) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self};
        if ((($a = ($b = $scope.get('Float')['$==='](ndigits), $b !== false && $b !== nil ?ndigits['$infinite?']() : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('RangeError'), "Infinity")};
        ndigits = $scope.get('Opal')['$coerce_to!'](ndigits, $scope.get('Integer'), "to_int");
        if ((($a = $rb_lt(ndigits, (($scope.get('Integer')).$$scope.get('MIN')))) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('RangeError'), "out of bounds")};
        if ((($a = ndigits >= 0) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self};
        ndigits = ndigits['$-@']();
        
        if (0.415241 * ndigits - 0.125 > self.$size()) {
          return 0;
        }

        var f = Math.pow(10, ndigits),
            x = Math.floor((Math.abs(x) + f / 2) / f) * f;

        return self < 0 ? -x : x;
      ;
        } else {
        if ((($a = ($b = self['$nan?'](), $b !== false && $b !== nil ?ndigits == null : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('FloatDomainError'), "NaN")};
        ndigits = $scope.get('Opal')['$coerce_to!'](ndigits || 0, $scope.get('Integer'), "to_int");
        if ((($a = $rb_le(ndigits, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
          if ((($a = self['$nan?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
            self.$raise($scope.get('RangeError'), "NaN")
          } else if ((($a = self['$infinite?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
            self.$raise($scope.get('FloatDomainError'), "Infinity")}
        } else if (ndigits['$=='](0)) {
          return Math.round(self)
        } else if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil) ? $b : self['$infinite?']())) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self};
        $b = $scope.get('Math').$frexp(self), $a = Opal.to_ary($b), _ = ($a[0] == null ? nil : $a[0]), exp = ($a[1] == null ? nil : $a[1]), $b;
        if ((($a = $rb_ge(ndigits, $rb_minus(($rb_plus((($scope.get('Float')).$$scope.get('DIG')), 2)), ((function() {if ((($b = $rb_gt(exp, 0)) !== nil && (!$b.$$is_boolean || $b == true))) {
          return $rb_divide(exp, 4)
          } else {
          return $rb_minus($rb_divide(exp, 3), 1)
        }; return nil; })())))) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self};
        if ((($a = $rb_lt(ndigits, ((function() {if ((($b = $rb_gt(exp, 0)) !== nil && (!$b.$$is_boolean || $b == true))) {
          return $rb_plus($rb_divide(exp, 3), 1)
          } else {
          return $rb_divide(exp, 4)
        }; return nil; })())['$-@']())) !== nil && (!$a.$$is_boolean || $a == true))) {
          return 0};
        return Math.round(self * Math.pow(10, ndigits)) / Math.pow(10, ndigits);
      };
    });

    Opal.defn(self, '$step', TMP_8 = function(limit, step) {
      var $a, self = this, $iter = TMP_8.$$p, block = $iter || nil;

      if (step == null) {
        step = 1
      }
      TMP_8.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return self.$enum_for("step", limit, step)
      };
      if ((($a = step == 0) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "step cannot be 0")};
      
      var value = self;

      if (limit === Infinity || limit === -Infinity) {
        block(value);
        return self;
      }

      if (step > 0) {
        while (value <= limit) {
          block(value);
          value += step;
        }
      }
      else {
        while (value >= limit) {
          block(value);
          value += step;
        }
      }
    
      return self;
    });

    Opal.alias(self, 'succ', 'next');

    Opal.defn(self, '$times', TMP_9 = function() {
      var self = this, $iter = TMP_9.$$p, block = $iter || nil;

      TMP_9.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return self.$enum_for("times")
      };
      
      for (var i = 0; i < self; i++) {
        if (block(i) === $breaker) {
          return $breaker.$v;
        }
      }
    
      return self;
    });

    Opal.defn(self, '$to_f', function() {
      var self = this;

      return self;
    });

    Opal.defn(self, '$to_i', function() {
      var self = this;

      return parseInt(self, 10);
    });

    Opal.alias(self, 'to_int', 'to_i');

    Opal.defn(self, '$to_r', function() {
      var $a, $b, self = this, f = nil, e = nil;

      if ((($a = $scope.get('Integer')['$==='](self)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Rational').$new(self, 1)
        } else {
        $b = $scope.get('Math').$frexp(self), $a = Opal.to_ary($b), f = ($a[0] == null ? nil : $a[0]), e = ($a[1] == null ? nil : $a[1]), $b;
        f = $scope.get('Math').$ldexp(f, (($scope.get('Float')).$$scope.get('MANT_DIG'))).$to_i();
        e = $rb_minus(e, (($scope.get('Float')).$$scope.get('MANT_DIG')));
        return ($rb_times(f, ((($scope.get('Float')).$$scope.get('RADIX'))['$**'](e)))).$to_r();
      };
    });

    Opal.defn(self, '$to_s', function(base) {
      var $a, $b, self = this;

      if (base == null) {
        base = 10
      }
      if ((($a = ((($b = $rb_lt(base, 2)) !== false && $b !== nil) ? $b : $rb_gt(base, 36))) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "base must be between 2 and 36")};
      return self.toString(base);
    });

    Opal.alias(self, 'truncate', 'to_i');

    Opal.alias(self, 'inspect', 'to_s');

    Opal.defn(self, '$divmod', TMP_10 = function(other) {
      var $a, $b, self = this, $iter = TMP_10.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil;

      TMP_10.$$p = null;
      $zuper = [];
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil) ? $b : other['$nan?']())) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('FloatDomainError'), "NaN")
      } else if ((($a = self['$infinite?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('FloatDomainError'), "Infinity")
        } else {
        return Opal.find_super_dispatcher(self, 'divmod', TMP_10, $iter).apply(self, $zuper)
      };
    });

    Opal.defn(self, '$upto', TMP_11 = function(stop) {
      var $a, $b, TMP_12, self = this, $iter = TMP_11.$$p, block = $iter || nil;

      TMP_11.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_12 = function(){var self = TMP_12.$$s || this, $a;

        if ((($a = $scope.get('Numeric')['$==='](stop)) !== nil && (!$a.$$is_boolean || $a == true))) {
            } else {
            self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
          };
          if ((($a = $rb_lt(stop, self)) !== nil && (!$a.$$is_boolean || $a == true))) {
            return 0
            } else {
            return $rb_plus($rb_minus(stop, self), 1)
          };}, TMP_12.$$s = self, TMP_12), $a).call($b, "upto", stop)
      };
      
      if (!stop.$$is_number) {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
      }
      for (var i = self; i <= stop; i++) {
        if (block(i) === $breaker) {
          return $breaker.$v;
        }
      }
    ;
      return self;
    });

    Opal.defn(self, '$zero?', function() {
      var self = this;

      return self == 0;
    });

    Opal.defn(self, '$size', function() {
      var self = this;

      return 4;
    });

    Opal.defn(self, '$nan?', function() {
      var self = this;

      return isNaN(self);
    });

    Opal.defn(self, '$finite?', function() {
      var self = this;

      return self != Infinity && self != -Infinity && !isNaN(self);
    });

    Opal.defn(self, '$infinite?', function() {
      var self = this;

      
      if (self == Infinity) {
        return +1;
      }
      else if (self == -Infinity) {
        return -1;
      }
      else {
        return nil;
      }
    
    });

    Opal.defn(self, '$positive?', function() {
      var self = this;

      return self == Infinity || 1 / self > 0;
    });

    return (Opal.defn(self, '$negative?', function() {
      var self = this;

      return self == -Infinity || 1 / self < 0;
    }), nil) && 'negative?';
  })($scope.base, $scope.get('Numeric'));
  Opal.cdecl($scope, 'Fixnum', $scope.get('Number'));
  (function($base, $super) {
    function $Integer(){};
    var self = $Integer = $klass($base, $super, 'Integer', $Integer);

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defs(self, '$===', function(other) {
      var self = this;

      
      if (!other.$$is_number) {
        return false;
      }

      return (other % 1) === 0;
    
    });

    Opal.cdecl($scope, 'MAX', Math.pow(2, 30) - 1);

    return Opal.cdecl($scope, 'MIN', -Math.pow(2, 30));
  })($scope.base, $scope.get('Numeric'));
  return (function($base, $super) {
    function $Float(){};
    var self = $Float = $klass($base, $super, 'Float', $Float);

    var def = self.$$proto, $scope = self.$$scope, $a;

    Opal.defs(self, '$===', function(other) {
      var self = this;

      return !!other.$$is_number;
    });

    Opal.cdecl($scope, 'INFINITY', Infinity);

    Opal.cdecl($scope, 'MAX', Number.MAX_VALUE);

    Opal.cdecl($scope, 'MIN', Number.MIN_VALUE);

    Opal.cdecl($scope, 'NAN', NaN);

    Opal.cdecl($scope, 'DIG', 15);

    Opal.cdecl($scope, 'MANT_DIG', 53);

    Opal.cdecl($scope, 'RADIX', 2);

    if ((($a = (typeof(Number.EPSILON) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      return Opal.cdecl($scope, 'EPSILON', Number.EPSILON)
      } else {
      return Opal.cdecl($scope, 'EPSILON', 2.2204460492503130808472633361816E-16)
    };
  })($scope.base, $scope.get('Numeric'));
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/range"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$include', '$attr_reader', '$<=>', '$raise', '$include?', '$<=', '$<', '$enum_for', '$upto', '$to_proc', '$succ', '$!', '$==', '$===', '$exclude_end?', '$eql?', '$begin', '$end', '$-', '$abs', '$to_i', '$inspect']);
  self.$require("corelib/enumerable");
  return (function($base, $super) {
    function $Range(){};
    var self = $Range = $klass($base, $super, 'Range', $Range);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3;

    def.begin = def.exclude = def.end = nil;
    self.$include($scope.get('Enumerable'));

    def.$$is_range = true;

    self.$attr_reader("begin", "end");

    Opal.defn(self, '$initialize', function(first, last, exclude) {
      var $a, self = this;

      if (exclude == null) {
        exclude = false
      }
      if ((($a = first['$<=>'](last)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'))
      };
      self.begin = first;
      self.end = last;
      return self.exclude = exclude;
    });

    Opal.defn(self, '$==', function(other) {
      var self = this;

      
      if (!other.$$is_range) {
        return false;
      }

      return self.exclude === other.exclude &&
             self.begin   ==  other.begin &&
             self.end     ==  other.end;
    
    });

    Opal.defn(self, '$===', function(value) {
      var self = this;

      return self['$include?'](value);
    });

    Opal.defn(self, '$cover?', function(value) {
      var $a, $b, self = this;

      return ($a = $rb_le(self.begin, value), $a !== false && $a !== nil ?((function() {if ((($b = self.exclude) !== nil && (!$b.$$is_boolean || $b == true))) {
        return $rb_lt(value, self.end)
        } else {
        return $rb_le(value, self.end)
      }; return nil; })()) : $a);
    });

    Opal.defn(self, '$each', TMP_1 = function() {
      var $a, $b, $c, self = this, $iter = TMP_1.$$p, block = $iter || nil, current = nil, last = nil;

      TMP_1.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("each")
      };
      
      var i, limit, value;

      if (self.begin.$$is_number && self.end.$$is_number) {
        if (self.begin % 1 !== 0 || self.end % 1 !== 0) {
          self.$raise($scope.get('TypeError'), "can't iterate from Float")
        }

        for (i = self.begin, limit = self.end + (function() {if ((($a = self.exclude) !== nil && (!$a.$$is_boolean || $a == true))) {
        return 0
        } else {
        return 1
      }; return nil; })(); i < limit; i++) {
          value = block(i);
          if (value === $breaker) { return $breaker.$v; }
        }

        return self;
      }

      if (self.begin.$$is_string && self.end.$$is_string) {
        value = ($a = ($b = self.begin).$upto, $a.$$p = block.$to_proc(), $a).call($b, self.end, self.exclude);

        // The following is a bit hackish: we know that
        // String#upto normally returns self, but may
        // return a different value if there's a `break`
        // statement in the supplied block. We need to
        // propagate this `break` value here, so we
        // test for equality with `@begin` string to
        // determine the return value:
        return value === self.begin ? self : value;
      }
    ;
      current = self.begin;
      last = self.end;
      while ((($c = $rb_lt(current, last)) !== nil && (!$c.$$is_boolean || $c == true))) {
      if (Opal.yield1(block, current) === $breaker) return $breaker.$v;
      current = current.$succ();};
      if ((($a = ($c = self.exclude['$!'](), $c !== false && $c !== nil ?current['$=='](last) : $c)) !== nil && (!$a.$$is_boolean || $a == true))) {
        if (Opal.yield1(block, current) === $breaker) return $breaker.$v};
      return self;
    });

    Opal.defn(self, '$eql?', function(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Range')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      return ($a = ($b = self.exclude['$==='](other['$exclude_end?']()), $b !== false && $b !== nil ?self.begin['$eql?'](other.$begin()) : $b), $a !== false && $a !== nil ?self.end['$eql?'](other.$end()) : $a);
    });

    Opal.defn(self, '$exclude_end?', function() {
      var self = this;

      return self.exclude;
    });

    Opal.alias(self, 'first', 'begin');

    Opal.alias(self, 'include?', 'cover?');

    Opal.alias(self, 'last', 'end');

    Opal.defn(self, '$max', TMP_2 = function() {
      var self = this, $iter = TMP_2.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil;

      TMP_2.$$p = null;
      $zuper = [];
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if (($yield !== nil)) {
        return Opal.find_super_dispatcher(self, 'max', TMP_2, $iter).apply(self, $zuper)
        } else {
        return self.exclude ? self.end - 1 : self.end;
      };
    });

    Opal.alias(self, 'member?', 'cover?');

    Opal.defn(self, '$min', TMP_3 = function() {
      var self = this, $iter = TMP_3.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil;

      TMP_3.$$p = null;
      $zuper = [];
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if (($yield !== nil)) {
        return Opal.find_super_dispatcher(self, 'min', TMP_3, $iter).apply(self, $zuper)
        } else {
        return self.begin
      };
    });

    Opal.alias(self, 'member?', 'include?');

    Opal.defn(self, '$size', function() {
      var $a, $b, self = this, _begin = nil, _end = nil, infinity = nil;

      _begin = self.begin;
      _end = self.end;
      if ((($a = self.exclude) !== nil && (!$a.$$is_boolean || $a == true))) {
        _end = $rb_minus(_end, 1)};
      if ((($a = ($b = $scope.get('Numeric')['$==='](_begin), $b !== false && $b !== nil ?$scope.get('Numeric')['$==='](_end) : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      if ((($a = $rb_lt(_end, _begin)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return 0};
      infinity = (($scope.get('Float')).$$scope.get('INFINITY'));
      if ((($a = ((($b = infinity['$=='](_begin.$abs())) !== false && $b !== nil) ? $b : _end.$abs()['$=='](infinity))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return infinity};
      return ((Math.abs(_end - _begin) + 1)).$to_i();
    });

    Opal.defn(self, '$step', function(n) {
      var self = this;

      if (n == null) {
        n = 1
      }
      return self.$raise($scope.get('NotImplementedError'));
    });

    Opal.defn(self, '$to_s', function() {
      var self = this;

      return self.begin.$inspect() + (self.exclude ? '...' : '..') + self.end.$inspect();
    });

    return Opal.alias(self, 'inspect', 'to_s');
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/proc"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$coerce_to!']);
  return (function($base, $super) {
    function $Proc(){};
    var self = $Proc = $klass($base, $super, 'Proc', $Proc);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2;

    def.$$is_proc = true;

    def.$$is_lambda = false;

    Opal.defs(self, '$new', TMP_1 = function() {
      var self = this, $iter = TMP_1.$$p, block = $iter || nil;

      TMP_1.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        self.$raise($scope.get('ArgumentError'), "tried to create a Proc object without a block")
      };
      return block;
    });

    Opal.defn(self, '$call', TMP_2 = function() {
      var self = this, $iter = TMP_2.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_2.$$p = null;
      
      if (block !== nil) {
        self.$$p = block;
      }

      var result;

      if (self.$$is_lambda) {
        result = self.apply(null, args);
      }
      else {
        result = Opal.yieldX(self, args);
      }

      if (result === $breaker) {
        return $breaker.$v;
      }

      return result;
    
    });

    Opal.alias(self, '[]', 'call');

    Opal.alias(self, '===', 'call');

    Opal.alias(self, 'yield', 'call');

    Opal.defn(self, '$to_proc', function() {
      var self = this;

      return self;
    });

    Opal.defn(self, '$lambda?', function() {
      var self = this;

      return !!self.$$is_lambda;
    });

    Opal.defn(self, '$arity', function() {
      var self = this;

      if (self.$$is_curried) { return -1; }
      if (self.$$arity) { return self.$$arity };
      return self.length;
    });

    Opal.defn(self, '$source_location', function() {
      var self = this;

      if (self.$$is_curried) { return nil; }
      return nil;
    });

    Opal.defn(self, '$binding', function() {
      var self = this;

      if (self.$$is_curried) { self.$raise($scope.get('ArgumentError'), "Can't create Binding") };
      return nil;
    });

    Opal.defn(self, '$parameters', function() {
      var self = this;

      if (self.$$is_curried) { return [["rest"]]; };
      return nil;
    });

    Opal.defn(self, '$curry', function(arity) {
      var self = this;

      
      if (arity === undefined) {
        arity = self.length;
      }
      else {
        arity = $scope.get('Opal')['$coerce_to!'](arity, $scope.get('Integer'), "to_int");
        if (self.$$is_lambda && arity !== self.length) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arity) + " for " + (self.length) + ")")
        }
      }

      function curried () {
        var args = $slice.call(arguments),
            length = args.length,
            result;

        if (length > arity && self.$$is_lambda && !self.$$is_curried) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (length) + " for " + (arity) + ")")
        }

        if (length >= arity) {
          return self.$call.apply(self, args);
        }

        result = function () {
          return curried.apply(null,
            args.concat($slice.call(arguments)));
        }
        result.$$is_lambda = self.$$is_lambda;
        result.$$is_curried = true;

        return result;
      };

      curried.$$is_lambda = self.$$is_lambda;
      curried.$$is_curried = true;
      return curried;
    
    });

    Opal.defn(self, '$dup', function() {
      var self = this;

      
      var original_proc = self.$$original_proc || self,
          proc = function () {
            return original_proc.apply(this, arguments);
          };

      for (var prop in self) {
        if (self.hasOwnProperty(prop)) {
          proc[prop] = self[prop];
        }
      }

      return proc;
    
    });

    return Opal.alias(self, 'clone', 'dup');
  })($scope.base, Function)
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/method"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$attr_reader', '$class', '$arity', '$new', '$name']);
  (function($base, $super) {
    function $Method(){};
    var self = $Method = $klass($base, $super, 'Method', $Method);

    var def = self.$$proto, $scope = self.$$scope, TMP_1;

    def.method = def.receiver = def.owner = def.name = nil;
    self.$attr_reader("owner", "receiver", "name");

    Opal.defn(self, '$initialize', function(receiver, method, name) {
      var self = this;

      self.receiver = receiver;
      self.owner = receiver.$class();
      self.name = name;
      return self.method = method;
    });

    Opal.defn(self, '$arity', function() {
      var self = this;

      return self.method.$arity();
    });

    Opal.defn(self, '$call', TMP_1 = function() {
      var self = this, $iter = TMP_1.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_1.$$p = null;
      
      self.method.$$p = block;

      return self.method.apply(self.receiver, args);
    ;
    });

    Opal.alias(self, '[]', 'call');

    Opal.defn(self, '$unbind', function() {
      var self = this;

      return $scope.get('UnboundMethod').$new(self.owner, self.method, self.name);
    });

    Opal.defn(self, '$to_proc', function() {
      var self = this;

      
      var proc = function () { return self.$call.apply(self, $slice.call(arguments)); };
      proc.$$unbound = self.method;
      proc.$$is_lambda = true;
      return proc;
    
    });

    return (Opal.defn(self, '$inspect', function() {
      var self = this;

      return "#<Method: " + (self.receiver.$class()) + "#" + (self.name) + ">";
    }), nil) && 'inspect';
  })($scope.base, null);
  return (function($base, $super) {
    function $UnboundMethod(){};
    var self = $UnboundMethod = $klass($base, $super, 'UnboundMethod', $UnboundMethod);

    var def = self.$$proto, $scope = self.$$scope;

    def.method = def.name = def.owner = nil;
    self.$attr_reader("owner", "name");

    Opal.defn(self, '$initialize', function(owner, method, name) {
      var self = this;

      self.owner = owner;
      self.method = method;
      return self.name = name;
    });

    Opal.defn(self, '$arity', function() {
      var self = this;

      return self.method.$arity();
    });

    Opal.defn(self, '$bind', function(object) {
      var self = this;

      return $scope.get('Method').$new(object, self.method, self.name);
    });

    return (Opal.defn(self, '$inspect', function() {
      var self = this;

      return "#<UnboundMethod: " + (self.owner.$name()) + "#" + (self.name) + ">";
    }), nil) && 'inspect';
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/variables"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $gvars = Opal.gvars, $hash2 = Opal.hash2;

  Opal.add_stubs(['$new']);
  $gvars["&"] = $gvars["~"] = $gvars["`"] = $gvars["'"] = nil;
  $gvars.LOADED_FEATURES = $gvars["\""] = Opal.loaded_features;
  $gvars.LOAD_PATH = $gvars[":"] = [];
  $gvars["/"] = "\n";
  $gvars[","] = nil;
  Opal.cdecl($scope, 'ARGV', []);
  Opal.cdecl($scope, 'ARGF', $scope.get('Object').$new());
  Opal.cdecl($scope, 'ENV', $hash2([], {}));
  $gvars.VERBOSE = false;
  $gvars.DEBUG = false;
  return $gvars.SAFE = 0;
};

/* Generated by Opal 0.9.2 */
Opal.modules["opal/mini"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require']);
  self.$require("opal/base");
  self.$require("corelib/nil");
  self.$require("corelib/boolean");
  self.$require("corelib/string");
  self.$require("corelib/comparable");
  self.$require("corelib/enumerable");
  self.$require("corelib/enumerator");
  self.$require("corelib/array");
  self.$require("corelib/hash");
  self.$require("corelib/number");
  self.$require("corelib/range");
  self.$require("corelib/proc");
  self.$require("corelib/method");
  self.$require("corelib/regexp");
  return self.$require("corelib/variables");
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/array/inheritance"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$new', '$allocate', '$initialize', '$to_proc', '$__send__', '$clone', '$respond_to?', '$==', '$eql?', '$inspect', '$hash', '$*', '$class', '$slice', '$uniq', '$flatten', '$-', '$+']);
  (function($base, $super) {
    function $Array(){};
    var self = $Array = $klass($base, $super, 'Array', $Array);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defs(self, '$inherited', function(klass) {
      var self = this, replace = nil;

      replace = $scope.get('Class').$new((($scope.get('Array')).$$scope.get('Wrapper')));
      
      klass.$$proto         = replace.$$proto;
      klass.$$proto.$$class = klass;
      klass.$$alloc         = replace.$$alloc;
      klass.$$parent        = (($scope.get('Array')).$$scope.get('Wrapper'));

      klass.$allocate = replace.$allocate;
      klass.$new      = replace.$new;
      klass["$[]"]    = replace["$[]"];
    
    }), nil) && 'inherited'
  })($scope.base, null);
  return (function($base, $super) {
    function $Wrapper(){};
    var self = $Wrapper = $klass($base, $super, 'Wrapper', $Wrapper);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5;

    def.literal = nil;
    def.$$is_array = true;

    Opal.defs(self, '$allocate', TMP_1 = function(array) {
      var self = this, $iter = TMP_1.$$p, $yield = $iter || nil, obj = nil;

      if (array == null) {
        array = []
      }
      TMP_1.$$p = null;
      obj = Opal.find_super_dispatcher(self, 'allocate', TMP_1, null, $Wrapper).apply(self, []);
      obj.literal = array;
      return obj;
    });

    Opal.defs(self, '$new', TMP_2 = function() {
      var $a, $b, self = this, $iter = TMP_2.$$p, block = $iter || nil, obj = nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_2.$$p = null;
      obj = self.$allocate();
      ($a = ($b = obj).$initialize, $a.$$p = block.$to_proc(), $a).apply($b, Opal.to_a(args));
      return obj;
    });

    Opal.defs(self, '$[]', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var objects = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        objects[$splat_index] = arguments[$splat_index + 0];
      }
      return self.$allocate(objects);
    });

    Opal.defn(self, '$initialize', TMP_3 = function() {
      var $a, $b, self = this, $iter = TMP_3.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_3.$$p = null;
      return self.literal = ($a = ($b = $scope.get('Array')).$new, $a.$$p = block.$to_proc(), $a).apply($b, Opal.to_a(args));
    });

    Opal.defn(self, '$method_missing', TMP_4 = function() {
      var $a, $b, self = this, $iter = TMP_4.$$p, block = $iter || nil, result = nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_4.$$p = null;
      result = ($a = ($b = self.literal).$__send__, $a.$$p = block.$to_proc(), $a).apply($b, Opal.to_a(args));
      if ((($a = result === self.literal) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self
        } else {
        return result
      };
    });

    Opal.defn(self, '$initialize_copy', function(other) {
      var self = this;

      return self.literal = (other.literal).$clone();
    });

    Opal.defn(self, '$respond_to?', TMP_5 = function(name) {
      var $a, self = this, $iter = TMP_5.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil;

      TMP_5.$$p = null;
      $zuper = [];
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      return ((($a = Opal.find_super_dispatcher(self, 'respond_to?', TMP_5, $iter).apply(self, $zuper)) !== false && $a !== nil) ? $a : self.literal['$respond_to?'](name));
    });

    Opal.defn(self, '$==', function(other) {
      var self = this;

      return self.literal['$=='](other);
    });

    Opal.defn(self, '$eql?', function(other) {
      var self = this;

      return self.literal['$eql?'](other);
    });

    Opal.defn(self, '$to_a', function() {
      var self = this;

      return self.literal;
    });

    Opal.defn(self, '$to_ary', function() {
      var self = this;

      return self;
    });

    Opal.defn(self, '$inspect', function() {
      var self = this;

      return self.literal.$inspect();
    });

    Opal.defn(self, '$hash', function() {
      var self = this;

      return self.literal.$hash();
    });

    Opal.defn(self, '$*', function(other) {
      var self = this;

      
      var result = $rb_times(self.literal, other);

      if (result.$$is_array) {
        return self.$class().$allocate(result)
      }
      else {
        return result;
      }
    ;
    });

    Opal.defn(self, '$[]', function(index, length) {
      var self = this;

      
      var result = self.literal.$slice(index, length);

      if (result.$$is_array && (index.$$is_range || length !== undefined)) {
        return self.$class().$allocate(result)
      }
      else {
        return result;
      }
    ;
    });

    Opal.alias(self, 'slice', '[]');

    Opal.defn(self, '$uniq', function() {
      var self = this;

      return self.$class().$allocate(self.literal.$uniq());
    });

    Opal.defn(self, '$flatten', function(level) {
      var self = this;

      return self.$class().$allocate(self.literal.$flatten(level));
    });

    Opal.defn(self, '$-', function(other) {
      var self = this;

      return $rb_minus(self.literal, other);
    });

    return (Opal.defn(self, '$+', function(other) {
      var self = this;

      return $rb_plus(self.literal, other);
    }), nil) && '+';
  })($scope.get('Array'), null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/string/inheritance"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$new', '$allocate', '$initialize', '$to_proc', '$__send__', '$class', '$clone', '$respond_to?', '$==', '$inspect', '$+', '$*', '$map', '$split', '$enum_for', '$each_line', '$to_a', '$%']);
  self.$require("corelib/string");
  (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defs(self, '$inherited', function(klass) {
      var self = this, replace = nil;

      replace = $scope.get('Class').$new((($scope.get('String')).$$scope.get('Wrapper')));
      
      klass.$$proto         = replace.$$proto;
      klass.$$proto.$$class = klass;
      klass.$$alloc         = replace.$$alloc;
      klass.$$parent        = (($scope.get('String')).$$scope.get('Wrapper'));

      klass.$allocate = replace.$allocate;
      klass.$new      = replace.$new;
    
    }), nil) && 'inherited'
  })($scope.base, null);
  return (function($base, $super) {
    function $Wrapper(){};
    var self = $Wrapper = $klass($base, $super, 'Wrapper', $Wrapper);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_6, TMP_8;

    def.literal = nil;
    def.$$is_string = true;

    Opal.defs(self, '$allocate', TMP_1 = function(string) {
      var self = this, $iter = TMP_1.$$p, $yield = $iter || nil, obj = nil;

      if (string == null) {
        string = ""
      }
      TMP_1.$$p = null;
      obj = Opal.find_super_dispatcher(self, 'allocate', TMP_1, null, $Wrapper).apply(self, []);
      obj.literal = string;
      return obj;
    });

    Opal.defs(self, '$new', TMP_2 = function() {
      var $a, $b, self = this, $iter = TMP_2.$$p, block = $iter || nil, obj = nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_2.$$p = null;
      obj = self.$allocate();
      ($a = ($b = obj).$initialize, $a.$$p = block.$to_proc(), $a).apply($b, Opal.to_a(args));
      return obj;
    });

    Opal.defs(self, '$[]', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var objects = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        objects[$splat_index] = arguments[$splat_index + 0];
      }
      return self.$allocate(objects);
    });

    Opal.defn(self, '$initialize', function(string) {
      var self = this;

      if (string == null) {
        string = ""
      }
      return self.literal = string;
    });

    Opal.defn(self, '$method_missing', TMP_3 = function() {
      var $a, $b, self = this, $iter = TMP_3.$$p, block = $iter || nil, result = nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_3.$$p = null;
      result = ($a = ($b = self.literal).$__send__, $a.$$p = block.$to_proc(), $a).apply($b, Opal.to_a(args));
      if ((($a = result.$$is_string != null) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = result == self.literal) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self
          } else {
          return self.$class().$allocate(result)
        }
        } else {
        return result
      };
    });

    Opal.defn(self, '$initialize_copy', function(other) {
      var self = this;

      return self.literal = (other.literal).$clone();
    });

    Opal.defn(self, '$respond_to?', TMP_4 = function(name) {
      var $a, self = this, $iter = TMP_4.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil;

      TMP_4.$$p = null;
      $zuper = [];
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      return ((($a = Opal.find_super_dispatcher(self, 'respond_to?', TMP_4, $iter).apply(self, $zuper)) !== false && $a !== nil) ? $a : self.literal['$respond_to?'](name));
    });

    Opal.defn(self, '$==', function(other) {
      var self = this;

      return self.literal['$=='](other);
    });

    Opal.alias(self, 'eql?', '==');

    Opal.alias(self, '===', '==');

    Opal.defn(self, '$to_s', function() {
      var self = this;

      return self.literal;
    });

    Opal.alias(self, 'to_str', 'to_s');

    Opal.defn(self, '$inspect', function() {
      var self = this;

      return self.literal.$inspect();
    });

    Opal.defn(self, '$+', function(other) {
      var self = this;

      return $rb_plus(self.literal, other);
    });

    Opal.defn(self, '$*', function(other) {
      var self = this;

      
      var result = $rb_times(self.literal, other);

      if (result.$$is_string) {
        return self.$class().$allocate(result)
      }
      else {
        return result;
      }
    ;
    });

    Opal.defn(self, '$split', function(pattern, limit) {
      var $a, $b, TMP_5, self = this;

      return ($a = ($b = self.literal.$split(pattern, limit)).$map, $a.$$p = (TMP_5 = function(str){var self = TMP_5.$$s || this;
if (str == null) str = nil;
      return self.$class().$allocate(str)}, TMP_5.$$s = self, TMP_5), $a).call($b);
    });

    Opal.defn(self, '$replace', function(string) {
      var self = this;

      return self.literal = string;
    });

    Opal.defn(self, '$each_line', TMP_6 = function(separator) {
      var $a, $b, TMP_7, self = this, $iter = TMP_6.$$p, $yield = $iter || nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"]
      }
      TMP_6.$$p = null;
      if (($yield !== nil)) {
        } else {
        return self.$enum_for("each_line", separator)
      };
      return ($a = ($b = self.literal).$each_line, $a.$$p = (TMP_7 = function(str){var self = TMP_7.$$s || this, $a;
if (str == null) str = nil;
      return $a = Opal.yield1($yield, self.$class().$allocate(str)), $a === $breaker ? $a : $a}, TMP_7.$$s = self, TMP_7), $a).call($b, separator);
    });

    Opal.defn(self, '$lines', TMP_8 = function(separator) {
      var $a, $b, self = this, $iter = TMP_8.$$p, block = $iter || nil, e = nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"]
      }
      TMP_8.$$p = null;
      e = ($a = ($b = self).$each_line, $a.$$p = block.$to_proc(), $a).call($b, separator);
      if (block !== false && block !== nil) {
        return self
        } else {
        return e.$to_a()
      };
    });

    return (Opal.defn(self, '$%', function(data) {
      var self = this;

      return self.literal['$%'](data);
    }), nil) && '%';
  })($scope.get('String'), null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/string/encoding"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var $a, $b, TMP_4, $c, TMP_6, $d, TMP_8, self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$require', '$+', '$[]', '$new', '$to_proc', '$each', '$const_set', '$sub', '$upcase', '$const_get', '$===', '$==', '$name', '$include?', '$names', '$constants', '$raise', '$attr_accessor', '$attr_reader', '$register', '$length', '$bytes', '$to_a', '$each_byte', '$bytesize', '$enum_for', '$force_encoding', '$dup', '$coerce_to!', '$find', '$nil?', '$getbyte']);
  self.$require("corelib/string");
  (function($base, $super) {
    function $Encoding(){};
    var self = $Encoding = $klass($base, $super, 'Encoding', $Encoding);

    var def = self.$$proto, $scope = self.$$scope, TMP_1;

    def.ascii = def.dummy = def.name = nil;
    Opal.defs(self, '$register', TMP_1 = function(name, options) {
      var $a, $b, $c, TMP_2, self = this, $iter = TMP_1.$$p, block = $iter || nil, names = nil, encoding = nil;

      if (options == null) {
        options = $hash2([], {})
      }
      TMP_1.$$p = null;
      names = $rb_plus([name], (((($a = options['$[]']("aliases")) !== false && $a !== nil) ? $a : [])));
      encoding = ($a = ($b = $scope.get('Class')).$new, $a.$$p = block.$to_proc(), $a).call($b, self).$new(name, names, ((($a = options['$[]']("ascii")) !== false && $a !== nil) ? $a : false), ((($a = options['$[]']("dummy")) !== false && $a !== nil) ? $a : false));
      return ($a = ($c = names).$each, $a.$$p = (TMP_2 = function(name){var self = TMP_2.$$s || this;
if (name == null) name = nil;
      return self.$const_set(name.$sub("-", "_"), encoding)}, TMP_2.$$s = self, TMP_2), $a).call($c);
    });

    Opal.defs(self, '$find', function(name) {try {

      var $a, $b, TMP_3, self = this, upcase = nil;

      upcase = name.$upcase();
      ($a = ($b = self.$constants()).$each, $a.$$p = (TMP_3 = function(const$){var self = TMP_3.$$s || this, $a, $b, encoding = nil;
if (const$ == null) const$ = nil;
      encoding = self.$const_get(const$);
        if ((($a = $scope.get('Encoding')['$==='](encoding)) !== nil && (!$a.$$is_boolean || $a == true))) {
          } else {
          return nil;
        };
        if ((($a = ((($b = encoding.$name()['$=='](upcase)) !== false && $b !== nil) ? $b : encoding.$names()['$include?'](upcase))) !== nil && (!$a.$$is_boolean || $a == true))) {
          Opal.ret(encoding)
          } else {
          return nil
        };}, TMP_3.$$s = self, TMP_3), $a).call($b);
      return self.$raise($scope.get('ArgumentError'), "unknown encoding name - " + (name));
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    });

    (function(self) {
      var $scope = self.$$scope, def = self.$$proto;

      return self.$attr_accessor("default_external")
    })(Opal.get_singleton_class(self));

    self.$attr_reader("name", "names");

    Opal.defn(self, '$initialize', function(name, names, ascii, dummy) {
      var self = this;

      self.name = name;
      self.names = names;
      self.ascii = ascii;
      return self.dummy = dummy;
    });

    Opal.defn(self, '$ascii_compatible?', function() {
      var self = this;

      return self.ascii;
    });

    Opal.defn(self, '$dummy?', function() {
      var self = this;

      return self.dummy;
    });

    Opal.defn(self, '$to_s', function() {
      var self = this;

      return self.name;
    });

    Opal.defn(self, '$inspect', function() {
      var $a, self = this;

      return "#<Encoding:" + (self.name) + ((function() {if ((($a = self.dummy) !== nil && (!$a.$$is_boolean || $a == true))) {
        return " (dummy)"
        } else {
        return nil
      }; return nil; })()) + ">";
    });

    Opal.defn(self, '$each_byte', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'));
    });

    Opal.defn(self, '$getbyte', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'));
    });

    Opal.defn(self, '$bytesize', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'));
    });

    (function($base, $super) {
      function $EncodingError(){};
      var self = $EncodingError = $klass($base, $super, 'EncodingError', $EncodingError);

      var def = self.$$proto, $scope = self.$$scope;

      return nil;
    })($scope.base, $scope.get('StandardError'));

    return (function($base, $super) {
      function $CompatibilityError(){};
      var self = $CompatibilityError = $klass($base, $super, 'CompatibilityError', $CompatibilityError);

      var def = self.$$proto, $scope = self.$$scope;

      return nil;
    })($scope.base, $scope.get('EncodingError'));
  })($scope.base, null);
  ($a = ($b = $scope.get('Encoding')).$register, $a.$$p = (TMP_4 = function(){var self = TMP_4.$$s || this, TMP_5;

  Opal.def(self, '$each_byte', TMP_5 = function(string) {
      var $a, self = this, $iter = TMP_5.$$p, block = $iter || nil;

      TMP_5.$$p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        var code = string.charCodeAt(i);

        if (code <= 0x7f) {
          ((($a = Opal.yield1(block, code)) === $breaker) ? $breaker.$v : $a);
        }
        else {
          var encoded = encodeURIComponent(string.charAt(i)).substr(1).split('%');

          for (var j = 0, encoded_length = encoded.length; j < encoded_length; j++) {
            ((($a = Opal.yield1(block, parseInt(encoded[j], 16))) === $breaker) ? $breaker.$v : $a);
          }
        }
      }
    
    });
    return (Opal.def(self, '$bytesize', function() {
      var self = this;

      return self.$bytes().$length();
    }), nil) && 'bytesize';}, TMP_4.$$s = self, TMP_4), $a).call($b, "UTF-8", $hash2(["aliases", "ascii"], {"aliases": ["CP65001"], "ascii": true}));
  ($a = ($c = $scope.get('Encoding')).$register, $a.$$p = (TMP_6 = function(){var self = TMP_6.$$s || this, TMP_7;

  Opal.def(self, '$each_byte', TMP_7 = function(string) {
      var $a, self = this, $iter = TMP_7.$$p, block = $iter || nil;

      TMP_7.$$p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        var code = string.charCodeAt(i);

        ((($a = Opal.yield1(block, code & 0xff)) === $breaker) ? $breaker.$v : $a);
        ((($a = Opal.yield1(block, code >> 8)) === $breaker) ? $breaker.$v : $a);
      }
    
    });
    return (Opal.def(self, '$bytesize', function() {
      var self = this;

      return self.$bytes().$length();
    }), nil) && 'bytesize';}, TMP_6.$$s = self, TMP_6), $a).call($c, "UTF-16LE");
  ($a = ($d = $scope.get('Encoding')).$register, $a.$$p = (TMP_8 = function(){var self = TMP_8.$$s || this, TMP_9;

  Opal.def(self, '$each_byte', TMP_9 = function(string) {
      var $a, self = this, $iter = TMP_9.$$p, block = $iter || nil;

      TMP_9.$$p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        ((($a = Opal.yield1(block, string.charCodeAt(i) & 0xff)) === $breaker) ? $breaker.$v : $a);
      }
    
    });
    return (Opal.def(self, '$bytesize', function() {
      var self = this;

      return self.$bytes().$length();
    }), nil) && 'bytesize';}, TMP_8.$$s = self, TMP_8), $a).call($d, "ASCII-8BIT", $hash2(["aliases", "ascii"], {"aliases": ["BINARY"], "ascii": true}));
  return (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope, TMP_10;

    def.encoding = nil;
    String.prototype.encoding = (($scope.get('Encoding')).$$scope.get('UTF_16LE'));

    Opal.defn(self, '$bytes', function() {
      var self = this;

      return self.$each_byte().$to_a();
    });

    Opal.defn(self, '$bytesize', function() {
      var self = this;

      return self.encoding.$bytesize(self);
    });

    Opal.defn(self, '$each_byte', TMP_10 = function() {
      var $a, $b, self = this, $iter = TMP_10.$$p, block = $iter || nil;

      TMP_10.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("each_byte")
      };
      ($a = ($b = self.encoding).$each_byte, $a.$$p = block.$to_proc(), $a).call($b, self);
      return self;
    });

    Opal.defn(self, '$encode', function(encoding) {
      var self = this;

      return self.$dup().$force_encoding(encoding);
    });

    Opal.defn(self, '$encoding', function() {
      var self = this;

      return self.encoding;
    });

    Opal.defn(self, '$force_encoding', function(encoding) {
      var $a, self = this;

      encoding = $scope.get('Opal')['$coerce_to!'](encoding, $scope.get('String'), "to_str");
      encoding = $scope.get('Encoding').$find(encoding);
      if (encoding['$=='](self.encoding)) {
        return self};
      if ((($a = encoding['$nil?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "unknown encoding name - " + (encoding))};
      
      var result = new String(self);
      result.encoding = encoding;

      return result;
    
    });

    return (Opal.defn(self, '$getbyte', function(idx) {
      var self = this;

      return self.encoding.$getbyte(self, idx);
    }), nil) && 'getbyte';
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/math"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$new', '$raise', '$Float', '$type_error', '$Integer', '$module_function', '$checked', '$float!', '$===', '$gamma', '$-', '$integer!', '$/', '$infinite?']);
  return (function($base) {
    var $Math, self = $Math = $module($base, 'Math');

    var def = self.$$proto, $scope = self.$$scope, $a;

    Opal.cdecl($scope, 'E', Math.E);

    Opal.cdecl($scope, 'PI', Math.PI);

    Opal.cdecl($scope, 'DomainError', $scope.get('Class').$new($scope.get('StandardError')));

    Opal.defs(self, '$checked', function(method) {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 1;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 1];
      }
      
      if (isNaN(args[0]) || (args.length == 2 && isNaN(args[1]))) {
        return NaN;
      }

      var result = Math[method].apply(null, args);

      if (isNaN(result)) {
        self.$raise($scope.get('DomainError'), "Numerical argument is out of domain - \"" + (method) + "\"");
      }

      return result;
    
    });

    Opal.defs(self, '$float!', function(value) {
      var self = this;

      try {
      return self.$Float(value)
      } catch ($err) {if (Opal.rescue($err, [$scope.get('ArgumentError')])) {
        try {
          return self.$raise($scope.get('Opal').$type_error(value, $scope.get('Float')))
        } finally {
          Opal.gvars["!"] = Opal.exceptions.pop() || Opal.nil;
        }
        }else { throw $err; }
      };
    });

    Opal.defs(self, '$integer!', function(value) {
      var self = this;

      try {
      return self.$Integer(value)
      } catch ($err) {if (Opal.rescue($err, [$scope.get('ArgumentError')])) {
        try {
          return self.$raise($scope.get('Opal').$type_error(value, $scope.get('Integer')))
        } finally {
          Opal.gvars["!"] = Opal.exceptions.pop() || Opal.nil;
        }
        }else { throw $err; }
      };
    });

    self.$module_function();

    Opal.defn(self, '$acos', function(x) {
      var self = this;

      return $scope.get('Math').$checked("acos", $scope.get('Math')['$float!'](x));
    });

    if ((($a = (typeof(Math.acosh) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.acosh = function(x) {
        return Math.log(x + Math.sqrt(x * x - 1));
      }
    
    };

    Opal.defn(self, '$acosh', function(x) {
      var self = this;

      return $scope.get('Math').$checked("acosh", $scope.get('Math')['$float!'](x));
    });

    Opal.defn(self, '$asin', function(x) {
      var self = this;

      return $scope.get('Math').$checked("asin", $scope.get('Math')['$float!'](x));
    });

    if ((($a = (typeof(Math.asinh) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.asinh = function(x) {
        return Math.log(x + Math.sqrt(x * x + 1))
      }
    ;
    };

    Opal.defn(self, '$asinh', function(x) {
      var self = this;

      return $scope.get('Math').$checked("asinh", $scope.get('Math')['$float!'](x));
    });

    Opal.defn(self, '$atan', function(x) {
      var self = this;

      return $scope.get('Math').$checked("atan", $scope.get('Math')['$float!'](x));
    });

    Opal.defn(self, '$atan2', function(y, x) {
      var self = this;

      return $scope.get('Math').$checked("atan2", $scope.get('Math')['$float!'](y), $scope.get('Math')['$float!'](x));
    });

    if ((($a = (typeof(Math.atanh) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.atanh = function(x) {
        return 0.5 * Math.log((1 + x) / (1 - x));
      }
    
    };

    Opal.defn(self, '$atanh', function(x) {
      var self = this;

      return $scope.get('Math').$checked("atanh", $scope.get('Math')['$float!'](x));
    });

    if ((($a = (typeof(Math.cbrt) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.cbrt = function(x) {
        if (x == 0) {
          return 0;
        }

        if (x < 0) {
          return -Math.cbrt(-x);
        }

        var r  = x,
            ex = 0;

        while (r < 0.125) {
          r *= 8;
          ex--;
        }

        while (r > 1.0) {
          r *= 0.125;
          ex++;
        }

        r = (-0.46946116 * r + 1.072302) * r + 0.3812513;

        while (ex < 0) {
          r *= 0.5;
          ex++;
        }

        while (ex > 0) {
          r *= 2;
          ex--;
        }

        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);
        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);
        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);
        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);

        return r;
      }
    
    };

    Opal.defn(self, '$cbrt', function(x) {
      var self = this;

      return $scope.get('Math').$checked("cbrt", $scope.get('Math')['$float!'](x));
    });

    Opal.defn(self, '$cos', function(x) {
      var self = this;

      return $scope.get('Math').$checked("cos", $scope.get('Math')['$float!'](x));
    });

    if ((($a = (typeof(Math.cosh) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.cosh = function(x) {
        return (Math.exp(x) + Math.exp(-x)) / 2;
      }
    
    };

    Opal.defn(self, '$cosh', function(x) {
      var self = this;

      return $scope.get('Math').$checked("cosh", $scope.get('Math')['$float!'](x));
    });

    if ((($a = (typeof(Math.erf) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.erf = function(x) {
        var A1 =  0.254829592,
            A2 = -0.284496736,
            A3 =  1.421413741,
            A4 = -1.453152027,
            A5 =  1.061405429,
            P  =  0.3275911;

        var sign = 1;

        if (x < 0) {
            sign = -1;
        }

        x = Math.abs(x);

        var t = 1.0 / (1.0 + P * x);
        var y = 1.0 - (((((A5 * t + A4) * t) + A3) * t + A2) * t + A1) * t * Math.exp(-x * x);

        return sign * y;
      }
    
    };

    Opal.defn(self, '$erf', function(x) {
      var self = this;

      return $scope.get('Math').$checked("erf", $scope.get('Math')['$float!'](x));
    });

    if ((($a = (typeof(Math.erfc) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.erfc = function(x) {
        var z = Math.abs(x),
            t = 1.0 / (0.5 * z + 1.0);

        var A1 = t * 0.17087277 + -0.82215223,
            A2 = t * A1 + 1.48851587,
            A3 = t * A2 + -1.13520398,
            A4 = t * A3 + 0.27886807,
            A5 = t * A4 + -0.18628806,
            A6 = t * A5 + 0.09678418,
            A7 = t * A6 + 0.37409196,
            A8 = t * A7 + 1.00002368,
            A9 = t * A8,
            A10 = -z * z - 1.26551223 + A9;

        var a = t * Math.exp(A10);

        if (x < 0.0) {
          return 2.0 - a;
        }
        else {
          return a;
        }
      }
    
    };

    Opal.defn(self, '$erfc', function(x) {
      var self = this;

      return $scope.get('Math').$checked("erfc", $scope.get('Math')['$float!'](x));
    });

    Opal.defn(self, '$exp', function(x) {
      var self = this;

      return $scope.get('Math').$checked("exp", $scope.get('Math')['$float!'](x));
    });

    Opal.defn(self, '$frexp', function(x) {
      var self = this;

      x = $scope.get('Math')['$float!'](x);
      
      if (isNaN(x)) {
        return [NaN, 0];
      }

      var ex   = Math.floor(Math.log(Math.abs(x)) / Math.log(2)) + 1,
          frac = x / Math.pow(2, ex);

      return [frac, ex];
    
    });

    Opal.defn(self, '$gamma', function(n) {
      var self = this;

      n = $scope.get('Math')['$float!'](n);
      
      var i, t, x, value, result, twoN, threeN, fourN, fiveN;

      var G = 4.7421875;

      var P = [
         0.99999999999999709182,
         57.156235665862923517,
        -59.597960355475491248,
         14.136097974741747174,
        -0.49191381609762019978,
         0.33994649984811888699e-4,
         0.46523628927048575665e-4,
        -0.98374475304879564677e-4,
         0.15808870322491248884e-3,
        -0.21026444172410488319e-3,
         0.21743961811521264320e-3,
        -0.16431810653676389022e-3,
         0.84418223983852743293e-4,
        -0.26190838401581408670e-4,
         0.36899182659531622704e-5
      ];


      if (isNaN(n)) {
        return NaN;
      }

      if (n === 0 && 1 / n < 0) {
        return -Infinity;
      }

      if (n === -1 || n === -Infinity) {
        self.$raise($scope.get('DomainError'), "Numerical argument is out of domain - \"gamma\"");
      }

      if ($scope.get('Integer')['$==='](n)) {
        if (n <= 0) {
          return isFinite(n) ? Infinity : NaN;
        }

        if (n > 171) {
          return Infinity;
        }

        value  = n - 2;
        result = n - 1;

        while (value > 1) {
          result *= value;
          value--;
        }

        if (result == 0) {
          result = 1;
        }

        return result;
      }

      if (n < 0.5) {
        return Math.PI / (Math.sin(Math.PI * n) * $scope.get('Math').$gamma($rb_minus(1, n)));
      }

      if (n >= 171.35) {
        return Infinity;
      }

      if (n > 85.0) {
        twoN   = n * n;
        threeN = twoN * n;
        fourN  = threeN * n;
        fiveN  = fourN * n;

        return Math.sqrt(2 * Math.PI / n) * Math.pow((n / Math.E), n) *
          (1 + 1 / (12 * n) + 1 / (288 * twoN) - 139 / (51840 * threeN) -
          571 / (2488320 * fourN) + 163879 / (209018880 * fiveN) +
          5246819 / (75246796800 * fiveN * n));
      }

      n -= 1;
      x  = P[0];

      for (i = 1; i < P.length; ++i) {
        x += P[i] / (n + i);
      }

      t = n + G + 0.5;

      return Math.sqrt(2 * Math.PI) * Math.pow(t, n + 0.5) * Math.exp(-t) * x;
    
    });

    if ((($a = (typeof(Math.hypot) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.hypot = function(x, y) {
        return Math.sqrt(x * x + y * y)
      }
    ;
    };

    Opal.defn(self, '$hypot', function(x, y) {
      var self = this;

      return $scope.get('Math').$checked("hypot", $scope.get('Math')['$float!'](x), $scope.get('Math')['$float!'](y));
    });

    Opal.defn(self, '$ldexp', function(mantissa, exponent) {
      var self = this;

      mantissa = $scope.get('Math')['$float!'](mantissa);
      exponent = $scope.get('Math')['$integer!'](exponent);
      
      if (isNaN(exponent)) {
        self.$raise($scope.get('RangeError'), "float NaN out of range of integer");
      }

      return mantissa * Math.pow(2, exponent);
    ;
    });

    Opal.defn(self, '$lgamma', function(n) {
      var self = this;

      
      if (n == -1) {
        return [Infinity, 1];
      }
      else {
        return [Math.log(Math.abs($scope.get('Math').$gamma(n))), $scope.get('Math').$gamma(n) < 0 ? -1 : 1];
      }
    ;
    });

    Opal.defn(self, '$log', function(x, base) {
      var $a, self = this;

      if ((($a = $scope.get('String')['$==='](x)) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('Opal').$type_error(x, $scope.get('Float')))};
      if ((($a = base == null) !== nil && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Math').$checked("log", $scope.get('Math')['$float!'](x))
        } else {
        if ((($a = $scope.get('String')['$==='](base)) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('Opal').$type_error(base, $scope.get('Float')))};
        return $rb_divide($scope.get('Math').$checked("log", $scope.get('Math')['$float!'](x)), $scope.get('Math').$checked("log", $scope.get('Math')['$float!'](base)));
      };
    });

    if ((($a = (typeof(Math.log10) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.log10 = function(x) {
        return Math.log(x) / Math.LN10;
      }
    
    };

    Opal.defn(self, '$log10', function(x) {
      var $a, self = this;

      if ((($a = $scope.get('String')['$==='](x)) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('Opal').$type_error(x, $scope.get('Float')))};
      return $scope.get('Math').$checked("log10", $scope.get('Math')['$float!'](x));
    });

    if ((($a = (typeof(Math.log2) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.log2 = function(x) {
        return Math.log(x) / Math.LN2;
      }
    
    };

    Opal.defn(self, '$log2', function(x) {
      var $a, self = this;

      if ((($a = $scope.get('String')['$==='](x)) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('Opal').$type_error(x, $scope.get('Float')))};
      return $scope.get('Math').$checked("log2", $scope.get('Math')['$float!'](x));
    });

    Opal.defn(self, '$sin', function(x) {
      var self = this;

      return $scope.get('Math').$checked("sin", $scope.get('Math')['$float!'](x));
    });

    if ((($a = (typeof(Math.sinh) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.sinh = function(x) {
        return (Math.exp(x) - Math.exp(-x)) / 2;
      }
    
    };

    Opal.defn(self, '$sinh', function(x) {
      var self = this;

      return $scope.get('Math').$checked("sinh", $scope.get('Math')['$float!'](x));
    });

    Opal.defn(self, '$sqrt', function(x) {
      var self = this;

      return $scope.get('Math').$checked("sqrt", $scope.get('Math')['$float!'](x));
    });

    Opal.defn(self, '$tan', function(x) {
      var $a, self = this;

      x = $scope.get('Math')['$float!'](x);
      if ((($a = x['$infinite?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return (($scope.get('Float')).$$scope.get('NAN'))};
      return $scope.get('Math').$checked("tan", $scope.get('Math')['$float!'](x));
    });

    if ((($a = (typeof(Math.tanh) !== "undefined")) !== nil && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.tanh = function(x) {
        if (x == Infinity) {
          return 1;
        }
        else if (x == -Infinity) {
          return -1;
        }
        else {
          return (Math.exp(x) - Math.exp(-x)) / (Math.exp(x) + Math.exp(-x));
        }
      }
    
    };

    Opal.defn(self, '$tanh', function(x) {
      var self = this;

      return $scope.get('Math').$checked("tanh", $scope.get('Math')['$float!'](x));
    });
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/complex"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module;

  Opal.add_stubs(['$require', '$===', '$real?', '$raise', '$new', '$*', '$cos', '$sin', '$attr_reader', '$class', '$==', '$real', '$imag', '$Complex', '$-@', '$+', '$__coerced__', '$-', '$nan?', '$/', '$conj', '$abs2', '$quo', '$polar', '$exp', '$log', '$>', '$!=', '$divmod', '$**', '$hypot', '$atan2', '$lcm', '$denominator', '$to_s', '$numerator', '$abs', '$arg', '$rationalize', '$to_f', '$to_i', '$to_r', '$inspect', '$positive?', '$infinite?']);
  self.$require("corelib/numeric");
  (function($base, $super) {
    function $Complex(){};
    var self = $Complex = $klass($base, $super, 'Complex', $Complex);

    var def = self.$$proto, $scope = self.$$scope;

    def.real = def.imag = nil;
    Opal.defs(self, '$rect', function(real, imag) {
      var $a, $b, $c, $d, self = this;

      if (imag == null) {
        imag = 0
      }
      if ((($a = ($b = ($c = ($d = $scope.get('Numeric')['$==='](real), $d !== false && $d !== nil ?real['$real?']() : $d), $c !== false && $c !== nil ?$scope.get('Numeric')['$==='](imag) : $c), $b !== false && $b !== nil ?imag['$real?']() : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "not a real")
      };
      return self.$new(real, imag);
    });

    (function(self) {
      var $scope = self.$$scope, def = self.$$proto;

      return Opal.alias(self, 'rectangular', 'rect')
    })(Opal.get_singleton_class(self));

    Opal.defs(self, '$polar', function(r, theta) {
      var $a, $b, $c, $d, self = this;

      if (theta == null) {
        theta = 0
      }
      if ((($a = ($b = ($c = ($d = $scope.get('Numeric')['$==='](r), $d !== false && $d !== nil ?r['$real?']() : $d), $c !== false && $c !== nil ?$scope.get('Numeric')['$==='](theta) : $c), $b !== false && $b !== nil ?theta['$real?']() : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "not a real")
      };
      return self.$new($rb_times(r, $scope.get('Math').$cos(theta)), $rb_times(r, $scope.get('Math').$sin(theta)));
    });

    self.$attr_reader("real", "imag");

    Opal.defn(self, '$initialize', function(real, imag) {
      var self = this;

      if (imag == null) {
        imag = 0
      }
      self.real = real;
      return self.imag = imag;
    });

    Opal.defn(self, '$coerce', function(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return [other, self]
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil ?other['$real?']() : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return [$scope.get('Complex').$new(other, 0), self]
        } else {
        return self.$raise($scope.get('TypeError'), "" + (other.$class()) + " can't be coerced into Complex")
      };
    });

    Opal.defn(self, '$==', function(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return (($a = self.real['$=='](other.$real())) ? self.imag['$=='](other.$imag()) : self.real['$=='](other.$real()))
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil ?other['$real?']() : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return (($a = self.real['$=='](other)) ? self.imag['$=='](0) : self.real['$=='](other))
        } else {
        return other['$=='](self)
      };
    });

    Opal.defn(self, '$-@', function() {
      var self = this;

      return self.$Complex(self.real['$-@'](), self.imag['$-@']());
    });

    Opal.defn(self, '$+', function(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_plus(self.real, other.$real()), $rb_plus(self.imag, other.$imag()))
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil ?other['$real?']() : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_plus(self.real, other), self.imag)
        } else {
        return self.$__coerced__("+", other)
      };
    });

    Opal.defn(self, '$-', function(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_minus(self.real, other.$real()), $rb_minus(self.imag, other.$imag()))
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil ?other['$real?']() : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_minus(self.real, other), self.imag)
        } else {
        return self.$__coerced__("-", other)
      };
    });

    Opal.defn(self, '$*', function(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_minus($rb_times(self.real, other.$real()), $rb_times(self.imag, other.$imag())), $rb_plus($rb_times(self.real, other.$imag()), $rb_times(self.imag, other.$real())))
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil ?other['$real?']() : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_times(self.real, other), $rb_times(self.imag, other))
        } else {
        return self.$__coerced__("*", other)
      };
    });

    Opal.defn(self, '$/', function(other) {
      var $a, $b, $c, $d, $e, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ((($b = ((($c = ((($d = (($e = $scope.get('Number')['$==='](self.real), $e !== false && $e !== nil ?self.real['$nan?']() : $e))) !== false && $d !== nil) ? $d : (($e = $scope.get('Number')['$==='](self.imag), $e !== false && $e !== nil ?self.imag['$nan?']() : $e)))) !== false && $c !== nil) ? $c : (($d = $scope.get('Number')['$==='](other.$real()), $d !== false && $d !== nil ?other.$real()['$nan?']() : $d)))) !== false && $b !== nil) ? $b : (($c = $scope.get('Number')['$==='](other.$imag()), $c !== false && $c !== nil ?other.$imag()['$nan?']() : $c)))) !== nil && (!$a.$$is_boolean || $a == true))) {
          return $scope.get('Complex').$new((($scope.get('Float')).$$scope.get('NAN')), (($scope.get('Float')).$$scope.get('NAN')))
          } else {
          return $rb_divide($rb_times(self, other.$conj()), other.$abs2())
        }
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil ?other['$real?']() : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex(self.real.$quo(other), self.imag.$quo(other))
        } else {
        return self.$__coerced__("/", other)
      };
    });

    Opal.defn(self, '$**', function(other) {
      var $a, $b, $c, $d, $e, self = this, r = nil, theta = nil, ore = nil, oim = nil, nr = nil, ntheta = nil, x = nil, z = nil, n = nil, div = nil, mod = nil;

      if (other['$=='](0)) {
        return $scope.get('Complex').$new(1, 0)};
      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        $b = self.$polar(), $a = Opal.to_ary($b), r = ($a[0] == null ? nil : $a[0]), theta = ($a[1] == null ? nil : $a[1]), $b;
        ore = other.$real();
        oim = other.$imag();
        nr = $scope.get('Math').$exp($rb_minus($rb_times(ore, $scope.get('Math').$log(r)), $rb_times(oim, theta)));
        ntheta = $rb_plus($rb_times(theta, ore), $rb_times(oim, $scope.get('Math').$log(r)));
        return $scope.get('Complex').$polar(nr, ntheta);
      } else if ((($a = $scope.get('Integer')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $rb_gt(other, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
          x = self;
          z = x;
          n = $rb_minus(other, 1);
          while ((($b = n['$!='](0)) !== nil && (!$b.$$is_boolean || $b == true))) {
          while ((($c = ($e = n.$divmod(2), $d = Opal.to_ary($e), div = ($d[0] == null ? nil : $d[0]), mod = ($d[1] == null ? nil : $d[1]), $e, mod['$=='](0))) !== nil && (!$c.$$is_boolean || $c == true))) {
          x = self.$Complex($rb_minus($rb_times(x.$real(), x.$real()), $rb_times(x.$imag(), x.$imag())), $rb_times($rb_times(2, x.$real()), x.$imag()));
          n = div;};
          z = $rb_times(z, x);
          n = $rb_minus(n, 1);};
          return z;
          } else {
          return ($rb_divide($scope.get('Rational').$new(1, 1), self))['$**'](other['$-@']())
        }
      } else if ((($a = ((($b = $scope.get('Float')['$==='](other)) !== false && $b !== nil) ? $b : $scope.get('Rational')['$==='](other))) !== nil && (!$a.$$is_boolean || $a == true))) {
        $b = self.$polar(), $a = Opal.to_ary($b), r = ($a[0] == null ? nil : $a[0]), theta = ($a[1] == null ? nil : $a[1]), $b;
        return $scope.get('Complex').$polar(r['$**'](other), $rb_times(theta, other));
        } else {
        return self.$__coerced__("**", other)
      };
    });

    Opal.defn(self, '$abs', function() {
      var self = this;

      return $scope.get('Math').$hypot(self.real, self.imag);
    });

    Opal.defn(self, '$abs2', function() {
      var self = this;

      return $rb_plus($rb_times(self.real, self.real), $rb_times(self.imag, self.imag));
    });

    Opal.defn(self, '$angle', function() {
      var self = this;

      return $scope.get('Math').$atan2(self.imag, self.real);
    });

    Opal.alias(self, 'arg', 'angle');

    Opal.defn(self, '$conj', function() {
      var self = this;

      return self.$Complex(self.real, self.imag['$-@']());
    });

    Opal.alias(self, 'conjugate', 'conj');

    Opal.defn(self, '$denominator', function() {
      var self = this;

      return self.real.$denominator().$lcm(self.imag.$denominator());
    });

    Opal.alias(self, 'divide', '/');

    Opal.defn(self, '$eql?', function(other) {
      var $a, $b, self = this;

      return ($a = ($b = $scope.get('Complex')['$==='](other), $b !== false && $b !== nil ?self.real.$class()['$=='](self.imag.$class()) : $b), $a !== false && $a !== nil ?self['$=='](other) : $a);
    });

    Opal.defn(self, '$fdiv', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Numeric')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "" + (other.$class()) + " can't be coerced into Complex")
      };
      return $rb_divide(self, other);
    });

    Opal.defn(self, '$hash', function() {
      var self = this;

      return "Complex:" + (self.real) + ":" + (self.imag);
    });

    Opal.alias(self, 'imaginary', 'imag');

    Opal.defn(self, '$inspect', function() {
      var self = this;

      return "(" + (self.$to_s()) + ")";
    });

    Opal.alias(self, 'magnitude', 'abs');

    Opal.defn(self, '$numerator', function() {
      var self = this, d = nil;

      d = self.$denominator();
      return self.$Complex($rb_times(self.real.$numerator(), ($rb_divide(d, self.real.$denominator()))), $rb_times(self.imag.$numerator(), ($rb_divide(d, self.imag.$denominator()))));
    });

    Opal.alias(self, 'phase', 'arg');

    Opal.defn(self, '$polar', function() {
      var self = this;

      return [self.$abs(), self.$arg()];
    });

    Opal.alias(self, 'quo', '/');

    Opal.defn(self, '$rationalize', function(eps) {
      var $a, self = this;

      
      if (arguments.length > 1) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 0..1)");
      }
    ;
      if ((($a = self.imag['$!='](0)) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('RangeError'), "can't' convert " + (self) + " into Rational")};
      return self.$real().$rationalize(eps);
    });

    Opal.defn(self, '$real?', function() {
      var self = this;

      return false;
    });

    Opal.defn(self, '$rect', function() {
      var self = this;

      return [self.real, self.imag];
    });

    Opal.alias(self, 'rectangular', 'rect');

    Opal.defn(self, '$to_f', function() {
      var self = this;

      if (self.imag['$=='](0)) {
        } else {
        self.$raise($scope.get('RangeError'), "can't convert " + (self) + " into Float")
      };
      return self.real.$to_f();
    });

    Opal.defn(self, '$to_i', function() {
      var self = this;

      if (self.imag['$=='](0)) {
        } else {
        self.$raise($scope.get('RangeError'), "can't convert " + (self) + " into Integer")
      };
      return self.real.$to_i();
    });

    Opal.defn(self, '$to_r', function() {
      var self = this;

      if (self.imag['$=='](0)) {
        } else {
        self.$raise($scope.get('RangeError'), "can't convert " + (self) + " into Rational")
      };
      return self.real.$to_r();
    });

    Opal.defn(self, '$to_s', function() {
      var $a, $b, $c, self = this, result = nil;

      result = self.real.$inspect();
      if ((($a = ((($b = (($c = $scope.get('Number')['$==='](self.imag), $c !== false && $c !== nil ?self.imag['$nan?']() : $c))) !== false && $b !== nil) ? $b : self.imag['$positive?']())) !== nil && (!$a.$$is_boolean || $a == true))) {
        result = $rb_plus(result, "+")
        } else {
        result = $rb_plus(result, "-")
      };
      result = $rb_plus(result, self.imag.$abs().$inspect());
      if ((($a = ($b = $scope.get('Number')['$==='](self.imag), $b !== false && $b !== nil ?(((($c = self.imag['$nan?']()) !== false && $c !== nil) ? $c : self.imag['$infinite?']())) : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        result = $rb_plus(result, "*")};
      return $rb_plus(result, "i");
    });

    return Opal.cdecl($scope, 'I', self.$new(0, 1));
  })($scope.base, $scope.get('Numeric'));
  return (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defn(self, '$Complex', function(real, imag) {
      var self = this;

      if (imag == null) {
        imag = nil
      }
      if (imag !== false && imag !== nil) {
        return $scope.get('Complex').$new(real, imag)
        } else {
        return $scope.get('Complex').$new(real, 0)
      };
    })
  })($scope.base);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/rational"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module;

  Opal.add_stubs(['$require', '$to_i', '$==', '$raise', '$<', '$-@', '$new', '$gcd', '$/', '$nil?', '$===', '$reduce', '$to_r', '$equal?', '$!', '$coerce_to!', '$attr_reader', '$to_f', '$numerator', '$denominator', '$<=>', '$-', '$*', '$__coerced__', '$+', '$Rational', '$>', '$**', '$abs', '$ceil', '$with_precision', '$floor', '$to_s', '$<=', '$truncate', '$send', '$convert']);
  self.$require("corelib/numeric");
  (function($base, $super) {
    function $Rational(){};
    var self = $Rational = $klass($base, $super, 'Rational', $Rational);

    var def = self.$$proto, $scope = self.$$scope;

    def.num = def.den = nil;
    Opal.defs(self, '$reduce', function(num, den) {
      var $a, self = this, gcd = nil;

      num = num.$to_i();
      den = den.$to_i();
      if (den['$=='](0)) {
        self.$raise($scope.get('ZeroDivisionError'), "divided by 0")
      } else if ((($a = $rb_lt(den, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
        num = num['$-@']();
        den = den['$-@']();
      } else if (den['$=='](1)) {
        return self.$new(num, den)};
      gcd = num.$gcd(den);
      return self.$new($rb_divide(num, gcd), $rb_divide(den, gcd));
    });

    Opal.defs(self, '$convert', function(num, den) {
      var $a, $b, $c, self = this;

      if ((($a = ((($b = num['$nil?']()) !== false && $b !== nil) ? $b : den['$nil?']())) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('TypeError'), "cannot convert nil into Rational")};
      if ((($a = ($b = $scope.get('Integer')['$==='](num), $b !== false && $b !== nil ?$scope.get('Integer')['$==='](den) : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$reduce(num, den)};
      if ((($a = ((($b = ((($c = $scope.get('Float')['$==='](num)) !== false && $c !== nil) ? $c : $scope.get('String')['$==='](num))) !== false && $b !== nil) ? $b : $scope.get('Complex')['$==='](num))) !== nil && (!$a.$$is_boolean || $a == true))) {
        num = num.$to_r()};
      if ((($a = ((($b = ((($c = $scope.get('Float')['$==='](den)) !== false && $c !== nil) ? $c : $scope.get('String')['$==='](den))) !== false && $b !== nil) ? $b : $scope.get('Complex')['$==='](den))) !== nil && (!$a.$$is_boolean || $a == true))) {
        den = den.$to_r()};
      if ((($a = ($b = den['$equal?'](1), $b !== false && $b !== nil ?($scope.get('Integer')['$==='](num))['$!']() : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Opal')['$coerce_to!'](num, $scope.get('Rational'), "to_r")
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](num), $b !== false && $b !== nil ?$scope.get('Numeric')['$==='](den) : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return $rb_divide(num, den)
        } else {
        return self.$reduce(num, den)
      };
    });

    self.$attr_reader("numerator", "denominator");

    Opal.defn(self, '$initialize', function(num, den) {
      var self = this;

      self.num = num;
      return self.den = den;
    });

    Opal.defn(self, '$numerator', function() {
      var self = this;

      return self.num;
    });

    Opal.defn(self, '$denominator', function() {
      var self = this;

      return self.den;
    });

    Opal.defn(self, '$coerce', function(other) {
      var self = this, $case = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {return [other, self]}else if ($scope.get('Integer')['$===']($case)) {return [other.$to_r(), self]}else if ($scope.get('Float')['$===']($case)) {return [other, self.$to_f()]}else { return nil }})();
    });

    Opal.defn(self, '$==', function(other) {
      var $a, self = this, $case = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {return (($a = self.num['$=='](other.$numerator())) ? self.den['$=='](other.$denominator()) : self.num['$=='](other.$numerator()))}else if ($scope.get('Integer')['$===']($case)) {return (($a = self.num['$=='](other)) ? self.den['$=='](1) : self.num['$=='](other))}else if ($scope.get('Float')['$===']($case)) {return self.$to_f()['$=='](other)}else {return other['$=='](self)}})();
    });

    Opal.defn(self, '$<=>', function(other) {
      var self = this, $case = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {return $rb_minus($rb_times(self.num, other.$denominator()), $rb_times(self.den, other.$numerator()))['$<=>'](0)}else if ($scope.get('Integer')['$===']($case)) {return $rb_minus(self.num, $rb_times(self.den, other))['$<=>'](0)}else if ($scope.get('Float')['$===']($case)) {return self.$to_f()['$<=>'](other)}else {return self.$__coerced__("<=>", other)}})();
    });

    Opal.defn(self, '$+', function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {num = $rb_plus($rb_times(self.num, other.$denominator()), $rb_times(self.den, other.$numerator()));
      den = $rb_times(self.den, other.$denominator());
      return self.$Rational(num, den);}else if ($scope.get('Integer')['$===']($case)) {return self.$Rational($rb_plus(self.num, $rb_times(other, self.den)), self.den)}else if ($scope.get('Float')['$===']($case)) {return $rb_plus(self.$to_f(), other)}else {return self.$__coerced__("+", other)}})();
    });

    Opal.defn(self, '$-', function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {num = $rb_minus($rb_times(self.num, other.$denominator()), $rb_times(self.den, other.$numerator()));
      den = $rb_times(self.den, other.$denominator());
      return self.$Rational(num, den);}else if ($scope.get('Integer')['$===']($case)) {return self.$Rational($rb_minus(self.num, $rb_times(other, self.den)), self.den)}else if ($scope.get('Float')['$===']($case)) {return $rb_minus(self.$to_f(), other)}else {return self.$__coerced__("-", other)}})();
    });

    Opal.defn(self, '$*', function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {num = $rb_times(self.num, other.$numerator());
      den = $rb_times(self.den, other.$denominator());
      return self.$Rational(num, den);}else if ($scope.get('Integer')['$===']($case)) {return self.$Rational($rb_times(self.num, other), self.den)}else if ($scope.get('Float')['$===']($case)) {return $rb_times(self.$to_f(), other)}else {return self.$__coerced__("*", other)}})();
    });

    Opal.defn(self, '$/', function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {num = $rb_times(self.num, other.$denominator());
      den = $rb_times(self.den, other.$numerator());
      return self.$Rational(num, den);}else if ($scope.get('Integer')['$===']($case)) {if (other['$=='](0)) {
        return $rb_divide(self.$to_f(), 0.0)
        } else {
        return self.$Rational(self.num, $rb_times(self.den, other))
      }}else if ($scope.get('Float')['$===']($case)) {return $rb_divide(self.$to_f(), other)}else {return self.$__coerced__("/", other)}})();
    });

    Opal.defn(self, '$**', function(other) {
      var $a, $b, self = this, $case = nil;

      return (function() {$case = other;if ($scope.get('Integer')['$===']($case)) {if ((($a = (($b = self['$=='](0)) ? $rb_lt(other, 0) : self['$=='](0))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return (($scope.get('Float')).$$scope.get('INFINITY'))
      } else if ((($a = $rb_gt(other, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$Rational(self.num['$**'](other), self.den['$**'](other))
      } else if ((($a = $rb_lt(other, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$Rational(self.den['$**'](other['$-@']()), self.num['$**'](other['$-@']()))
        } else {
        return self.$Rational(1, 1)
      }}else if ($scope.get('Float')['$===']($case)) {return self.$to_f()['$**'](other)}else if ($scope.get('Rational')['$===']($case)) {if (other['$=='](0)) {
        return self.$Rational(1, 1)
      } else if (other.$denominator()['$=='](1)) {
        if ((($a = $rb_lt(other, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self.$Rational(self.den['$**'](other.$numerator().$abs()), self.num['$**'](other.$numerator().$abs()))
          } else {
          return self.$Rational(self.num['$**'](other.$numerator()), self.den['$**'](other.$numerator()))
        }
      } else if ((($a = (($b = self['$=='](0)) ? $rb_lt(other, 0) : self['$=='](0))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('ZeroDivisionError'), "divided by 0")
        } else {
        return self.$to_f()['$**'](other)
      }}else {return self.$__coerced__("**", other)}})();
    });

    Opal.defn(self, '$abs', function() {
      var self = this;

      return self.$Rational(self.num.$abs(), self.den.$abs());
    });

    Opal.defn(self, '$ceil', function(precision) {
      var self = this;

      if (precision == null) {
        precision = 0
      }
      if (precision['$=='](0)) {
        return (($rb_divide(self.num['$-@'](), self.den))['$-@']()).$ceil()
        } else {
        return self.$with_precision("ceil", precision)
      };
    });

    Opal.alias(self, 'divide', '/');

    Opal.defn(self, '$floor', function(precision) {
      var self = this;

      if (precision == null) {
        precision = 0
      }
      if (precision['$=='](0)) {
        return (($rb_divide(self.num['$-@'](), self.den))['$-@']()).$floor()
        } else {
        return self.$with_precision("floor", precision)
      };
    });

    Opal.defn(self, '$hash', function() {
      var self = this;

      return "Rational:" + (self.num) + ":" + (self.den);
    });

    Opal.defn(self, '$inspect', function() {
      var self = this;

      return "(" + (self.$to_s()) + ")";
    });

    Opal.alias(self, 'quo', '/');

    Opal.defn(self, '$rationalize', function(eps) {
      var self = this;

      
      if (arguments.length > 1) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 0..1)");
      }

      if (eps == null) {
        return self;
      }

      var e = eps.$abs(),
          a = $rb_minus(self, e),
          b = $rb_plus(self, e);

      var p0 = 0,
          p1 = 1,
          q0 = 1,
          q1 = 0,
          p2, q2;

      var c, k, t;

      while (true) {
        c = (a).$ceil();

        if ($rb_le(c, b)) {
          break;
        }

        k  = c - 1;
        p2 = k * p1 + p0;
        q2 = k * q1 + q0;
        t  = $rb_divide(1, ($rb_minus(b, k)));
        b  = $rb_divide(1, ($rb_minus(a, k)));
        a  = t;

        p0 = p1;
        q0 = q1;
        p1 = p2;
        q1 = q2;
      }

      return self.$Rational(c * p1 + p0, c * q1 + q0);
    ;
    });

    Opal.defn(self, '$round', function(precision) {
      var $a, self = this, num = nil, den = nil, approx = nil;

      if (precision == null) {
        precision = 0
      }
      if (precision['$=='](0)) {
        } else {
        return self.$with_precision("round", precision)
      };
      if (self.num['$=='](0)) {
        return 0};
      if (self.den['$=='](1)) {
        return self.num};
      num = $rb_plus($rb_times(self.num.$abs(), 2), self.den);
      den = $rb_times(self.den, 2);
      approx = ($rb_divide(num, den)).$truncate();
      if ((($a = $rb_lt(self.num, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return approx['$-@']()
        } else {
        return approx
      };
    });

    Opal.defn(self, '$to_f', function() {
      var self = this;

      return $rb_divide(self.num, self.den);
    });

    Opal.defn(self, '$to_i', function() {
      var self = this;

      return self.$truncate();
    });

    Opal.defn(self, '$to_r', function() {
      var self = this;

      return self;
    });

    Opal.defn(self, '$to_s', function() {
      var self = this;

      return "" + (self.num) + "/" + (self.den);
    });

    Opal.defn(self, '$truncate', function(precision) {
      var $a, self = this;

      if (precision == null) {
        precision = 0
      }
      if (precision['$=='](0)) {
        if ((($a = $rb_lt(self.num, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self.$ceil()
          } else {
          return self.$floor()
        }
        } else {
        return self.$with_precision("truncate", precision)
      };
    });

    return (Opal.defn(self, '$with_precision', function(method, precision) {
      var $a, self = this, p = nil, s = nil;

      if ((($a = $scope.get('Integer')['$==='](precision)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "not an Integer")
      };
      p = (10)['$**'](precision);
      s = $rb_times(self, p);
      if ((($a = $rb_lt(precision, 1)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return ($rb_divide(s.$send(method), p)).$to_i()
        } else {
        return self.$Rational(s.$send(method), p)
      };
    }), nil) && 'with_precision';
  })($scope.base, $scope.get('Numeric'));
  return (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defn(self, '$Rational', function(numerator, denominator) {
      var self = this;

      if (denominator == null) {
        denominator = 1
      }
      return $scope.get('Rational').$convert(numerator, denominator);
    })
  })($scope.base);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/time"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $range = Opal.range;

  Opal.add_stubs(['$require', '$include', '$===', '$raise', '$coerce_to!', '$respond_to?', '$to_str', '$to_i', '$new', '$<=>', '$to_f', '$nil?', '$>', '$<', '$strftime', '$year', '$month', '$day', '$+', '$round', '$/', '$-', '$copy_instance_variables', '$initialize_dup', '$is_a?', '$zero?', '$wday', '$utc?', '$mon', '$yday', '$hour', '$min', '$sec', '$rjust', '$ljust', '$zone', '$to_s', '$[]', '$cweek_cyear', '$isdst', '$<=', '$!=', '$==', '$ceil']);
  self.$require("corelib/comparable");
  return (function($base, $super) {
    function $Time(){};
    var self = $Time = $klass($base, $super, 'Time', $Time);

    var def = self.$$proto, $scope = self.$$scope;

    self.$include($scope.get('Comparable'));

    
    var days_of_week = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        short_days   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        short_months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        long_months  = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  ;

    Opal.defs(self, '$at', function(seconds, frac) {
      var self = this;

      
      var result;

      if ($scope.get('Time')['$==='](seconds)) {
        if (frac !== undefined) {
          self.$raise($scope.get('TypeError'), "can't convert Time into an exact number")
        }
        result = new Date(seconds.getTime());
        result.is_utc = seconds.is_utc;
        return result;
      }

      if (!seconds.$$is_number) {
        seconds = $scope.get('Opal')['$coerce_to!'](seconds, $scope.get('Integer'), "to_int");
      }

      if (frac === undefined) {
        return new Date(seconds * 1000);
      }

      if (!frac.$$is_number) {
        frac = $scope.get('Opal')['$coerce_to!'](frac, $scope.get('Integer'), "to_int");
      }

      return new Date(seconds * 1000 + (frac / 1000));
    ;
    });

    
    function time_params(year, month, day, hour, min, sec) {
      if (year.$$is_string) {
        year = parseInt(year, 10);
      } else {
        year = $scope.get('Opal')['$coerce_to!'](year, $scope.get('Integer'), "to_int");
      }

      if (month === nil) {
        month = 1;
      } else if (!month.$$is_number) {
        if ((month)['$respond_to?']("to_str")) {
          month = (month).$to_str();
          switch (month.toLowerCase()) {
          case 'jan': month =  1; break;
          case 'feb': month =  2; break;
          case 'mar': month =  3; break;
          case 'apr': month =  4; break;
          case 'may': month =  5; break;
          case 'jun': month =  6; break;
          case 'jul': month =  7; break;
          case 'aug': month =  8; break;
          case 'sep': month =  9; break;
          case 'oct': month = 10; break;
          case 'nov': month = 11; break;
          case 'dec': month = 12; break;
          default: month = (month).$to_i();
          }
        } else {
          month = $scope.get('Opal')['$coerce_to!'](month, $scope.get('Integer'), "to_int");
        }
      }

      if (month < 1 || month > 12) {
        self.$raise($scope.get('ArgumentError'), "month out of range: " + (month))
      }
      month = month - 1;

      if (day === nil) {
        day = 1;
      } else if (day.$$is_string) {
        day = parseInt(day, 10);
      } else {
        day = $scope.get('Opal')['$coerce_to!'](day, $scope.get('Integer'), "to_int");
      }

      if (day < 1 || day > 31) {
        self.$raise($scope.get('ArgumentError'), "day out of range: " + (day))
      }

      if (hour === nil) {
        hour = 0;
      } else if (hour.$$is_string) {
        hour = parseInt(hour, 10);
      } else {
        hour = $scope.get('Opal')['$coerce_to!'](hour, $scope.get('Integer'), "to_int");
      }

      if (hour < 0 || hour > 24) {
        self.$raise($scope.get('ArgumentError'), "hour out of range: " + (hour))
      }

      if (min === nil) {
        min = 0;
      } else if (min.$$is_string) {
        min = parseInt(min, 10);
      } else {
        min = $scope.get('Opal')['$coerce_to!'](min, $scope.get('Integer'), "to_int");
      }

      if (min < 0 || min > 59) {
        self.$raise($scope.get('ArgumentError'), "min out of range: " + (min))
      }

      if (sec === nil) {
        sec = 0;
      } else if (!sec.$$is_number) {
        if (sec.$$is_string) {
          sec = parseInt(sec, 10);
        } else {
          sec = $scope.get('Opal')['$coerce_to!'](sec, $scope.get('Integer'), "to_int");
        }
      }

      if (sec < 0 || sec > 60) {
        self.$raise($scope.get('ArgumentError'), "sec out of range: " + (sec))
      }

      return [year, month, day, hour, min, sec];
    }
  ;

    Opal.defs(self, '$new', function(year, month, day, hour, min, sec, utc_offset) {
      var self = this;

      if (month == null) {
        month = nil
      }
      if (day == null) {
        day = nil
      }
      if (hour == null) {
        hour = nil
      }
      if (min == null) {
        min = nil
      }
      if (sec == null) {
        sec = nil
      }
      if (utc_offset == null) {
        utc_offset = nil
      }
      
      var args, result;

      if (year === undefined) {
        return new Date();
      }

      if (utc_offset !== nil) {
        self.$raise($scope.get('ArgumentError'), "Opal does not support explicitly specifying UTC offset for Time")
      }

      args  = time_params(year, month, day, hour, min, sec);
      year  = args[0];
      month = args[1];
      day   = args[2];
      hour  = args[3];
      min   = args[4];
      sec   = args[5];

      result = new Date(year, month, day, hour, min, 0, sec * 1000);
      if (year < 100) {
        result.setFullYear(year);
      }
      return result;
    
    });

    Opal.defs(self, '$local', function(year, month, day, hour, min, sec, millisecond, _dummy1, _dummy2, _dummy3) {
      var self = this;

      if (month == null) {
        month = nil
      }
      if (day == null) {
        day = nil
      }
      if (hour == null) {
        hour = nil
      }
      if (min == null) {
        min = nil
      }
      if (sec == null) {
        sec = nil
      }
      if (millisecond == null) {
        millisecond = nil
      }
      if (_dummy1 == null) {
        _dummy1 = nil
      }
      if (_dummy2 == null) {
        _dummy2 = nil
      }
      if (_dummy3 == null) {
        _dummy3 = nil
      }
      
      var args, result;

      if (arguments.length === 10) {
        args  = $slice.call(arguments);
        year  = args[5];
        month = args[4];
        day   = args[3];
        hour  = args[2];
        min   = args[1];
        sec   = args[0];
      }

      args  = time_params(year, month, day, hour, min, sec);
      year  = args[0];
      month = args[1];
      day   = args[2];
      hour  = args[3];
      min   = args[4];
      sec   = args[5];

      result = new Date(year, month, day, hour, min, 0, sec * 1000);
      if (year < 100) {
        result.setFullYear(year);
      }
      return result;
    
    });

    Opal.defs(self, '$gm', function(year, month, day, hour, min, sec, millisecond, _dummy1, _dummy2, _dummy3) {
      var self = this;

      if (month == null) {
        month = nil
      }
      if (day == null) {
        day = nil
      }
      if (hour == null) {
        hour = nil
      }
      if (min == null) {
        min = nil
      }
      if (sec == null) {
        sec = nil
      }
      if (millisecond == null) {
        millisecond = nil
      }
      if (_dummy1 == null) {
        _dummy1 = nil
      }
      if (_dummy2 == null) {
        _dummy2 = nil
      }
      if (_dummy3 == null) {
        _dummy3 = nil
      }
      
      var args, result;

      if (arguments.length === 10) {
        args  = $slice.call(arguments);
        year  = args[5];
        month = args[4];
        day   = args[3];
        hour  = args[2];
        min   = args[1];
        sec   = args[0];
      }

      args  = time_params(year, month, day, hour, min, sec);
      year  = args[0];
      month = args[1];
      day   = args[2];
      hour  = args[3];
      min   = args[4];
      sec   = args[5];

      result = new Date(Date.UTC(year, month, day, hour, min, 0, sec * 1000));
      if (year < 100) {
        result.setUTCFullYear(year);
      }
      result.is_utc = true;
      return result;
    
    });

    (function(self) {
      var $scope = self.$$scope, def = self.$$proto;

      Opal.alias(self, 'mktime', 'local');
      return Opal.alias(self, 'utc', 'gm');
    })(Opal.get_singleton_class(self));

    Opal.defs(self, '$now', function() {
      var self = this;

      return self.$new();
    });

    Opal.defn(self, '$+', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Time')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('TypeError'), "time + time?")};
      
      if (!other.$$is_number) {
        other = $scope.get('Opal')['$coerce_to!'](other, $scope.get('Integer'), "to_int");
      }
      var result = new Date(self.getTime() + (other * 1000));
      result.is_utc = self.is_utc;
      return result;
    ;
    });

    Opal.defn(self, '$-', function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Time')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return (self.getTime() - other.getTime()) / 1000};
      
      if (!other.$$is_number) {
        other = $scope.get('Opal')['$coerce_to!'](other, $scope.get('Integer'), "to_int");
      }
      var result = new Date(self.getTime() - (other * 1000));
      result.is_utc = self.is_utc;
      return result;
    ;
    });

    Opal.defn(self, '$<=>', function(other) {
      var $a, self = this, r = nil;

      if ((($a = $scope.get('Time')['$==='](other)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$to_f()['$<=>'](other.$to_f())
        } else {
        r = other['$<=>'](self);
        if ((($a = r['$nil?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
          return nil
        } else if ((($a = $rb_gt(r, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
          return -1
        } else if ((($a = $rb_lt(r, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
          return 1
          } else {
          return 0
        };
      };
    });

    Opal.defn(self, '$==', function(other) {
      var self = this;

      return self.$to_f() === other.$to_f();
    });

    Opal.defn(self, '$asctime', function() {
      var self = this;

      return self.$strftime("%a %b %e %H:%M:%S %Y");
    });

    Opal.alias(self, 'ctime', 'asctime');

    Opal.defn(self, '$day', function() {
      var self = this;

      return self.is_utc ? self.getUTCDate() : self.getDate();
    });

    Opal.defn(self, '$yday', function() {
      var self = this, start_of_year = nil, start_of_day = nil, one_day = nil;

      start_of_year = $scope.get('Time').$new(self.$year()).$to_i();
      start_of_day = $scope.get('Time').$new(self.$year(), self.$month(), self.$day()).$to_i();
      one_day = 86400;
      return $rb_plus(($rb_divide(($rb_minus(start_of_day, start_of_year)), one_day)).$round(), 1);
    });

    Opal.defn(self, '$isdst', function() {
      var self = this;

      
      var jan = new Date(self.getFullYear(), 0, 1),
          jul = new Date(self.getFullYear(), 6, 1);
      return self.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    
    });

    Opal.alias(self, 'dst?', 'isdst');

    Opal.defn(self, '$dup', function() {
      var self = this, copy = nil;

      copy = new Date(self.getTime());
      copy.$copy_instance_variables(self);
      copy.$initialize_dup(self);
      return copy;
    });

    Opal.defn(self, '$eql?', function(other) {
      var $a, self = this;

      return ($a = other['$is_a?']($scope.get('Time')), $a !== false && $a !== nil ?(self['$<=>'](other))['$zero?']() : $a);
    });

    Opal.defn(self, '$friday?', function() {
      var self = this;

      return self.$wday() == 5;
    });

    Opal.defn(self, '$hash', function() {
      var self = this;

      return 'Time:' + self.getTime();
    });

    Opal.defn(self, '$hour', function() {
      var self = this;

      return self.is_utc ? self.getUTCHours() : self.getHours();
    });

    Opal.defn(self, '$inspect', function() {
      var $a, self = this;

      if ((($a = self['$utc?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$strftime("%Y-%m-%d %H:%M:%S UTC")
        } else {
        return self.$strftime("%Y-%m-%d %H:%M:%S %z")
      };
    });

    Opal.alias(self, 'mday', 'day');

    Opal.defn(self, '$min', function() {
      var self = this;

      return self.is_utc ? self.getUTCMinutes() : self.getMinutes();
    });

    Opal.defn(self, '$mon', function() {
      var self = this;

      return (self.is_utc ? self.getUTCMonth() : self.getMonth()) + 1;
    });

    Opal.defn(self, '$monday?', function() {
      var self = this;

      return self.$wday() == 1;
    });

    Opal.alias(self, 'month', 'mon');

    Opal.defn(self, '$saturday?', function() {
      var self = this;

      return self.$wday() == 6;
    });

    Opal.defn(self, '$sec', function() {
      var self = this;

      return self.is_utc ? self.getUTCSeconds() : self.getSeconds();
    });

    Opal.defn(self, '$succ', function() {
      var self = this;

      
      var result = new Date(self.getTime() + 1000);
      result.is_utc = self.is_utc;
      return result;
    
    });

    Opal.defn(self, '$usec', function() {
      var self = this;

      return self.getMilliseconds() * 1000;
    });

    Opal.defn(self, '$zone', function() {
      var self = this;

      
      var string = self.toString(),
          result;

      if (string.indexOf('(') == -1) {
        result = string.match(/[A-Z]{3,4}/)[0];
      }
      else {
        result = string.match(/\([^)]+\)/)[0].match(/[A-Z]/g).join('');
      }

      if (result == "GMT" && /(GMT\W*\d{4})/.test(string)) {
        return RegExp.$1;
      }
      else {
        return result;
      }
    
    });

    Opal.defn(self, '$getgm', function() {
      var self = this;

      
      var result = new Date(self.getTime());
      result.is_utc = true;
      return result;
    
    });

    Opal.alias(self, 'getutc', 'getgm');

    Opal.defn(self, '$gmtime', function() {
      var self = this;

      
      self.is_utc = true;
      return self;
    
    });

    Opal.alias(self, 'utc', 'gmtime');

    Opal.defn(self, '$gmt?', function() {
      var self = this;

      return self.is_utc === true;
    });

    Opal.defn(self, '$gmt_offset', function() {
      var self = this;

      return -self.getTimezoneOffset() * 60;
    });

    Opal.defn(self, '$strftime', function(format) {
      var self = this;

      
      return format.replace(/%([\-_#^0]*:{0,2})(\d+)?([EO]*)(.)/g, function(full, flags, width, _, conv) {
        var result = "",
            zero   = flags.indexOf('0') !== -1,
            pad    = flags.indexOf('-') === -1,
            blank  = flags.indexOf('_') !== -1,
            upcase = flags.indexOf('^') !== -1,
            invert = flags.indexOf('#') !== -1,
            colons = (flags.match(':') || []).length;

        width = parseInt(width, 10);

        if (zero && blank) {
          if (flags.indexOf('0') < flags.indexOf('_')) {
            zero = false;
          }
          else {
            blank = false;
          }
        }

        switch (conv) {
          case 'Y':
            result += self.$year();
            break;

          case 'C':
            zero    = !blank;
            result += Math.round(self.$year() / 100);
            break;

          case 'y':
            zero    = !blank;
            result += (self.$year() % 100);
            break;

          case 'm':
            zero    = !blank;
            result += self.$mon();
            break;

          case 'B':
            result += long_months[self.$mon() - 1];
            break;

          case 'b':
          case 'h':
            blank   = !zero;
            result += short_months[self.$mon() - 1];
            break;

          case 'd':
            zero    = !blank
            result += self.$day();
            break;

          case 'e':
            blank   = !zero
            result += self.$day();
            break;

          case 'j':
            result += self.$yday();
            break;

          case 'H':
            zero    = !blank;
            result += self.$hour();
            break;

          case 'k':
            blank   = !zero;
            result += self.$hour();
            break;

          case 'I':
            zero    = !blank;
            result += (self.$hour() % 12 || 12);
            break;

          case 'l':
            blank   = !zero;
            result += (self.$hour() % 12 || 12);
            break;

          case 'P':
            result += (self.$hour() >= 12 ? "pm" : "am");
            break;

          case 'p':
            result += (self.$hour() >= 12 ? "PM" : "AM");
            break;

          case 'M':
            zero    = !blank;
            result += self.$min();
            break;

          case 'S':
            zero    = !blank;
            result += self.$sec()
            break;

          case 'L':
            zero    = !blank;
            width   = isNaN(width) ? 3 : width;
            result += self.getMilliseconds();
            break;

          case 'N':
            width   = isNaN(width) ? 9 : width;
            result += (self.getMilliseconds().toString()).$rjust(3, "0");
            result  = (result).$ljust(width, "0");
            break;

          case 'z':
            var offset  = self.getTimezoneOffset(),
                hours   = Math.floor(Math.abs(offset) / 60),
                minutes = Math.abs(offset) % 60;

            result += offset < 0 ? "+" : "-";
            result += hours < 10 ? "0" : "";
            result += hours;

            if (colons > 0) {
              result += ":";
            }

            result += minutes < 10 ? "0" : "";
            result += minutes;

            if (colons > 1) {
              result += ":00";
            }

            break;

          case 'Z':
            result += self.$zone();
            break;

          case 'A':
            result += days_of_week[self.$wday()];
            break;

          case 'a':
            result += short_days[self.$wday()];
            break;

          case 'u':
            result += (self.$wday() + 1);
            break;

          case 'w':
            result += self.$wday();
            break;

          case 'V':
            result += self.$cweek_cyear()['$[]'](0).$to_s().$rjust(2, "0");
            break;

          case 'G':
            result += self.$cweek_cyear()['$[]'](1);
            break;

          case 'g':
            result += self.$cweek_cyear()['$[]'](1)['$[]']($range(-2, -1, false));
            break;

          case 's':
            result += self.$to_i();
            break;

          case 'n':
            result += "\n";
            break;

          case 't':
            result += "\t";
            break;

          case '%':
            result += "%";
            break;

          case 'c':
            result += self.$strftime("%a %b %e %T %Y");
            break;

          case 'D':
          case 'x':
            result += self.$strftime("%m/%d/%y");
            break;

          case 'F':
            result += self.$strftime("%Y-%m-%d");
            break;

          case 'v':
            result += self.$strftime("%e-%^b-%4Y");
            break;

          case 'r':
            result += self.$strftime("%I:%M:%S %p");
            break;

          case 'R':
            result += self.$strftime("%H:%M");
            break;

          case 'T':
          case 'X':
            result += self.$strftime("%H:%M:%S");
            break;

          default:
            return full;
        }

        if (upcase) {
          result = result.toUpperCase();
        }

        if (invert) {
          result = result.replace(/[A-Z]/, function(c) { c.toLowerCase() }).
                          replace(/[a-z]/, function(c) { c.toUpperCase() });
        }

        if (pad && (zero || blank)) {
          result = (result).$rjust(isNaN(width) ? 2 : width, blank ? " " : "0");
        }

        return result;
      });
    
    });

    Opal.defn(self, '$sunday?', function() {
      var self = this;

      return self.$wday() == 0;
    });

    Opal.defn(self, '$thursday?', function() {
      var self = this;

      return self.$wday() == 4;
    });

    Opal.defn(self, '$to_a', function() {
      var self = this;

      return [self.$sec(), self.$min(), self.$hour(), self.$day(), self.$month(), self.$year(), self.$wday(), self.$yday(), self.$isdst(), self.$zone()];
    });

    Opal.defn(self, '$to_f', function() {
      var self = this;

      return self.getTime() / 1000;
    });

    Opal.defn(self, '$to_i', function() {
      var self = this;

      return parseInt(self.getTime() / 1000, 10);
    });

    Opal.alias(self, 'to_s', 'inspect');

    Opal.defn(self, '$tuesday?', function() {
      var self = this;

      return self.$wday() == 2;
    });

    Opal.alias(self, 'tv_sec', 'sec');

    Opal.alias(self, 'tv_usec', 'usec');

    Opal.alias(self, 'utc?', 'gmt?');

    Opal.alias(self, 'gmtoff', 'gmt_offset');

    Opal.alias(self, 'utc_offset', 'gmt_offset');

    Opal.defn(self, '$wday', function() {
      var self = this;

      return self.is_utc ? self.getUTCDay() : self.getDay();
    });

    Opal.defn(self, '$wednesday?', function() {
      var self = this;

      return self.$wday() == 3;
    });

    Opal.defn(self, '$year', function() {
      var self = this;

      return self.is_utc ? self.getUTCFullYear() : self.getFullYear();
    });

    return (Opal.defn(self, '$cweek_cyear', function() {
      var $a, $b, self = this, jan01 = nil, jan01_wday = nil, first_monday = nil, year = nil, offset = nil, week = nil, dec31 = nil, dec31_wday = nil;

      jan01 = $scope.get('Time').$new(self.$year(), 1, 1);
      jan01_wday = jan01.$wday();
      first_monday = 0;
      year = self.$year();
      if ((($a = ($b = $rb_le(jan01_wday, 4), $b !== false && $b !== nil ?jan01_wday['$!='](0) : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        offset = $rb_minus(jan01_wday, 1)
        } else {
        offset = $rb_minus($rb_minus(jan01_wday, 7), 1);
        if (offset['$=='](-8)) {
          offset = -1};
      };
      week = ($rb_divide(($rb_plus(self.$yday(), offset)), 7.0)).$ceil();
      if ((($a = $rb_le(week, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Time').$new($rb_minus(self.$year(), 1), 12, 31).$cweek_cyear()
      } else if (week['$=='](53)) {
        dec31 = $scope.get('Time').$new(self.$year(), 12, 31);
        dec31_wday = dec31.$wday();
        if ((($a = ($b = $rb_le(dec31_wday, 3), $b !== false && $b !== nil ?dec31_wday['$!='](0) : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
          week = 1;
          year = $rb_plus(year, 1);};};
      return [week, year];
    }), nil) && 'cweek_cyear';
  })($scope.base, Date);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/struct"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$require', '$include', '$==', '$[]', '$upcase', '$const_set', '$new', '$unshift', '$each', '$define_struct_attribute', '$class_eval', '$to_proc', '$allocate', '$initialize', '$raise', '$<<', '$members', '$define_method', '$instance_eval', '$each_with_index', '$[]=', '$class', '$hash', '$===', '$<', '$-@', '$size', '$>=', '$coerce_to!', '$include?', '$to_sym', '$instance_of?', '$__id__', '$eql?', '$enum_for', '$length', '$map', '$+', '$join', '$inspect', '$each_pair', '$inject', '$flatten', '$to_a']);
  self.$require("corelib/enumerable");
  return (function($base, $super) {
    function $Struct(){};
    var self = $Struct = $klass($base, $super, 'Struct', $Struct);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_8, TMP_11;

    self.$include($scope.get('Enumerable'));

    Opal.defs(self, '$new', TMP_1 = function(name) {
      var $a, $b, $c, TMP_2, self = this, $iter = TMP_1.$$p, block = $iter || nil, $splat_index = nil, $zuper = nil, $zuper_index = nil;

      var array_size = arguments.length - 1;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 1];
      }
      TMP_1.$$p = null;
      $zuper = [];
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if (self['$==']($scope.get('Struct'))) {
        } else {
        return Opal.find_super_dispatcher(self, 'new', TMP_1, $iter, $Struct).apply(self, $zuper)
      };
      if (name['$[]'](0)['$=='](name['$[]'](0).$upcase())) {
        return $scope.get('Struct').$const_set(name, ($a = self).$new.apply($a, Opal.to_a(args)))
        } else {
        args.$unshift(name);
        return ($b = ($c = $scope.get('Class')).$new, $b.$$p = (TMP_2 = function(){var self = TMP_2.$$s || this, $a, $b, TMP_3, $c;

        ($a = ($b = args).$each, $a.$$p = (TMP_3 = function(arg){var self = TMP_3.$$s || this;
if (arg == null) arg = nil;
          return self.$define_struct_attribute(arg)}, TMP_3.$$s = self, TMP_3), $a).call($b);
          if (block !== false && block !== nil) {
            ($a = ($c = self).$class_eval, $a.$$p = block.$to_proc(), $a).call($c)};
          return (function(self) {
            var $scope = self.$$scope, def = self.$$proto;

            Opal.defn(self, '$new', function() {
              var $a, self = this, instance = nil, $splat_index = nil;

              var array_size = arguments.length - 0;
              if(array_size < 0) array_size = 0;
              var args = new Array(array_size);
              for($splat_index = 0; $splat_index < array_size; $splat_index++) {
                args[$splat_index] = arguments[$splat_index + 0];
              }
              instance = self.$allocate();
              instance.$$data = {};;
              ($a = instance).$initialize.apply($a, Opal.to_a(args));
              return instance;
            });
            return Opal.alias(self, '[]', 'new');
          })(Opal.get_singleton_class(self));}, TMP_2.$$s = self, TMP_2), $b).call($c, self);
      };
    });

    Opal.defs(self, '$define_struct_attribute', function(name) {
      var $a, $b, TMP_4, $c, TMP_5, self = this;

      if (self['$==']($scope.get('Struct'))) {
        self.$raise($scope.get('ArgumentError'), "you cannot define attributes to the Struct class")};
      self.$members()['$<<'](name);
      ($a = ($b = self).$define_method, $a.$$p = (TMP_4 = function(){var self = TMP_4.$$s || this;

      return self.$$data[name];}, TMP_4.$$s = self, TMP_4), $a).call($b, name);
      return ($a = ($c = self).$define_method, $a.$$p = (TMP_5 = function(value){var self = TMP_5.$$s || this;
if (value == null) value = nil;
      return self.$$data[name] = value;}, TMP_5.$$s = self, TMP_5), $a).call($c, "" + (name) + "=");
    });

    Opal.defs(self, '$members', function() {
      var $a, self = this;
      if (self.members == null) self.members = nil;

      if (self['$==']($scope.get('Struct'))) {
        self.$raise($scope.get('ArgumentError'), "the Struct class has no members")};
      return ((($a = self.members) !== false && $a !== nil) ? $a : self.members = []);
    });

    Opal.defs(self, '$inherited', function(klass) {
      var $a, $b, TMP_6, self = this, members = nil;
      if (self.members == null) self.members = nil;

      members = self.members;
      return ($a = ($b = klass).$instance_eval, $a.$$p = (TMP_6 = function(){var self = TMP_6.$$s || this;

      return self.members = members}, TMP_6.$$s = self, TMP_6), $a).call($b);
    });

    Opal.defn(self, '$initialize', function() {
      var $a, $b, TMP_7, self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      return ($a = ($b = self.$members()).$each_with_index, $a.$$p = (TMP_7 = function(name, index){var self = TMP_7.$$s || this;
if (name == null) name = nil;if (index == null) index = nil;
      return self['$[]='](name, args['$[]'](index))}, TMP_7.$$s = self, TMP_7), $a).call($b);
    });

    Opal.defn(self, '$members', function() {
      var self = this;

      return self.$class().$members();
    });

    Opal.defn(self, '$hash', function() {
      var self = this;

      return $scope.get('Hash').$new(self.$$data).$hash();
    });

    Opal.defn(self, '$[]', function(name) {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](name)) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $rb_lt(name, self.$members().$size()['$-@']())) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('IndexError'), "offset " + (name) + " too small for struct(size:" + (self.$members().$size()) + ")")};
        if ((($a = $rb_ge(name, self.$members().$size())) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('IndexError'), "offset " + (name) + " too large for struct(size:" + (self.$members().$size()) + ")")};
        name = self.$members()['$[]'](name);
      } else if ((($a = $scope.get('String')['$==='](name)) !== nil && (!$a.$$is_boolean || $a == true))) {
        
        if(!self.$$data.hasOwnProperty(name)) {
          self.$raise($scope.get('NameError').$new("no member '" + (name) + "' in struct", name))
        }
      ;
        } else {
        self.$raise($scope.get('TypeError'), "no implicit conversion of " + (name.$class()) + " into Integer")
      };
      name = $scope.get('Opal')['$coerce_to!'](name, $scope.get('String'), "to_str");
      return self.$$data[name];
    });

    Opal.defn(self, '$[]=', function(name, value) {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](name)) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $rb_lt(name, self.$members().$size()['$-@']())) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('IndexError'), "offset " + (name) + " too small for struct(size:" + (self.$members().$size()) + ")")};
        if ((($a = $rb_ge(name, self.$members().$size())) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('IndexError'), "offset " + (name) + " too large for struct(size:" + (self.$members().$size()) + ")")};
        name = self.$members()['$[]'](name);
      } else if ((($a = $scope.get('String')['$==='](name)) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = self.$members()['$include?'](name.$to_sym())) !== nil && (!$a.$$is_boolean || $a == true))) {
          } else {
          self.$raise($scope.get('NameError').$new("no member '" + (name) + "' in struct", name))
        }
        } else {
        self.$raise($scope.get('TypeError'), "no implicit conversion of " + (name.$class()) + " into Integer")
      };
      name = $scope.get('Opal')['$coerce_to!'](name, $scope.get('String'), "to_str");
      return self.$$data[name] = value;
    });

    Opal.defn(self, '$==', function(other) {
      var $a, self = this;

      if ((($a = other['$instance_of?'](self.$class())) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      
      var recursed1 = {}, recursed2 = {};

      function _eqeq(struct, other) {
        var key, a, b;

        recursed1[(struct).$__id__()] = true;
        recursed2[(other).$__id__()] = true;

        for (key in struct.$$data) {
          a = struct.$$data[key];
          b = other.$$data[key];

          if ($scope.get('Struct')['$==='](a)) {
            if (!recursed1.hasOwnProperty((a).$__id__()) || !recursed2.hasOwnProperty((b).$__id__())) {
              if (!_eqeq(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$=='](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eqeq(self, other);
    ;
    });

    Opal.defn(self, '$eql?', function(other) {
      var $a, self = this;

      if ((($a = other['$instance_of?'](self.$class())) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      
      var recursed1 = {}, recursed2 = {};

      function _eqeq(struct, other) {
        var key, a, b;

        recursed1[(struct).$__id__()] = true;
        recursed2[(other).$__id__()] = true;

        for (key in struct.$$data) {
          a = struct.$$data[key];
          b = other.$$data[key];

          if ($scope.get('Struct')['$==='](a)) {
            if (!recursed1.hasOwnProperty((a).$__id__()) || !recursed2.hasOwnProperty((b).$__id__())) {
              if (!_eqeq(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$eql?'](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eqeq(self, other);
    ;
    });

    Opal.defn(self, '$each', TMP_8 = function() {
      var $a, $b, TMP_9, $c, TMP_10, self = this, $iter = TMP_8.$$p, $yield = $iter || nil;

      TMP_8.$$p = null;
      if (($yield !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_9 = function(){var self = TMP_9.$$s || this;

        return self.$size()}, TMP_9.$$s = self, TMP_9), $a).call($b, "each")
      };
      ($a = ($c = self.$members()).$each, $a.$$p = (TMP_10 = function(name){var self = TMP_10.$$s || this, $a;
if (name == null) name = nil;
      return $a = Opal.yield1($yield, self['$[]'](name)), $a === $breaker ? $a : $a}, TMP_10.$$s = self, TMP_10), $a).call($c);
      return self;
    });

    Opal.defn(self, '$each_pair', TMP_11 = function() {
      var $a, $b, TMP_12, $c, TMP_13, self = this, $iter = TMP_11.$$p, $yield = $iter || nil;

      TMP_11.$$p = null;
      if (($yield !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_12 = function(){var self = TMP_12.$$s || this;

        return self.$size()}, TMP_12.$$s = self, TMP_12), $a).call($b, "each_pair")
      };
      ($a = ($c = self.$members()).$each, $a.$$p = (TMP_13 = function(name){var self = TMP_13.$$s || this, $a;
if (name == null) name = nil;
      return $a = Opal.yield1($yield, [name, self['$[]'](name)]), $a === $breaker ? $a : $a}, TMP_13.$$s = self, TMP_13), $a).call($c);
      return self;
    });

    Opal.defn(self, '$length', function() {
      var self = this;

      return self.$members().$length();
    });

    Opal.alias(self, 'size', 'length');

    Opal.defn(self, '$to_a', function() {
      var $a, $b, TMP_14, self = this;

      return ($a = ($b = self.$members()).$map, $a.$$p = (TMP_14 = function(name){var self = TMP_14.$$s || this;
if (name == null) name = nil;
      return self['$[]'](name)}, TMP_14.$$s = self, TMP_14), $a).call($b);
    });

    Opal.alias(self, 'values', 'to_a');

    Opal.defn(self, '$inspect', function() {
      var $a, $b, TMP_15, self = this, result = nil;

      result = "#<struct ";
      if (self.$class()['$==']($scope.get('Struct'))) {
        result = $rb_plus(result, "" + (self.$class()) + " ")};
      result = $rb_plus(result, ($a = ($b = self.$each_pair()).$map, $a.$$p = (TMP_15 = function(name, value){var self = TMP_15.$$s || this;
if (name == null) name = nil;if (value == null) value = nil;
      return "" + (name) + "=" + (value.$inspect())}, TMP_15.$$s = self, TMP_15), $a).call($b).$join(", "));
      result = $rb_plus(result, ">");
      return result;
    });

    Opal.alias(self, 'to_s', 'inspect');

    Opal.defn(self, '$to_h', function() {
      var $a, $b, TMP_16, self = this;

      return ($a = ($b = self.$members()).$inject, $a.$$p = (TMP_16 = function(h, name){var self = TMP_16.$$s || this;
if (h == null) h = nil;if (name == null) name = nil;
      h['$[]='](name, self['$[]'](name));
        return h;}, TMP_16.$$s = self, TMP_16), $a).call($b, $hash2([], {}));
    });

    return (Opal.defn(self, '$values_at', function() {
      var $a, $b, TMP_17, self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      args = ($a = ($b = args).$map, $a.$$p = (TMP_17 = function(arg){var self = TMP_17.$$s || this;
if (arg == null) arg = nil;
      return arg.$$is_range ? arg.$to_a() : arg;}, TMP_17.$$s = self, TMP_17), $a).call($b).$flatten();
      
      var result = [];
      for (var i = 0, len = args.length; i < len; i++) {
        if (!args[i].$$is_number) {
          self.$raise($scope.get('TypeError'), "no implicit conversion of " + ((args[i]).$class()) + " into Integer")
        }
        result.push(self['$[]'](args[i]));
      }
      return result;
    ;
    }), nil) && 'values_at';
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/io"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var $a, $b, self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module, $gvars = Opal.gvars;

  Opal.add_stubs(['$attr_accessor', '$size', '$write', '$join', '$map', '$String', '$empty?', '$concat', '$chomp', '$getbyte', '$getc', '$raise', '$new', '$write_proc=', '$extend']);
  (function($base, $super) {
    function $IO(){};
    var self = $IO = $klass($base, $super, 'IO', $IO);

    var def = self.$$proto, $scope = self.$$scope;

    def.tty = def.closed = nil;
    Opal.cdecl($scope, 'SEEK_SET', 0);

    Opal.cdecl($scope, 'SEEK_CUR', 1);

    Opal.cdecl($scope, 'SEEK_END', 2);

    Opal.defn(self, '$tty?', function() {
      var self = this;

      return self.tty;
    });

    Opal.defn(self, '$closed?', function() {
      var self = this;

      return self.closed;
    });

    self.$attr_accessor("write_proc");

    Opal.defn(self, '$write', function(string) {
      var self = this;

      self.write_proc(string);
      return string.$size();
    });

    self.$attr_accessor("sync", "tty");

    Opal.defn(self, '$flush', function() {
      var self = this;

      return nil;
    });

    (function($base) {
      var $Writable, self = $Writable = $module($base, 'Writable');

      var def = self.$$proto, $scope = self.$$scope;

      Opal.defn(self, '$<<', function(string) {
        var self = this;

        self.$write(string);
        return self;
      });

      Opal.defn(self, '$print', function() {
        var $a, $b, TMP_1, self = this, $splat_index = nil;
        if ($gvars[","] == null) $gvars[","] = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var args = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          args[$splat_index] = arguments[$splat_index + 0];
        }
        self.$write(($a = ($b = args).$map, $a.$$p = (TMP_1 = function(arg){var self = TMP_1.$$s || this;
if (arg == null) arg = nil;
        return self.$String(arg)}, TMP_1.$$s = self, TMP_1), $a).call($b).$join($gvars[","]));
        return nil;
      });

      Opal.defn(self, '$puts', function() {
        var $a, $b, TMP_2, self = this, newline = nil, $splat_index = nil;
        if ($gvars["/"] == null) $gvars["/"] = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var args = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          args[$splat_index] = arguments[$splat_index + 0];
        }
        newline = $gvars["/"];
        if ((($a = args['$empty?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$write($gvars["/"])
          } else {
          self.$write(($a = ($b = args).$map, $a.$$p = (TMP_2 = function(arg){var self = TMP_2.$$s || this;
if (arg == null) arg = nil;
          return self.$String(arg).$chomp()}, TMP_2.$$s = self, TMP_2), $a).call($b).$concat([nil]).$join(newline))
        };
        return nil;
      });
    })($scope.base);

    return (function($base) {
      var $Readable, self = $Readable = $module($base, 'Readable');

      var def = self.$$proto, $scope = self.$$scope;

      Opal.defn(self, '$readbyte', function() {
        var self = this;

        return self.$getbyte();
      });

      Opal.defn(self, '$readchar', function() {
        var self = this;

        return self.$getc();
      });

      Opal.defn(self, '$readline', function(sep) {
        var self = this;
        if ($gvars["/"] == null) $gvars["/"] = nil;

        if (sep == null) {
          sep = $gvars["/"]
        }
        return self.$raise($scope.get('NotImplementedError'));
      });

      Opal.defn(self, '$readpartial', function(integer, outbuf) {
        var self = this;

        if (outbuf == null) {
          outbuf = nil
        }
        return self.$raise($scope.get('NotImplementedError'));
      });
    })($scope.base);
  })($scope.base, null);
  Opal.cdecl($scope, 'STDERR', $gvars.stderr = $scope.get('IO').$new());
  Opal.cdecl($scope, 'STDIN', $gvars.stdin = $scope.get('IO').$new());
  Opal.cdecl($scope, 'STDOUT', $gvars.stdout = $scope.get('IO').$new());
  (($a = [typeof(process) === 'object' ? function(s){process.stdout.write(s)} : function(s){console.log(s)}]), $b = $scope.get('STDOUT'), $b['$write_proc='].apply($b, $a), $a[$a.length-1]);
  (($a = [typeof(process) === 'object' ? function(s){process.stderr.write(s)} : function(s){console.warn(s)}]), $b = $scope.get('STDERR'), $b['$write_proc='].apply($b, $a), $a[$a.length-1]);
  $scope.get('STDOUT').$extend((($scope.get('IO')).$$scope.get('Writable')));
  return $scope.get('STDERR').$extend((($scope.get('IO')).$$scope.get('Writable')));
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/main"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$include']);
  Opal.defs(self, '$to_s', function() {
    var self = this;

    return "main";
  });
  return (Opal.defs(self, '$include', function(mod) {
    var self = this;

    return $scope.get('Object').$include(mod);
  }), nil) && 'include';
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/dir"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$[]']);
  return (function($base, $super) {
    function $Dir(){};
    var self = $Dir = $klass($base, $super, 'Dir', $Dir);

    var def = self.$$proto, $scope = self.$$scope;

    return (function(self) {
      var $scope = self.$$scope, def = self.$$proto, TMP_1;

      Opal.defn(self, '$chdir', TMP_1 = function(dir) {
        var $a, self = this, $iter = TMP_1.$$p, $yield = $iter || nil, prev_cwd = nil;

        TMP_1.$$p = null;
        try {
        prev_cwd = Opal.current_dir;
        Opal.current_dir = dir;
        return $a = Opal.yieldX($yield, []), $a === $breaker ? $a : $a;
        } finally {
        Opal.current_dir = prev_cwd;
        };
      });
      Opal.defn(self, '$pwd', function() {
        var self = this;

        return Opal.current_dir || '.';
      });
      Opal.alias(self, 'getwd', 'pwd');
      return (Opal.defn(self, '$home', function() {
        var $a, self = this;

        return ((($a = $scope.get('ENV')['$[]']("HOME")) !== false && $a !== nil) ? $a : ".");
      }), nil) && 'home';
    })(Opal.get_singleton_class(self))
  })($scope.base, null)
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/file"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $range = Opal.range;

  Opal.add_stubs(['$join', '$compact', '$split', '$==', '$first', '$[]=', '$home', '$each', '$pop', '$<<', '$[]', '$gsub', '$find', '$=~']);
  return (function($base, $super) {
    function $File(){};
    var self = $File = $klass($base, $super, 'File', $File);

    var def = self.$$proto, $scope = self.$$scope;

    Opal.cdecl($scope, 'Separator', Opal.cdecl($scope, 'SEPARATOR', "/"));

    Opal.cdecl($scope, 'ALT_SEPARATOR', nil);

    Opal.cdecl($scope, 'PATH_SEPARATOR', ":");

    return (function(self) {
      var $scope = self.$$scope, def = self.$$proto;

      Opal.defn(self, '$expand_path', function(path, basedir) {
        var $a, $b, TMP_1, self = this, parts = nil, new_parts = nil;

        if (basedir == null) {
          basedir = nil
        }
        path = [basedir, path].$compact().$join($scope.get('SEPARATOR'));
        parts = path.$split($scope.get('SEPARATOR'));
        new_parts = [];
        if (parts.$first()['$==']("~")) {
          parts['$[]='](0, $scope.get('Dir').$home())};
        ($a = ($b = parts).$each, $a.$$p = (TMP_1 = function(part){var self = TMP_1.$$s || this;
if (part == null) part = nil;
        if (part['$==']("..")) {
            return new_parts.$pop()
            } else {
            return new_parts['$<<'](part)
          }}, TMP_1.$$s = self, TMP_1), $a).call($b);
        return new_parts.$join($scope.get('SEPARATOR'));
      });
      Opal.alias(self, 'realpath', 'expand_path');
      Opal.defn(self, '$dirname', function(path) {
        var self = this;

        return self.$split(path)['$[]']($range(0, -2, false));
      });
      Opal.defn(self, '$basename', function(path) {
        var self = this;

        return self.$split(path)['$[]'](-1);
      });
      Opal.defn(self, '$exist?', function(path) {
        var self = this;

        return Opal.modules[path] != null;
      });
      Opal.alias(self, 'exists?', 'exist?');
      Opal.defn(self, '$directory?', function(path) {
        var $a, $b, TMP_2, self = this, files = nil, file = nil;

        files = [];
        
        for (var key in Opal.modules) {
          files.push(key)
        }
      ;
        path = path.$gsub((new RegExp("(^." + $scope.get('SEPARATOR') + "+|" + $scope.get('SEPARATOR') + "+$)")));
        file = ($a = ($b = files).$find, $a.$$p = (TMP_2 = function(file){var self = TMP_2.$$s || this;
if (file == null) file = nil;
        return file['$=~']((new RegExp("^" + path)))}, TMP_2.$$s = self, TMP_2), $a).call($b);
        return file;
      });
      Opal.defn(self, '$join', function() {
        var self = this, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var paths = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          paths[$splat_index] = arguments[$splat_index + 0];
        }
        return paths.$join($scope.get('SEPARATOR')).$gsub((new RegExp("" + $scope.get('SEPARATOR') + "+")), $scope.get('SEPARATOR'));
      });
      return (Opal.defn(self, '$split', function(path) {
        var self = this;

        return path.$split($scope.get('SEPARATOR'));
      }), nil) && 'split';
    })(Opal.get_singleton_class(self));
  })($scope.base, $scope.get('IO'))
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/process"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$to_f', '$now', '$new']);
  (function($base, $super) {
    function $Process(){};
    var self = $Process = $klass($base, $super, 'Process', $Process);

    var def = self.$$proto, $scope = self.$$scope;

    Opal.cdecl($scope, 'CLOCK_REALTIME', 0);

    Opal.cdecl($scope, 'CLOCK_MONOTONIC', 1);

    Opal.defs(self, '$pid', function() {
      var self = this;

      return 0;
    });

    Opal.defs(self, '$times', function() {
      var self = this, t = nil;

      t = $scope.get('Time').$now().$to_f();
      return (($scope.get('Benchmark')).$$scope.get('Tms')).$new(t, t, t, t, t);
    });

    return (Opal.defs(self, '$clock_gettime', function(clock_id, unit) {
      var self = this;

      if (unit == null) {
        unit = nil
      }
      return $scope.get('Time').$now().$to_f();
    }), nil) && 'clock_gettime';
  })($scope.base, null);
  (function($base, $super) {
    function $Signal(){};
    var self = $Signal = $klass($base, $super, 'Signal', $Signal);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defs(self, '$trap', function() {
      var self = this;

      return nil;
    }), nil) && 'trap'
  })($scope.base, null);
  return (function($base, $super) {
    function $GC(){};
    var self = $GC = $klass($base, $super, 'GC', $GC);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defs(self, '$start', function() {
      var self = this;

      return nil;
    }), nil) && 'start'
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["corelib/unsupported"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module;

  Opal.add_stubs(['$warn', '$raise', '$%', '$module_function']);
  
  var warnings = {};

  function warn(string) {
    if (warnings[string]) {
      return;
    }

    warnings[string] = true;
    self.$warn(string);
  }

  (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope;

    var ERROR = "String#%s not supported. Mutable String methods are not supported in Opal.";

    Opal.defn(self, '$<<', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("<<"));
    });

    Opal.defn(self, '$capitalize!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("capitalize!"));
    });

    Opal.defn(self, '$chomp!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("chomp!"));
    });

    Opal.defn(self, '$chop!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("chop!"));
    });

    Opal.defn(self, '$downcase!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("downcase!"));
    });

    Opal.defn(self, '$gsub!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("gsub!"));
    });

    Opal.defn(self, '$lstrip!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("lstrip!"));
    });

    Opal.defn(self, '$next!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("next!"));
    });

    Opal.defn(self, '$reverse!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("reverse!"));
    });

    Opal.defn(self, '$slice!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("slice!"));
    });

    Opal.defn(self, '$squeeze!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("squeeze!"));
    });

    Opal.defn(self, '$strip!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("strip!"));
    });

    Opal.defn(self, '$sub!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("sub!"));
    });

    Opal.defn(self, '$succ!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("succ!"));
    });

    Opal.defn(self, '$swapcase!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("swapcase!"));
    });

    Opal.defn(self, '$tr!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("tr!"));
    });

    Opal.defn(self, '$tr_s!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("tr_s!"));
    });

    return (Opal.defn(self, '$upcase!', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("upcase!"));
    }), nil) && 'upcase!';
  })($scope.base, null);
  (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope;

    var ERROR = "Object freezing is not supported by Opal";

    Opal.defn(self, '$freeze', function() {
      var $a, self = this;

      if ((($a = OPAL_CONFIG.freezing) !== nil && (!$a.$$is_boolean || $a == true))) {
        warn(ERROR);
        } else {
        self.$raise($scope.get('NotImplementedError'), ERROR)
      };
      return self;
    });

    Opal.defn(self, '$frozen?', function() {
      var $a, self = this;

      if ((($a = OPAL_CONFIG.freezing) !== nil && (!$a.$$is_boolean || $a == true))) {
        warn(ERROR);
        } else {
        self.$raise($scope.get('NotImplementedError'), ERROR)
      };
      return false;
    });
  })($scope.base);
  (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope;

    var ERROR = "Object tainting is not supported by Opal";

    Opal.defn(self, '$taint', function() {
      var $a, self = this;

      if ((($a = OPAL_CONFIG.tainting) !== nil && (!$a.$$is_boolean || $a == true))) {
        warn(ERROR);
        } else {
        self.$raise($scope.get('NotImplementedError'), ERROR)
      };
      return self;
    });

    Opal.defn(self, '$untaint', function() {
      var $a, self = this;

      if ((($a = OPAL_CONFIG.tainting) !== nil && (!$a.$$is_boolean || $a == true))) {
        warn(ERROR);
        } else {
        self.$raise($scope.get('NotImplementedError'), ERROR)
      };
      return self;
    });

    Opal.defn(self, '$tainted?', function() {
      var $a, self = this;

      if ((($a = OPAL_CONFIG.tainting) !== nil && (!$a.$$is_boolean || $a == true))) {
        warn(ERROR);
        } else {
        self.$raise($scope.get('NotImplementedError'), ERROR)
      };
      return false;
    });
  })($scope.base);
  (function($base) {
    var $Marshal, self = $Marshal = $module($base, 'Marshal');

    var def = self.$$proto, $scope = self.$$scope;

    var ERROR = "Marshalling is not supported by Opal";

    self.$module_function();

    Opal.defn(self, '$dump', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), ERROR);
    });

    Opal.defn(self, '$load', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), ERROR);
    });

    Opal.defn(self, '$restore', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), ERROR);
    });
  })($scope.base);
  (function($base, $super) {
    function $Module(){};
    var self = $Module = $klass($base, $super, 'Module', $Module);

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defn(self, '$public', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var methods = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        methods[$splat_index] = arguments[$splat_index + 0];
      }
      
      if (methods.length === 0) {
        self.$$module_function = false;
      }

      return nil;
    
    });

    Opal.alias(self, 'private', 'public');

    Opal.alias(self, 'protected', 'public');

    Opal.alias(self, 'nesting', 'public');

    Opal.defn(self, '$private_class_method', function() {
      var self = this;

      return self;
    });

    Opal.alias(self, 'public_class_method', 'private_class_method');

    Opal.defn(self, '$private_method_defined?', function(obj) {
      var self = this;

      return false;
    });

    Opal.defn(self, '$private_constant', function() {
      var self = this;

      return nil;
    });

    Opal.alias(self, 'protected_method_defined?', 'private_method_defined?');

    Opal.alias(self, 'public_instance_methods', 'instance_methods');

    return Opal.alias(self, 'public_method_defined?', 'method_defined?');
  })($scope.base, null);
  (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defn(self, '$private_methods', function() {
      var self = this;

      return [];
    });

    Opal.alias(self, 'private_instance_methods', 'private_methods');
  })($scope.base);
  return (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defn(self, '$eval', function() {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), "To use Kernel#eval, you must first require 'opal-parser'. " + ("See https://github.com/opal/opal/blob/" + ($scope.get('RUBY_ENGINE_VERSION')) + "/docs/opal_parser.md for details."));
    })
  })($scope.base);
};

/* Generated by Opal 0.9.2 */
(function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require']);
  self.$require("opal/base");
  self.$require("opal/mini");
  self.$require("corelib/array/inheritance");
  self.$require("corelib/string/inheritance");
  self.$require("corelib/string/encoding");
  self.$require("corelib/math");
  self.$require("corelib/complex");
  self.$require("corelib/rational");
  self.$require("corelib/time");
  self.$require("corelib/struct");
  self.$require("corelib/io");
  self.$require("corelib/main");
  self.$require("corelib/dir");
  self.$require("corelib/file");
  self.$require("corelib/process");
  return self.$require("corelib/unsupported");
})(Opal);

/*! jQuery v2.1.1 | (c) 2005, 2014 jQuery Foundation, Inc. | jquery.org/license */
!function(a,b){"object"==typeof module&&"object"==typeof module.exports?module.exports=a.document?b(a,!0):function(a){if(!a.document)throw new Error("jQuery requires a window with a document");return b(a)}:b(a)}("undefined"!=typeof window?window:this,function(a,b){var c=[],d=c.slice,e=c.concat,f=c.push,g=c.indexOf,h={},i=h.toString,j=h.hasOwnProperty,k={},l=a.document,m="2.1.1",n=function(a,b){return new n.fn.init(a,b)},o=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,p=/^-ms-/,q=/-([\da-z])/gi,r=function(a,b){return b.toUpperCase()};n.fn=n.prototype={jquery:m,constructor:n,selector:"",length:0,toArray:function(){return d.call(this)},get:function(a){return null!=a?0>a?this[a+this.length]:this[a]:d.call(this)},pushStack:function(a){var b=n.merge(this.constructor(),a);return b.prevObject=this,b.context=this.context,b},each:function(a,b){return n.each(this,a,b)},map:function(a){return this.pushStack(n.map(this,function(b,c){return a.call(b,c,b)}))},slice:function(){return this.pushStack(d.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(a){var b=this.length,c=+a+(0>a?b:0);return this.pushStack(c>=0&&b>c?[this[c]]:[])},end:function(){return this.prevObject||this.constructor(null)},push:f,sort:c.sort,splice:c.splice},n.extend=n.fn.extend=function(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=!1;for("boolean"==typeof g&&(j=g,g=arguments[h]||{},h++),"object"==typeof g||n.isFunction(g)||(g={}),h===i&&(g=this,h--);i>h;h++)if(null!=(a=arguments[h]))for(b in a)c=g[b],d=a[b],g!==d&&(j&&d&&(n.isPlainObject(d)||(e=n.isArray(d)))?(e?(e=!1,f=c&&n.isArray(c)?c:[]):f=c&&n.isPlainObject(c)?c:{},g[b]=n.extend(j,f,d)):void 0!==d&&(g[b]=d));return g},n.extend({expando:"jQuery"+(m+Math.random()).replace(/\D/g,""),isReady:!0,error:function(a){throw new Error(a)},noop:function(){},isFunction:function(a){return"function"===n.type(a)},isArray:Array.isArray,isWindow:function(a){return null!=a&&a===a.window},isNumeric:function(a){return!n.isArray(a)&&a-parseFloat(a)>=0},isPlainObject:function(a){return"object"!==n.type(a)||a.nodeType||n.isWindow(a)?!1:a.constructor&&!j.call(a.constructor.prototype,"isPrototypeOf")?!1:!0},isEmptyObject:function(a){var b;for(b in a)return!1;return!0},type:function(a){return null==a?a+"":"object"==typeof a||"function"==typeof a?h[i.call(a)]||"object":typeof a},globalEval:function(a){var b,c=eval;a=n.trim(a),a&&(1===a.indexOf("use strict")?(b=l.createElement("script"),b.text=a,l.head.appendChild(b).parentNode.removeChild(b)):c(a))},camelCase:function(a){return a.replace(p,"ms-").replace(q,r)},nodeName:function(a,b){return a.nodeName&&a.nodeName.toLowerCase()===b.toLowerCase()},each:function(a,b,c){var d,e=0,f=a.length,g=s(a);if(c){if(g){for(;f>e;e++)if(d=b.apply(a[e],c),d===!1)break}else for(e in a)if(d=b.apply(a[e],c),d===!1)break}else if(g){for(;f>e;e++)if(d=b.call(a[e],e,a[e]),d===!1)break}else for(e in a)if(d=b.call(a[e],e,a[e]),d===!1)break;return a},trim:function(a){return null==a?"":(a+"").replace(o,"")},makeArray:function(a,b){var c=b||[];return null!=a&&(s(Object(a))?n.merge(c,"string"==typeof a?[a]:a):f.call(c,a)),c},inArray:function(a,b,c){return null==b?-1:g.call(b,a,c)},merge:function(a,b){for(var c=+b.length,d=0,e=a.length;c>d;d++)a[e++]=b[d];return a.length=e,a},grep:function(a,b,c){for(var d,e=[],f=0,g=a.length,h=!c;g>f;f++)d=!b(a[f],f),d!==h&&e.push(a[f]);return e},map:function(a,b,c){var d,f=0,g=a.length,h=s(a),i=[];if(h)for(;g>f;f++)d=b(a[f],f,c),null!=d&&i.push(d);else for(f in a)d=b(a[f],f,c),null!=d&&i.push(d);return e.apply([],i)},guid:1,proxy:function(a,b){var c,e,f;return"string"==typeof b&&(c=a[b],b=a,a=c),n.isFunction(a)?(e=d.call(arguments,2),f=function(){return a.apply(b||this,e.concat(d.call(arguments)))},f.guid=a.guid=a.guid||n.guid++,f):void 0},now:Date.now,support:k}),n.each("Boolean Number String Function Array Date RegExp Object Error".split(" "),function(a,b){h["[object "+b+"]"]=b.toLowerCase()});function s(a){var b=a.length,c=n.type(a);return"function"===c||n.isWindow(a)?!1:1===a.nodeType&&b?!0:"array"===c||0===b||"number"==typeof b&&b>0&&b-1 in a}var t=function(a){var b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u="sizzle"+-new Date,v=a.document,w=0,x=0,y=gb(),z=gb(),A=gb(),B=function(a,b){return a===b&&(l=!0),0},C="undefined",D=1<<31,E={}.hasOwnProperty,F=[],G=F.pop,H=F.push,I=F.push,J=F.slice,K=F.indexOf||function(a){for(var b=0,c=this.length;c>b;b++)if(this[b]===a)return b;return-1},L="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",M="[\\x20\\t\\r\\n\\f]",N="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",O=N.replace("w","w#"),P="\\["+M+"*("+N+")(?:"+M+"*([*^$|!~]?=)"+M+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+O+"))|)"+M+"*\\]",Q=":("+N+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+P+")*)|.*)\\)|)",R=new RegExp("^"+M+"+|((?:^|[^\\\\])(?:\\\\.)*)"+M+"+$","g"),S=new RegExp("^"+M+"*,"+M+"*"),T=new RegExp("^"+M+"*([>+~]|"+M+")"+M+"*"),U=new RegExp("="+M+"*([^\\]'\"]*?)"+M+"*\\]","g"),V=new RegExp(Q),W=new RegExp("^"+O+"$"),X={ID:new RegExp("^#("+N+")"),CLASS:new RegExp("^\\.("+N+")"),TAG:new RegExp("^("+N.replace("w","w*")+")"),ATTR:new RegExp("^"+P),PSEUDO:new RegExp("^"+Q),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+M+"*(even|odd|(([+-]|)(\\d*)n|)"+M+"*(?:([+-]|)"+M+"*(\\d+)|))"+M+"*\\)|)","i"),bool:new RegExp("^(?:"+L+")$","i"),needsContext:new RegExp("^"+M+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+M+"*((?:-\\d)?\\d*)"+M+"*\\)|)(?=[^-]|$)","i")},Y=/^(?:input|select|textarea|button)$/i,Z=/^h\d$/i,$=/^[^{]+\{\s*\[native \w/,_=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,ab=/[+~]/,bb=/'|\\/g,cb=new RegExp("\\\\([\\da-f]{1,6}"+M+"?|("+M+")|.)","ig"),db=function(a,b,c){var d="0x"+b-65536;return d!==d||c?b:0>d?String.fromCharCode(d+65536):String.fromCharCode(d>>10|55296,1023&d|56320)};try{I.apply(F=J.call(v.childNodes),v.childNodes),F[v.childNodes.length].nodeType}catch(eb){I={apply:F.length?function(a,b){H.apply(a,J.call(b))}:function(a,b){var c=a.length,d=0;while(a[c++]=b[d++]);a.length=c-1}}}function fb(a,b,d,e){var f,h,j,k,l,o,r,s,w,x;if((b?b.ownerDocument||b:v)!==n&&m(b),b=b||n,d=d||[],!a||"string"!=typeof a)return d;if(1!==(k=b.nodeType)&&9!==k)return[];if(p&&!e){if(f=_.exec(a))if(j=f[1]){if(9===k){if(h=b.getElementById(j),!h||!h.parentNode)return d;if(h.id===j)return d.push(h),d}else if(b.ownerDocument&&(h=b.ownerDocument.getElementById(j))&&t(b,h)&&h.id===j)return d.push(h),d}else{if(f[2])return I.apply(d,b.getElementsByTagName(a)),d;if((j=f[3])&&c.getElementsByClassName&&b.getElementsByClassName)return I.apply(d,b.getElementsByClassName(j)),d}if(c.qsa&&(!q||!q.test(a))){if(s=r=u,w=b,x=9===k&&a,1===k&&"object"!==b.nodeName.toLowerCase()){o=g(a),(r=b.getAttribute("id"))?s=r.replace(bb,"\\$&"):b.setAttribute("id",s),s="[id='"+s+"'] ",l=o.length;while(l--)o[l]=s+qb(o[l]);w=ab.test(a)&&ob(b.parentNode)||b,x=o.join(",")}if(x)try{return I.apply(d,w.querySelectorAll(x)),d}catch(y){}finally{r||b.removeAttribute("id")}}}return i(a.replace(R,"$1"),b,d,e)}function gb(){var a=[];function b(c,e){return a.push(c+" ")>d.cacheLength&&delete b[a.shift()],b[c+" "]=e}return b}function hb(a){return a[u]=!0,a}function ib(a){var b=n.createElement("div");try{return!!a(b)}catch(c){return!1}finally{b.parentNode&&b.parentNode.removeChild(b),b=null}}function jb(a,b){var c=a.split("|"),e=a.length;while(e--)d.attrHandle[c[e]]=b}function kb(a,b){var c=b&&a,d=c&&1===a.nodeType&&1===b.nodeType&&(~b.sourceIndex||D)-(~a.sourceIndex||D);if(d)return d;if(c)while(c=c.nextSibling)if(c===b)return-1;return a?1:-1}function lb(a){return function(b){var c=b.nodeName.toLowerCase();return"input"===c&&b.type===a}}function mb(a){return function(b){var c=b.nodeName.toLowerCase();return("input"===c||"button"===c)&&b.type===a}}function nb(a){return hb(function(b){return b=+b,hb(function(c,d){var e,f=a([],c.length,b),g=f.length;while(g--)c[e=f[g]]&&(c[e]=!(d[e]=c[e]))})})}function ob(a){return a&&typeof a.getElementsByTagName!==C&&a}c=fb.support={},f=fb.isXML=function(a){var b=a&&(a.ownerDocument||a).documentElement;return b?"HTML"!==b.nodeName:!1},m=fb.setDocument=function(a){var b,e=a?a.ownerDocument||a:v,g=e.defaultView;return e!==n&&9===e.nodeType&&e.documentElement?(n=e,o=e.documentElement,p=!f(e),g&&g!==g.top&&(g.addEventListener?g.addEventListener("unload",function(){m()},!1):g.attachEvent&&g.attachEvent("onunload",function(){m()})),c.attributes=ib(function(a){return a.className="i",!a.getAttribute("className")}),c.getElementsByTagName=ib(function(a){return a.appendChild(e.createComment("")),!a.getElementsByTagName("*").length}),c.getElementsByClassName=$.test(e.getElementsByClassName)&&ib(function(a){return a.innerHTML="<div class='a'></div><div class='a i'></div>",a.firstChild.className="i",2===a.getElementsByClassName("i").length}),c.getById=ib(function(a){return o.appendChild(a).id=u,!e.getElementsByName||!e.getElementsByName(u).length}),c.getById?(d.find.ID=function(a,b){if(typeof b.getElementById!==C&&p){var c=b.getElementById(a);return c&&c.parentNode?[c]:[]}},d.filter.ID=function(a){var b=a.replace(cb,db);return function(a){return a.getAttribute("id")===b}}):(delete d.find.ID,d.filter.ID=function(a){var b=a.replace(cb,db);return function(a){var c=typeof a.getAttributeNode!==C&&a.getAttributeNode("id");return c&&c.value===b}}),d.find.TAG=c.getElementsByTagName?function(a,b){return typeof b.getElementsByTagName!==C?b.getElementsByTagName(a):void 0}:function(a,b){var c,d=[],e=0,f=b.getElementsByTagName(a);if("*"===a){while(c=f[e++])1===c.nodeType&&d.push(c);return d}return f},d.find.CLASS=c.getElementsByClassName&&function(a,b){return typeof b.getElementsByClassName!==C&&p?b.getElementsByClassName(a):void 0},r=[],q=[],(c.qsa=$.test(e.querySelectorAll))&&(ib(function(a){a.innerHTML="<select msallowclip=''><option selected=''></option></select>",a.querySelectorAll("[msallowclip^='']").length&&q.push("[*^$]="+M+"*(?:''|\"\")"),a.querySelectorAll("[selected]").length||q.push("\\["+M+"*(?:value|"+L+")"),a.querySelectorAll(":checked").length||q.push(":checked")}),ib(function(a){var b=e.createElement("input");b.setAttribute("type","hidden"),a.appendChild(b).setAttribute("name","D"),a.querySelectorAll("[name=d]").length&&q.push("name"+M+"*[*^$|!~]?="),a.querySelectorAll(":enabled").length||q.push(":enabled",":disabled"),a.querySelectorAll("*,:x"),q.push(",.*:")})),(c.matchesSelector=$.test(s=o.matches||o.webkitMatchesSelector||o.mozMatchesSelector||o.oMatchesSelector||o.msMatchesSelector))&&ib(function(a){c.disconnectedMatch=s.call(a,"div"),s.call(a,"[s!='']:x"),r.push("!=",Q)}),q=q.length&&new RegExp(q.join("|")),r=r.length&&new RegExp(r.join("|")),b=$.test(o.compareDocumentPosition),t=b||$.test(o.contains)?function(a,b){var c=9===a.nodeType?a.documentElement:a,d=b&&b.parentNode;return a===d||!(!d||1!==d.nodeType||!(c.contains?c.contains(d):a.compareDocumentPosition&&16&a.compareDocumentPosition(d)))}:function(a,b){if(b)while(b=b.parentNode)if(b===a)return!0;return!1},B=b?function(a,b){if(a===b)return l=!0,0;var d=!a.compareDocumentPosition-!b.compareDocumentPosition;return d?d:(d=(a.ownerDocument||a)===(b.ownerDocument||b)?a.compareDocumentPosition(b):1,1&d||!c.sortDetached&&b.compareDocumentPosition(a)===d?a===e||a.ownerDocument===v&&t(v,a)?-1:b===e||b.ownerDocument===v&&t(v,b)?1:k?K.call(k,a)-K.call(k,b):0:4&d?-1:1)}:function(a,b){if(a===b)return l=!0,0;var c,d=0,f=a.parentNode,g=b.parentNode,h=[a],i=[b];if(!f||!g)return a===e?-1:b===e?1:f?-1:g?1:k?K.call(k,a)-K.call(k,b):0;if(f===g)return kb(a,b);c=a;while(c=c.parentNode)h.unshift(c);c=b;while(c=c.parentNode)i.unshift(c);while(h[d]===i[d])d++;return d?kb(h[d],i[d]):h[d]===v?-1:i[d]===v?1:0},e):n},fb.matches=function(a,b){return fb(a,null,null,b)},fb.matchesSelector=function(a,b){if((a.ownerDocument||a)!==n&&m(a),b=b.replace(U,"='$1']"),!(!c.matchesSelector||!p||r&&r.test(b)||q&&q.test(b)))try{var d=s.call(a,b);if(d||c.disconnectedMatch||a.document&&11!==a.document.nodeType)return d}catch(e){}return fb(b,n,null,[a]).length>0},fb.contains=function(a,b){return(a.ownerDocument||a)!==n&&m(a),t(a,b)},fb.attr=function(a,b){(a.ownerDocument||a)!==n&&m(a);var e=d.attrHandle[b.toLowerCase()],f=e&&E.call(d.attrHandle,b.toLowerCase())?e(a,b,!p):void 0;return void 0!==f?f:c.attributes||!p?a.getAttribute(b):(f=a.getAttributeNode(b))&&f.specified?f.value:null},fb.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)},fb.uniqueSort=function(a){var b,d=[],e=0,f=0;if(l=!c.detectDuplicates,k=!c.sortStable&&a.slice(0),a.sort(B),l){while(b=a[f++])b===a[f]&&(e=d.push(f));while(e--)a.splice(d[e],1)}return k=null,a},e=fb.getText=function(a){var b,c="",d=0,f=a.nodeType;if(f){if(1===f||9===f||11===f){if("string"==typeof a.textContent)return a.textContent;for(a=a.firstChild;a;a=a.nextSibling)c+=e(a)}else if(3===f||4===f)return a.nodeValue}else while(b=a[d++])c+=e(b);return c},d=fb.selectors={cacheLength:50,createPseudo:hb,match:X,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(a){return a[1]=a[1].replace(cb,db),a[3]=(a[3]||a[4]||a[5]||"").replace(cb,db),"~="===a[2]&&(a[3]=" "+a[3]+" "),a.slice(0,4)},CHILD:function(a){return a[1]=a[1].toLowerCase(),"nth"===a[1].slice(0,3)?(a[3]||fb.error(a[0]),a[4]=+(a[4]?a[5]+(a[6]||1):2*("even"===a[3]||"odd"===a[3])),a[5]=+(a[7]+a[8]||"odd"===a[3])):a[3]&&fb.error(a[0]),a},PSEUDO:function(a){var b,c=!a[6]&&a[2];return X.CHILD.test(a[0])?null:(a[3]?a[2]=a[4]||a[5]||"":c&&V.test(c)&&(b=g(c,!0))&&(b=c.indexOf(")",c.length-b)-c.length)&&(a[0]=a[0].slice(0,b),a[2]=c.slice(0,b)),a.slice(0,3))}},filter:{TAG:function(a){var b=a.replace(cb,db).toLowerCase();return"*"===a?function(){return!0}:function(a){return a.nodeName&&a.nodeName.toLowerCase()===b}},CLASS:function(a){var b=y[a+" "];return b||(b=new RegExp("(^|"+M+")"+a+"("+M+"|$)"))&&y(a,function(a){return b.test("string"==typeof a.className&&a.className||typeof a.getAttribute!==C&&a.getAttribute("class")||"")})},ATTR:function(a,b,c){return function(d){var e=fb.attr(d,a);return null==e?"!="===b:b?(e+="","="===b?e===c:"!="===b?e!==c:"^="===b?c&&0===e.indexOf(c):"*="===b?c&&e.indexOf(c)>-1:"$="===b?c&&e.slice(-c.length)===c:"~="===b?(" "+e+" ").indexOf(c)>-1:"|="===b?e===c||e.slice(0,c.length+1)===c+"-":!1):!0}},CHILD:function(a,b,c,d,e){var f="nth"!==a.slice(0,3),g="last"!==a.slice(-4),h="of-type"===b;return 1===d&&0===e?function(a){return!!a.parentNode}:function(b,c,i){var j,k,l,m,n,o,p=f!==g?"nextSibling":"previousSibling",q=b.parentNode,r=h&&b.nodeName.toLowerCase(),s=!i&&!h;if(q){if(f){while(p){l=b;while(l=l[p])if(h?l.nodeName.toLowerCase()===r:1===l.nodeType)return!1;o=p="only"===a&&!o&&"nextSibling"}return!0}if(o=[g?q.firstChild:q.lastChild],g&&s){k=q[u]||(q[u]={}),j=k[a]||[],n=j[0]===w&&j[1],m=j[0]===w&&j[2],l=n&&q.childNodes[n];while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if(1===l.nodeType&&++m&&l===b){k[a]=[w,n,m];break}}else if(s&&(j=(b[u]||(b[u]={}))[a])&&j[0]===w)m=j[1];else while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if((h?l.nodeName.toLowerCase()===r:1===l.nodeType)&&++m&&(s&&((l[u]||(l[u]={}))[a]=[w,m]),l===b))break;return m-=e,m===d||m%d===0&&m/d>=0}}},PSEUDO:function(a,b){var c,e=d.pseudos[a]||d.setFilters[a.toLowerCase()]||fb.error("unsupported pseudo: "+a);return e[u]?e(b):e.length>1?(c=[a,a,"",b],d.setFilters.hasOwnProperty(a.toLowerCase())?hb(function(a,c){var d,f=e(a,b),g=f.length;while(g--)d=K.call(a,f[g]),a[d]=!(c[d]=f[g])}):function(a){return e(a,0,c)}):e}},pseudos:{not:hb(function(a){var b=[],c=[],d=h(a.replace(R,"$1"));return d[u]?hb(function(a,b,c,e){var f,g=d(a,null,e,[]),h=a.length;while(h--)(f=g[h])&&(a[h]=!(b[h]=f))}):function(a,e,f){return b[0]=a,d(b,null,f,c),!c.pop()}}),has:hb(function(a){return function(b){return fb(a,b).length>0}}),contains:hb(function(a){return function(b){return(b.textContent||b.innerText||e(b)).indexOf(a)>-1}}),lang:hb(function(a){return W.test(a||"")||fb.error("unsupported lang: "+a),a=a.replace(cb,db).toLowerCase(),function(b){var c;do if(c=p?b.lang:b.getAttribute("xml:lang")||b.getAttribute("lang"))return c=c.toLowerCase(),c===a||0===c.indexOf(a+"-");while((b=b.parentNode)&&1===b.nodeType);return!1}}),target:function(b){var c=a.location&&a.location.hash;return c&&c.slice(1)===b.id},root:function(a){return a===o},focus:function(a){return a===n.activeElement&&(!n.hasFocus||n.hasFocus())&&!!(a.type||a.href||~a.tabIndex)},enabled:function(a){return a.disabled===!1},disabled:function(a){return a.disabled===!0},checked:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&!!a.checked||"option"===b&&!!a.selected},selected:function(a){return a.parentNode&&a.parentNode.selectedIndex,a.selected===!0},empty:function(a){for(a=a.firstChild;a;a=a.nextSibling)if(a.nodeType<6)return!1;return!0},parent:function(a){return!d.pseudos.empty(a)},header:function(a){return Z.test(a.nodeName)},input:function(a){return Y.test(a.nodeName)},button:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&"button"===a.type||"button"===b},text:function(a){var b;return"input"===a.nodeName.toLowerCase()&&"text"===a.type&&(null==(b=a.getAttribute("type"))||"text"===b.toLowerCase())},first:nb(function(){return[0]}),last:nb(function(a,b){return[b-1]}),eq:nb(function(a,b,c){return[0>c?c+b:c]}),even:nb(function(a,b){for(var c=0;b>c;c+=2)a.push(c);return a}),odd:nb(function(a,b){for(var c=1;b>c;c+=2)a.push(c);return a}),lt:nb(function(a,b,c){for(var d=0>c?c+b:c;--d>=0;)a.push(d);return a}),gt:nb(function(a,b,c){for(var d=0>c?c+b:c;++d<b;)a.push(d);return a})}},d.pseudos.nth=d.pseudos.eq;for(b in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})d.pseudos[b]=lb(b);for(b in{submit:!0,reset:!0})d.pseudos[b]=mb(b);function pb(){}pb.prototype=d.filters=d.pseudos,d.setFilters=new pb,g=fb.tokenize=function(a,b){var c,e,f,g,h,i,j,k=z[a+" "];if(k)return b?0:k.slice(0);h=a,i=[],j=d.preFilter;while(h){(!c||(e=S.exec(h)))&&(e&&(h=h.slice(e[0].length)||h),i.push(f=[])),c=!1,(e=T.exec(h))&&(c=e.shift(),f.push({value:c,type:e[0].replace(R," ")}),h=h.slice(c.length));for(g in d.filter)!(e=X[g].exec(h))||j[g]&&!(e=j[g](e))||(c=e.shift(),f.push({value:c,type:g,matches:e}),h=h.slice(c.length));if(!c)break}return b?h.length:h?fb.error(a):z(a,i).slice(0)};function qb(a){for(var b=0,c=a.length,d="";c>b;b++)d+=a[b].value;return d}function rb(a,b,c){var d=b.dir,e=c&&"parentNode"===d,f=x++;return b.first?function(b,c,f){while(b=b[d])if(1===b.nodeType||e)return a(b,c,f)}:function(b,c,g){var h,i,j=[w,f];if(g){while(b=b[d])if((1===b.nodeType||e)&&a(b,c,g))return!0}else while(b=b[d])if(1===b.nodeType||e){if(i=b[u]||(b[u]={}),(h=i[d])&&h[0]===w&&h[1]===f)return j[2]=h[2];if(i[d]=j,j[2]=a(b,c,g))return!0}}}function sb(a){return a.length>1?function(b,c,d){var e=a.length;while(e--)if(!a[e](b,c,d))return!1;return!0}:a[0]}function tb(a,b,c){for(var d=0,e=b.length;e>d;d++)fb(a,b[d],c);return c}function ub(a,b,c,d,e){for(var f,g=[],h=0,i=a.length,j=null!=b;i>h;h++)(f=a[h])&&(!c||c(f,d,e))&&(g.push(f),j&&b.push(h));return g}function vb(a,b,c,d,e,f){return d&&!d[u]&&(d=vb(d)),e&&!e[u]&&(e=vb(e,f)),hb(function(f,g,h,i){var j,k,l,m=[],n=[],o=g.length,p=f||tb(b||"*",h.nodeType?[h]:h,[]),q=!a||!f&&b?p:ub(p,m,a,h,i),r=c?e||(f?a:o||d)?[]:g:q;if(c&&c(q,r,h,i),d){j=ub(r,n),d(j,[],h,i),k=j.length;while(k--)(l=j[k])&&(r[n[k]]=!(q[n[k]]=l))}if(f){if(e||a){if(e){j=[],k=r.length;while(k--)(l=r[k])&&j.push(q[k]=l);e(null,r=[],j,i)}k=r.length;while(k--)(l=r[k])&&(j=e?K.call(f,l):m[k])>-1&&(f[j]=!(g[j]=l))}}else r=ub(r===g?r.splice(o,r.length):r),e?e(null,g,r,i):I.apply(g,r)})}function wb(a){for(var b,c,e,f=a.length,g=d.relative[a[0].type],h=g||d.relative[" "],i=g?1:0,k=rb(function(a){return a===b},h,!0),l=rb(function(a){return K.call(b,a)>-1},h,!0),m=[function(a,c,d){return!g&&(d||c!==j)||((b=c).nodeType?k(a,c,d):l(a,c,d))}];f>i;i++)if(c=d.relative[a[i].type])m=[rb(sb(m),c)];else{if(c=d.filter[a[i].type].apply(null,a[i].matches),c[u]){for(e=++i;f>e;e++)if(d.relative[a[e].type])break;return vb(i>1&&sb(m),i>1&&qb(a.slice(0,i-1).concat({value:" "===a[i-2].type?"*":""})).replace(R,"$1"),c,e>i&&wb(a.slice(i,e)),f>e&&wb(a=a.slice(e)),f>e&&qb(a))}m.push(c)}return sb(m)}function xb(a,b){var c=b.length>0,e=a.length>0,f=function(f,g,h,i,k){var l,m,o,p=0,q="0",r=f&&[],s=[],t=j,u=f||e&&d.find.TAG("*",k),v=w+=null==t?1:Math.random()||.1,x=u.length;for(k&&(j=g!==n&&g);q!==x&&null!=(l=u[q]);q++){if(e&&l){m=0;while(o=a[m++])if(o(l,g,h)){i.push(l);break}k&&(w=v)}c&&((l=!o&&l)&&p--,f&&r.push(l))}if(p+=q,c&&q!==p){m=0;while(o=b[m++])o(r,s,g,h);if(f){if(p>0)while(q--)r[q]||s[q]||(s[q]=G.call(i));s=ub(s)}I.apply(i,s),k&&!f&&s.length>0&&p+b.length>1&&fb.uniqueSort(i)}return k&&(w=v,j=t),r};return c?hb(f):f}return h=fb.compile=function(a,b){var c,d=[],e=[],f=A[a+" "];if(!f){b||(b=g(a)),c=b.length;while(c--)f=wb(b[c]),f[u]?d.push(f):e.push(f);f=A(a,xb(e,d)),f.selector=a}return f},i=fb.select=function(a,b,e,f){var i,j,k,l,m,n="function"==typeof a&&a,o=!f&&g(a=n.selector||a);if(e=e||[],1===o.length){if(j=o[0]=o[0].slice(0),j.length>2&&"ID"===(k=j[0]).type&&c.getById&&9===b.nodeType&&p&&d.relative[j[1].type]){if(b=(d.find.ID(k.matches[0].replace(cb,db),b)||[])[0],!b)return e;n&&(b=b.parentNode),a=a.slice(j.shift().value.length)}i=X.needsContext.test(a)?0:j.length;while(i--){if(k=j[i],d.relative[l=k.type])break;if((m=d.find[l])&&(f=m(k.matches[0].replace(cb,db),ab.test(j[0].type)&&ob(b.parentNode)||b))){if(j.splice(i,1),a=f.length&&qb(j),!a)return I.apply(e,f),e;break}}}return(n||h(a,o))(f,b,!p,e,ab.test(a)&&ob(b.parentNode)||b),e},c.sortStable=u.split("").sort(B).join("")===u,c.detectDuplicates=!!l,m(),c.sortDetached=ib(function(a){return 1&a.compareDocumentPosition(n.createElement("div"))}),ib(function(a){return a.innerHTML="<a href='#'></a>","#"===a.firstChild.getAttribute("href")})||jb("type|href|height|width",function(a,b,c){return c?void 0:a.getAttribute(b,"type"===b.toLowerCase()?1:2)}),c.attributes&&ib(function(a){return a.innerHTML="<input/>",a.firstChild.setAttribute("value",""),""===a.firstChild.getAttribute("value")})||jb("value",function(a,b,c){return c||"input"!==a.nodeName.toLowerCase()?void 0:a.defaultValue}),ib(function(a){return null==a.getAttribute("disabled")})||jb(L,function(a,b,c){var d;return c?void 0:a[b]===!0?b.toLowerCase():(d=a.getAttributeNode(b))&&d.specified?d.value:null}),fb}(a);n.find=t,n.expr=t.selectors,n.expr[":"]=n.expr.pseudos,n.unique=t.uniqueSort,n.text=t.getText,n.isXMLDoc=t.isXML,n.contains=t.contains;var u=n.expr.match.needsContext,v=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,w=/^.[^:#\[\.,]*$/;function x(a,b,c){if(n.isFunction(b))return n.grep(a,function(a,d){return!!b.call(a,d,a)!==c});if(b.nodeType)return n.grep(a,function(a){return a===b!==c});if("string"==typeof b){if(w.test(b))return n.filter(b,a,c);b=n.filter(b,a)}return n.grep(a,function(a){return g.call(b,a)>=0!==c})}n.filter=function(a,b,c){var d=b[0];return c&&(a=":not("+a+")"),1===b.length&&1===d.nodeType?n.find.matchesSelector(d,a)?[d]:[]:n.find.matches(a,n.grep(b,function(a){return 1===a.nodeType}))},n.fn.extend({find:function(a){var b,c=this.length,d=[],e=this;if("string"!=typeof a)return this.pushStack(n(a).filter(function(){for(b=0;c>b;b++)if(n.contains(e[b],this))return!0}));for(b=0;c>b;b++)n.find(a,e[b],d);return d=this.pushStack(c>1?n.unique(d):d),d.selector=this.selector?this.selector+" "+a:a,d},filter:function(a){return this.pushStack(x(this,a||[],!1))},not:function(a){return this.pushStack(x(this,a||[],!0))},is:function(a){return!!x(this,"string"==typeof a&&u.test(a)?n(a):a||[],!1).length}});var y,z=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,A=n.fn.init=function(a,b){var c,d;if(!a)return this;if("string"==typeof a){if(c="<"===a[0]&&">"===a[a.length-1]&&a.length>=3?[null,a,null]:z.exec(a),!c||!c[1]&&b)return!b||b.jquery?(b||y).find(a):this.constructor(b).find(a);if(c[1]){if(b=b instanceof n?b[0]:b,n.merge(this,n.parseHTML(c[1],b&&b.nodeType?b.ownerDocument||b:l,!0)),v.test(c[1])&&n.isPlainObject(b))for(c in b)n.isFunction(this[c])?this[c](b[c]):this.attr(c,b[c]);return this}return d=l.getElementById(c[2]),d&&d.parentNode&&(this.length=1,this[0]=d),this.context=l,this.selector=a,this}return a.nodeType?(this.context=this[0]=a,this.length=1,this):n.isFunction(a)?"undefined"!=typeof y.ready?y.ready(a):a(n):(void 0!==a.selector&&(this.selector=a.selector,this.context=a.context),n.makeArray(a,this))};A.prototype=n.fn,y=n(l);var B=/^(?:parents|prev(?:Until|All))/,C={children:!0,contents:!0,next:!0,prev:!0};n.extend({dir:function(a,b,c){var d=[],e=void 0!==c;while((a=a[b])&&9!==a.nodeType)if(1===a.nodeType){if(e&&n(a).is(c))break;d.push(a)}return d},sibling:function(a,b){for(var c=[];a;a=a.nextSibling)1===a.nodeType&&a!==b&&c.push(a);return c}}),n.fn.extend({has:function(a){var b=n(a,this),c=b.length;return this.filter(function(){for(var a=0;c>a;a++)if(n.contains(this,b[a]))return!0})},closest:function(a,b){for(var c,d=0,e=this.length,f=[],g=u.test(a)||"string"!=typeof a?n(a,b||this.context):0;e>d;d++)for(c=this[d];c&&c!==b;c=c.parentNode)if(c.nodeType<11&&(g?g.index(c)>-1:1===c.nodeType&&n.find.matchesSelector(c,a))){f.push(c);break}return this.pushStack(f.length>1?n.unique(f):f)},index:function(a){return a?"string"==typeof a?g.call(n(a),this[0]):g.call(this,a.jquery?a[0]:a):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(a,b){return this.pushStack(n.unique(n.merge(this.get(),n(a,b))))},addBack:function(a){return this.add(null==a?this.prevObject:this.prevObject.filter(a))}});function D(a,b){while((a=a[b])&&1!==a.nodeType);return a}n.each({parent:function(a){var b=a.parentNode;return b&&11!==b.nodeType?b:null},parents:function(a){return n.dir(a,"parentNode")},parentsUntil:function(a,b,c){return n.dir(a,"parentNode",c)},next:function(a){return D(a,"nextSibling")},prev:function(a){return D(a,"previousSibling")},nextAll:function(a){return n.dir(a,"nextSibling")},prevAll:function(a){return n.dir(a,"previousSibling")},nextUntil:function(a,b,c){return n.dir(a,"nextSibling",c)},prevUntil:function(a,b,c){return n.dir(a,"previousSibling",c)},siblings:function(a){return n.sibling((a.parentNode||{}).firstChild,a)},children:function(a){return n.sibling(a.firstChild)},contents:function(a){return a.contentDocument||n.merge([],a.childNodes)}},function(a,b){n.fn[a]=function(c,d){var e=n.map(this,b,c);return"Until"!==a.slice(-5)&&(d=c),d&&"string"==typeof d&&(e=n.filter(d,e)),this.length>1&&(C[a]||n.unique(e),B.test(a)&&e.reverse()),this.pushStack(e)}});var E=/\S+/g,F={};function G(a){var b=F[a]={};return n.each(a.match(E)||[],function(a,c){b[c]=!0}),b}n.Callbacks=function(a){a="string"==typeof a?F[a]||G(a):n.extend({},a);var b,c,d,e,f,g,h=[],i=!a.once&&[],j=function(l){for(b=a.memory&&l,c=!0,g=e||0,e=0,f=h.length,d=!0;h&&f>g;g++)if(h[g].apply(l[0],l[1])===!1&&a.stopOnFalse){b=!1;break}d=!1,h&&(i?i.length&&j(i.shift()):b?h=[]:k.disable())},k={add:function(){if(h){var c=h.length;!function g(b){n.each(b,function(b,c){var d=n.type(c);"function"===d?a.unique&&k.has(c)||h.push(c):c&&c.length&&"string"!==d&&g(c)})}(arguments),d?f=h.length:b&&(e=c,j(b))}return this},remove:function(){return h&&n.each(arguments,function(a,b){var c;while((c=n.inArray(b,h,c))>-1)h.splice(c,1),d&&(f>=c&&f--,g>=c&&g--)}),this},has:function(a){return a?n.inArray(a,h)>-1:!(!h||!h.length)},empty:function(){return h=[],f=0,this},disable:function(){return h=i=b=void 0,this},disabled:function(){return!h},lock:function(){return i=void 0,b||k.disable(),this},locked:function(){return!i},fireWith:function(a,b){return!h||c&&!i||(b=b||[],b=[a,b.slice?b.slice():b],d?i.push(b):j(b)),this},fire:function(){return k.fireWith(this,arguments),this},fired:function(){return!!c}};return k},n.extend({Deferred:function(a){var b=[["resolve","done",n.Callbacks("once memory"),"resolved"],["reject","fail",n.Callbacks("once memory"),"rejected"],["notify","progress",n.Callbacks("memory")]],c="pending",d={state:function(){return c},always:function(){return e.done(arguments).fail(arguments),this},then:function(){var a=arguments;return n.Deferred(function(c){n.each(b,function(b,f){var g=n.isFunction(a[b])&&a[b];e[f[1]](function(){var a=g&&g.apply(this,arguments);a&&n.isFunction(a.promise)?a.promise().done(c.resolve).fail(c.reject).progress(c.notify):c[f[0]+"With"](this===d?c.promise():this,g?[a]:arguments)})}),a=null}).promise()},promise:function(a){return null!=a?n.extend(a,d):d}},e={};return d.pipe=d.then,n.each(b,function(a,f){var g=f[2],h=f[3];d[f[1]]=g.add,h&&g.add(function(){c=h},b[1^a][2].disable,b[2][2].lock),e[f[0]]=function(){return e[f[0]+"With"](this===e?d:this,arguments),this},e[f[0]+"With"]=g.fireWith}),d.promise(e),a&&a.call(e,e),e},when:function(a){var b=0,c=d.call(arguments),e=c.length,f=1!==e||a&&n.isFunction(a.promise)?e:0,g=1===f?a:n.Deferred(),h=function(a,b,c){return function(e){b[a]=this,c[a]=arguments.length>1?d.call(arguments):e,c===i?g.notifyWith(b,c):--f||g.resolveWith(b,c)}},i,j,k;if(e>1)for(i=new Array(e),j=new Array(e),k=new Array(e);e>b;b++)c[b]&&n.isFunction(c[b].promise)?c[b].promise().done(h(b,k,c)).fail(g.reject).progress(h(b,j,i)):--f;return f||g.resolveWith(k,c),g.promise()}});var H;n.fn.ready=function(a){return n.ready.promise().done(a),this},n.extend({isReady:!1,readyWait:1,holdReady:function(a){a?n.readyWait++:n.ready(!0)},ready:function(a){(a===!0?--n.readyWait:n.isReady)||(n.isReady=!0,a!==!0&&--n.readyWait>0||(H.resolveWith(l,[n]),n.fn.triggerHandler&&(n(l).triggerHandler("ready"),n(l).off("ready"))))}});function I(){l.removeEventListener("DOMContentLoaded",I,!1),a.removeEventListener("load",I,!1),n.ready()}n.ready.promise=function(b){return H||(H=n.Deferred(),"complete"===l.readyState?setTimeout(n.ready):(l.addEventListener("DOMContentLoaded",I,!1),a.addEventListener("load",I,!1))),H.promise(b)},n.ready.promise();var J=n.access=function(a,b,c,d,e,f,g){var h=0,i=a.length,j=null==c;if("object"===n.type(c)){e=!0;for(h in c)n.access(a,b,h,c[h],!0,f,g)}else if(void 0!==d&&(e=!0,n.isFunction(d)||(g=!0),j&&(g?(b.call(a,d),b=null):(j=b,b=function(a,b,c){return j.call(n(a),c)})),b))for(;i>h;h++)b(a[h],c,g?d:d.call(a[h],h,b(a[h],c)));return e?a:j?b.call(a):i?b(a[0],c):f};n.acceptData=function(a){return 1===a.nodeType||9===a.nodeType||!+a.nodeType};function K(){Object.defineProperty(this.cache={},0,{get:function(){return{}}}),this.expando=n.expando+Math.random()}K.uid=1,K.accepts=n.acceptData,K.prototype={key:function(a){if(!K.accepts(a))return 0;var b={},c=a[this.expando];if(!c){c=K.uid++;try{b[this.expando]={value:c},Object.defineProperties(a,b)}catch(d){b[this.expando]=c,n.extend(a,b)}}return this.cache[c]||(this.cache[c]={}),c},set:function(a,b,c){var d,e=this.key(a),f=this.cache[e];if("string"==typeof b)f[b]=c;else if(n.isEmptyObject(f))n.extend(this.cache[e],b);else for(d in b)f[d]=b[d];return f},get:function(a,b){var c=this.cache[this.key(a)];return void 0===b?c:c[b]},access:function(a,b,c){var d;return void 0===b||b&&"string"==typeof b&&void 0===c?(d=this.get(a,b),void 0!==d?d:this.get(a,n.camelCase(b))):(this.set(a,b,c),void 0!==c?c:b)},remove:function(a,b){var c,d,e,f=this.key(a),g=this.cache[f];if(void 0===b)this.cache[f]={};else{n.isArray(b)?d=b.concat(b.map(n.camelCase)):(e=n.camelCase(b),b in g?d=[b,e]:(d=e,d=d in g?[d]:d.match(E)||[])),c=d.length;while(c--)delete g[d[c]]}},hasData:function(a){return!n.isEmptyObject(this.cache[a[this.expando]]||{})},discard:function(a){a[this.expando]&&delete this.cache[a[this.expando]]}};var L=new K,M=new K,N=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,O=/([A-Z])/g;function P(a,b,c){var d;if(void 0===c&&1===a.nodeType)if(d="data-"+b.replace(O,"-$1").toLowerCase(),c=a.getAttribute(d),"string"==typeof c){try{c="true"===c?!0:"false"===c?!1:"null"===c?null:+c+""===c?+c:N.test(c)?n.parseJSON(c):c}catch(e){}M.set(a,b,c)}else c=void 0;return c}n.extend({hasData:function(a){return M.hasData(a)||L.hasData(a)},data:function(a,b,c){return M.access(a,b,c)},removeData:function(a,b){M.remove(a,b)
},_data:function(a,b,c){return L.access(a,b,c)},_removeData:function(a,b){L.remove(a,b)}}),n.fn.extend({data:function(a,b){var c,d,e,f=this[0],g=f&&f.attributes;if(void 0===a){if(this.length&&(e=M.get(f),1===f.nodeType&&!L.get(f,"hasDataAttrs"))){c=g.length;while(c--)g[c]&&(d=g[c].name,0===d.indexOf("data-")&&(d=n.camelCase(d.slice(5)),P(f,d,e[d])));L.set(f,"hasDataAttrs",!0)}return e}return"object"==typeof a?this.each(function(){M.set(this,a)}):J(this,function(b){var c,d=n.camelCase(a);if(f&&void 0===b){if(c=M.get(f,a),void 0!==c)return c;if(c=M.get(f,d),void 0!==c)return c;if(c=P(f,d,void 0),void 0!==c)return c}else this.each(function(){var c=M.get(this,d);M.set(this,d,b),-1!==a.indexOf("-")&&void 0!==c&&M.set(this,a,b)})},null,b,arguments.length>1,null,!0)},removeData:function(a){return this.each(function(){M.remove(this,a)})}}),n.extend({queue:function(a,b,c){var d;return a?(b=(b||"fx")+"queue",d=L.get(a,b),c&&(!d||n.isArray(c)?d=L.access(a,b,n.makeArray(c)):d.push(c)),d||[]):void 0},dequeue:function(a,b){b=b||"fx";var c=n.queue(a,b),d=c.length,e=c.shift(),f=n._queueHooks(a,b),g=function(){n.dequeue(a,b)};"inprogress"===e&&(e=c.shift(),d--),e&&("fx"===b&&c.unshift("inprogress"),delete f.stop,e.call(a,g,f)),!d&&f&&f.empty.fire()},_queueHooks:function(a,b){var c=b+"queueHooks";return L.get(a,c)||L.access(a,c,{empty:n.Callbacks("once memory").add(function(){L.remove(a,[b+"queue",c])})})}}),n.fn.extend({queue:function(a,b){var c=2;return"string"!=typeof a&&(b=a,a="fx",c--),arguments.length<c?n.queue(this[0],a):void 0===b?this:this.each(function(){var c=n.queue(this,a,b);n._queueHooks(this,a),"fx"===a&&"inprogress"!==c[0]&&n.dequeue(this,a)})},dequeue:function(a){return this.each(function(){n.dequeue(this,a)})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,b){var c,d=1,e=n.Deferred(),f=this,g=this.length,h=function(){--d||e.resolveWith(f,[f])};"string"!=typeof a&&(b=a,a=void 0),a=a||"fx";while(g--)c=L.get(f[g],a+"queueHooks"),c&&c.empty&&(d++,c.empty.add(h));return h(),e.promise(b)}});var Q=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,R=["Top","Right","Bottom","Left"],S=function(a,b){return a=b||a,"none"===n.css(a,"display")||!n.contains(a.ownerDocument,a)},T=/^(?:checkbox|radio)$/i;!function(){var a=l.createDocumentFragment(),b=a.appendChild(l.createElement("div")),c=l.createElement("input");c.setAttribute("type","radio"),c.setAttribute("checked","checked"),c.setAttribute("name","t"),b.appendChild(c),k.checkClone=b.cloneNode(!0).cloneNode(!0).lastChild.checked,b.innerHTML="<textarea>x</textarea>",k.noCloneChecked=!!b.cloneNode(!0).lastChild.defaultValue}();var U="undefined";k.focusinBubbles="onfocusin"in a;var V=/^key/,W=/^(?:mouse|pointer|contextmenu)|click/,X=/^(?:focusinfocus|focusoutblur)$/,Y=/^([^.]*)(?:\.(.+)|)$/;function Z(){return!0}function $(){return!1}function _(){try{return l.activeElement}catch(a){}}n.event={global:{},add:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=L.get(a);if(r){c.handler&&(f=c,c=f.handler,e=f.selector),c.guid||(c.guid=n.guid++),(i=r.events)||(i=r.events={}),(g=r.handle)||(g=r.handle=function(b){return typeof n!==U&&n.event.triggered!==b.type?n.event.dispatch.apply(a,arguments):void 0}),b=(b||"").match(E)||[""],j=b.length;while(j--)h=Y.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o&&(l=n.event.special[o]||{},o=(e?l.delegateType:l.bindType)||o,l=n.event.special[o]||{},k=n.extend({type:o,origType:q,data:d,handler:c,guid:c.guid,selector:e,needsContext:e&&n.expr.match.needsContext.test(e),namespace:p.join(".")},f),(m=i[o])||(m=i[o]=[],m.delegateCount=0,l.setup&&l.setup.call(a,d,p,g)!==!1||a.addEventListener&&a.addEventListener(o,g,!1)),l.add&&(l.add.call(a,k),k.handler.guid||(k.handler.guid=c.guid)),e?m.splice(m.delegateCount++,0,k):m.push(k),n.event.global[o]=!0)}},remove:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=L.hasData(a)&&L.get(a);if(r&&(i=r.events)){b=(b||"").match(E)||[""],j=b.length;while(j--)if(h=Y.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o){l=n.event.special[o]||{},o=(d?l.delegateType:l.bindType)||o,m=i[o]||[],h=h[2]&&new RegExp("(^|\\.)"+p.join("\\.(?:.*\\.|)")+"(\\.|$)"),g=f=m.length;while(f--)k=m[f],!e&&q!==k.origType||c&&c.guid!==k.guid||h&&!h.test(k.namespace)||d&&d!==k.selector&&("**"!==d||!k.selector)||(m.splice(f,1),k.selector&&m.delegateCount--,l.remove&&l.remove.call(a,k));g&&!m.length&&(l.teardown&&l.teardown.call(a,p,r.handle)!==!1||n.removeEvent(a,o,r.handle),delete i[o])}else for(o in i)n.event.remove(a,o+b[j],c,d,!0);n.isEmptyObject(i)&&(delete r.handle,L.remove(a,"events"))}},trigger:function(b,c,d,e){var f,g,h,i,k,m,o,p=[d||l],q=j.call(b,"type")?b.type:b,r=j.call(b,"namespace")?b.namespace.split("."):[];if(g=h=d=d||l,3!==d.nodeType&&8!==d.nodeType&&!X.test(q+n.event.triggered)&&(q.indexOf(".")>=0&&(r=q.split("."),q=r.shift(),r.sort()),k=q.indexOf(":")<0&&"on"+q,b=b[n.expando]?b:new n.Event(q,"object"==typeof b&&b),b.isTrigger=e?2:3,b.namespace=r.join("."),b.namespace_re=b.namespace?new RegExp("(^|\\.)"+r.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,b.result=void 0,b.target||(b.target=d),c=null==c?[b]:n.makeArray(c,[b]),o=n.event.special[q]||{},e||!o.trigger||o.trigger.apply(d,c)!==!1)){if(!e&&!o.noBubble&&!n.isWindow(d)){for(i=o.delegateType||q,X.test(i+q)||(g=g.parentNode);g;g=g.parentNode)p.push(g),h=g;h===(d.ownerDocument||l)&&p.push(h.defaultView||h.parentWindow||a)}f=0;while((g=p[f++])&&!b.isPropagationStopped())b.type=f>1?i:o.bindType||q,m=(L.get(g,"events")||{})[b.type]&&L.get(g,"handle"),m&&m.apply(g,c),m=k&&g[k],m&&m.apply&&n.acceptData(g)&&(b.result=m.apply(g,c),b.result===!1&&b.preventDefault());return b.type=q,e||b.isDefaultPrevented()||o._default&&o._default.apply(p.pop(),c)!==!1||!n.acceptData(d)||k&&n.isFunction(d[q])&&!n.isWindow(d)&&(h=d[k],h&&(d[k]=null),n.event.triggered=q,d[q](),n.event.triggered=void 0,h&&(d[k]=h)),b.result}},dispatch:function(a){a=n.event.fix(a);var b,c,e,f,g,h=[],i=d.call(arguments),j=(L.get(this,"events")||{})[a.type]||[],k=n.event.special[a.type]||{};if(i[0]=a,a.delegateTarget=this,!k.preDispatch||k.preDispatch.call(this,a)!==!1){h=n.event.handlers.call(this,a,j),b=0;while((f=h[b++])&&!a.isPropagationStopped()){a.currentTarget=f.elem,c=0;while((g=f.handlers[c++])&&!a.isImmediatePropagationStopped())(!a.namespace_re||a.namespace_re.test(g.namespace))&&(a.handleObj=g,a.data=g.data,e=((n.event.special[g.origType]||{}).handle||g.handler).apply(f.elem,i),void 0!==e&&(a.result=e)===!1&&(a.preventDefault(),a.stopPropagation()))}return k.postDispatch&&k.postDispatch.call(this,a),a.result}},handlers:function(a,b){var c,d,e,f,g=[],h=b.delegateCount,i=a.target;if(h&&i.nodeType&&(!a.button||"click"!==a.type))for(;i!==this;i=i.parentNode||this)if(i.disabled!==!0||"click"!==a.type){for(d=[],c=0;h>c;c++)f=b[c],e=f.selector+" ",void 0===d[e]&&(d[e]=f.needsContext?n(e,this).index(i)>=0:n.find(e,this,null,[i]).length),d[e]&&d.push(f);d.length&&g.push({elem:i,handlers:d})}return h<b.length&&g.push({elem:this,handlers:b.slice(h)}),g},props:"altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(a,b){return null==a.which&&(a.which=null!=b.charCode?b.charCode:b.keyCode),a}},mouseHooks:{props:"button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(a,b){var c,d,e,f=b.button;return null==a.pageX&&null!=b.clientX&&(c=a.target.ownerDocument||l,d=c.documentElement,e=c.body,a.pageX=b.clientX+(d&&d.scrollLeft||e&&e.scrollLeft||0)-(d&&d.clientLeft||e&&e.clientLeft||0),a.pageY=b.clientY+(d&&d.scrollTop||e&&e.scrollTop||0)-(d&&d.clientTop||e&&e.clientTop||0)),a.which||void 0===f||(a.which=1&f?1:2&f?3:4&f?2:0),a}},fix:function(a){if(a[n.expando])return a;var b,c,d,e=a.type,f=a,g=this.fixHooks[e];g||(this.fixHooks[e]=g=W.test(e)?this.mouseHooks:V.test(e)?this.keyHooks:{}),d=g.props?this.props.concat(g.props):this.props,a=new n.Event(f),b=d.length;while(b--)c=d[b],a[c]=f[c];return a.target||(a.target=l),3===a.target.nodeType&&(a.target=a.target.parentNode),g.filter?g.filter(a,f):a},special:{load:{noBubble:!0},focus:{trigger:function(){return this!==_()&&this.focus?(this.focus(),!1):void 0},delegateType:"focusin"},blur:{trigger:function(){return this===_()&&this.blur?(this.blur(),!1):void 0},delegateType:"focusout"},click:{trigger:function(){return"checkbox"===this.type&&this.click&&n.nodeName(this,"input")?(this.click(),!1):void 0},_default:function(a){return n.nodeName(a.target,"a")}},beforeunload:{postDispatch:function(a){void 0!==a.result&&a.originalEvent&&(a.originalEvent.returnValue=a.result)}}},simulate:function(a,b,c,d){var e=n.extend(new n.Event,c,{type:a,isSimulated:!0,originalEvent:{}});d?n.event.trigger(e,null,b):n.event.dispatch.call(b,e),e.isDefaultPrevented()&&c.preventDefault()}},n.removeEvent=function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c,!1)},n.Event=function(a,b){return this instanceof n.Event?(a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||void 0===a.defaultPrevented&&a.returnValue===!1?Z:$):this.type=a,b&&n.extend(this,b),this.timeStamp=a&&a.timeStamp||n.now(),void(this[n.expando]=!0)):new n.Event(a,b)},n.Event.prototype={isDefaultPrevented:$,isPropagationStopped:$,isImmediatePropagationStopped:$,preventDefault:function(){var a=this.originalEvent;this.isDefaultPrevented=Z,a&&a.preventDefault&&a.preventDefault()},stopPropagation:function(){var a=this.originalEvent;this.isPropagationStopped=Z,a&&a.stopPropagation&&a.stopPropagation()},stopImmediatePropagation:function(){var a=this.originalEvent;this.isImmediatePropagationStopped=Z,a&&a.stopImmediatePropagation&&a.stopImmediatePropagation(),this.stopPropagation()}},n.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(a,b){n.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c,d=this,e=a.relatedTarget,f=a.handleObj;return(!e||e!==d&&!n.contains(d,e))&&(a.type=f.origType,c=f.handler.apply(this,arguments),a.type=b),c}}}),k.focusinBubbles||n.each({focus:"focusin",blur:"focusout"},function(a,b){var c=function(a){n.event.simulate(b,a.target,n.event.fix(a),!0)};n.event.special[b]={setup:function(){var d=this.ownerDocument||this,e=L.access(d,b);e||d.addEventListener(a,c,!0),L.access(d,b,(e||0)+1)},teardown:function(){var d=this.ownerDocument||this,e=L.access(d,b)-1;e?L.access(d,b,e):(d.removeEventListener(a,c,!0),L.remove(d,b))}}}),n.fn.extend({on:function(a,b,c,d,e){var f,g;if("object"==typeof a){"string"!=typeof b&&(c=c||b,b=void 0);for(g in a)this.on(g,b,c,a[g],e);return this}if(null==c&&null==d?(d=b,c=b=void 0):null==d&&("string"==typeof b?(d=c,c=void 0):(d=c,c=b,b=void 0)),d===!1)d=$;else if(!d)return this;return 1===e&&(f=d,d=function(a){return n().off(a),f.apply(this,arguments)},d.guid=f.guid||(f.guid=n.guid++)),this.each(function(){n.event.add(this,a,d,c,b)})},one:function(a,b,c,d){return this.on(a,b,c,d,1)},off:function(a,b,c){var d,e;if(a&&a.preventDefault&&a.handleObj)return d=a.handleObj,n(a.delegateTarget).off(d.namespace?d.origType+"."+d.namespace:d.origType,d.selector,d.handler),this;if("object"==typeof a){for(e in a)this.off(e,b,a[e]);return this}return(b===!1||"function"==typeof b)&&(c=b,b=void 0),c===!1&&(c=$),this.each(function(){n.event.remove(this,a,c,b)})},trigger:function(a,b){return this.each(function(){n.event.trigger(a,b,this)})},triggerHandler:function(a,b){var c=this[0];return c?n.event.trigger(a,b,c,!0):void 0}});var ab=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,bb=/<([\w:]+)/,cb=/<|&#?\w+;/,db=/<(?:script|style|link)/i,eb=/checked\s*(?:[^=]|=\s*.checked.)/i,fb=/^$|\/(?:java|ecma)script/i,gb=/^true\/(.*)/,hb=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,ib={option:[1,"<select multiple='multiple'>","</select>"],thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};ib.optgroup=ib.option,ib.tbody=ib.tfoot=ib.colgroup=ib.caption=ib.thead,ib.th=ib.td;function jb(a,b){return n.nodeName(a,"table")&&n.nodeName(11!==b.nodeType?b:b.firstChild,"tr")?a.getElementsByTagName("tbody")[0]||a.appendChild(a.ownerDocument.createElement("tbody")):a}function kb(a){return a.type=(null!==a.getAttribute("type"))+"/"+a.type,a}function lb(a){var b=gb.exec(a.type);return b?a.type=b[1]:a.removeAttribute("type"),a}function mb(a,b){for(var c=0,d=a.length;d>c;c++)L.set(a[c],"globalEval",!b||L.get(b[c],"globalEval"))}function nb(a,b){var c,d,e,f,g,h,i,j;if(1===b.nodeType){if(L.hasData(a)&&(f=L.access(a),g=L.set(b,f),j=f.events)){delete g.handle,g.events={};for(e in j)for(c=0,d=j[e].length;d>c;c++)n.event.add(b,e,j[e][c])}M.hasData(a)&&(h=M.access(a),i=n.extend({},h),M.set(b,i))}}function ob(a,b){var c=a.getElementsByTagName?a.getElementsByTagName(b||"*"):a.querySelectorAll?a.querySelectorAll(b||"*"):[];return void 0===b||b&&n.nodeName(a,b)?n.merge([a],c):c}function pb(a,b){var c=b.nodeName.toLowerCase();"input"===c&&T.test(a.type)?b.checked=a.checked:("input"===c||"textarea"===c)&&(b.defaultValue=a.defaultValue)}n.extend({clone:function(a,b,c){var d,e,f,g,h=a.cloneNode(!0),i=n.contains(a.ownerDocument,a);if(!(k.noCloneChecked||1!==a.nodeType&&11!==a.nodeType||n.isXMLDoc(a)))for(g=ob(h),f=ob(a),d=0,e=f.length;e>d;d++)pb(f[d],g[d]);if(b)if(c)for(f=f||ob(a),g=g||ob(h),d=0,e=f.length;e>d;d++)nb(f[d],g[d]);else nb(a,h);return g=ob(h,"script"),g.length>0&&mb(g,!i&&ob(a,"script")),h},buildFragment:function(a,b,c,d){for(var e,f,g,h,i,j,k=b.createDocumentFragment(),l=[],m=0,o=a.length;o>m;m++)if(e=a[m],e||0===e)if("object"===n.type(e))n.merge(l,e.nodeType?[e]:e);else if(cb.test(e)){f=f||k.appendChild(b.createElement("div")),g=(bb.exec(e)||["",""])[1].toLowerCase(),h=ib[g]||ib._default,f.innerHTML=h[1]+e.replace(ab,"<$1></$2>")+h[2],j=h[0];while(j--)f=f.lastChild;n.merge(l,f.childNodes),f=k.firstChild,f.textContent=""}else l.push(b.createTextNode(e));k.textContent="",m=0;while(e=l[m++])if((!d||-1===n.inArray(e,d))&&(i=n.contains(e.ownerDocument,e),f=ob(k.appendChild(e),"script"),i&&mb(f),c)){j=0;while(e=f[j++])fb.test(e.type||"")&&c.push(e)}return k},cleanData:function(a){for(var b,c,d,e,f=n.event.special,g=0;void 0!==(c=a[g]);g++){if(n.acceptData(c)&&(e=c[L.expando],e&&(b=L.cache[e]))){if(b.events)for(d in b.events)f[d]?n.event.remove(c,d):n.removeEvent(c,d,b.handle);L.cache[e]&&delete L.cache[e]}delete M.cache[c[M.expando]]}}}),n.fn.extend({text:function(a){return J(this,function(a){return void 0===a?n.text(this):this.empty().each(function(){(1===this.nodeType||11===this.nodeType||9===this.nodeType)&&(this.textContent=a)})},null,a,arguments.length)},append:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=jb(this,a);b.appendChild(a)}})},prepend:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=jb(this,a);b.insertBefore(a,b.firstChild)}})},before:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this)})},after:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this.nextSibling)})},remove:function(a,b){for(var c,d=a?n.filter(a,this):this,e=0;null!=(c=d[e]);e++)b||1!==c.nodeType||n.cleanData(ob(c)),c.parentNode&&(b&&n.contains(c.ownerDocument,c)&&mb(ob(c,"script")),c.parentNode.removeChild(c));return this},empty:function(){for(var a,b=0;null!=(a=this[b]);b++)1===a.nodeType&&(n.cleanData(ob(a,!1)),a.textContent="");return this},clone:function(a,b){return a=null==a?!1:a,b=null==b?a:b,this.map(function(){return n.clone(this,a,b)})},html:function(a){return J(this,function(a){var b=this[0]||{},c=0,d=this.length;if(void 0===a&&1===b.nodeType)return b.innerHTML;if("string"==typeof a&&!db.test(a)&&!ib[(bb.exec(a)||["",""])[1].toLowerCase()]){a=a.replace(ab,"<$1></$2>");try{for(;d>c;c++)b=this[c]||{},1===b.nodeType&&(n.cleanData(ob(b,!1)),b.innerHTML=a);b=0}catch(e){}}b&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(){var a=arguments[0];return this.domManip(arguments,function(b){a=this.parentNode,n.cleanData(ob(this)),a&&a.replaceChild(b,this)}),a&&(a.length||a.nodeType)?this:this.remove()},detach:function(a){return this.remove(a,!0)},domManip:function(a,b){a=e.apply([],a);var c,d,f,g,h,i,j=0,l=this.length,m=this,o=l-1,p=a[0],q=n.isFunction(p);if(q||l>1&&"string"==typeof p&&!k.checkClone&&eb.test(p))return this.each(function(c){var d=m.eq(c);q&&(a[0]=p.call(this,c,d.html())),d.domManip(a,b)});if(l&&(c=n.buildFragment(a,this[0].ownerDocument,!1,this),d=c.firstChild,1===c.childNodes.length&&(c=d),d)){for(f=n.map(ob(c,"script"),kb),g=f.length;l>j;j++)h=c,j!==o&&(h=n.clone(h,!0,!0),g&&n.merge(f,ob(h,"script"))),b.call(this[j],h,j);if(g)for(i=f[f.length-1].ownerDocument,n.map(f,lb),j=0;g>j;j++)h=f[j],fb.test(h.type||"")&&!L.access(h,"globalEval")&&n.contains(i,h)&&(h.src?n._evalUrl&&n._evalUrl(h.src):n.globalEval(h.textContent.replace(hb,"")))}return this}}),n.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){n.fn[a]=function(a){for(var c,d=[],e=n(a),g=e.length-1,h=0;g>=h;h++)c=h===g?this:this.clone(!0),n(e[h])[b](c),f.apply(d,c.get());return this.pushStack(d)}});var qb,rb={};function sb(b,c){var d,e=n(c.createElement(b)).appendTo(c.body),f=a.getDefaultComputedStyle&&(d=a.getDefaultComputedStyle(e[0]))?d.display:n.css(e[0],"display");return e.detach(),f}function tb(a){var b=l,c=rb[a];return c||(c=sb(a,b),"none"!==c&&c||(qb=(qb||n("<iframe frameborder='0' width='0' height='0'/>")).appendTo(b.documentElement),b=qb[0].contentDocument,b.write(),b.close(),c=sb(a,b),qb.detach()),rb[a]=c),c}var ub=/^margin/,vb=new RegExp("^("+Q+")(?!px)[a-z%]+$","i"),wb=function(a){return a.ownerDocument.defaultView.getComputedStyle(a,null)};function xb(a,b,c){var d,e,f,g,h=a.style;return c=c||wb(a),c&&(g=c.getPropertyValue(b)||c[b]),c&&(""!==g||n.contains(a.ownerDocument,a)||(g=n.style(a,b)),vb.test(g)&&ub.test(b)&&(d=h.width,e=h.minWidth,f=h.maxWidth,h.minWidth=h.maxWidth=h.width=g,g=c.width,h.width=d,h.minWidth=e,h.maxWidth=f)),void 0!==g?g+"":g}function yb(a,b){return{get:function(){return a()?void delete this.get:(this.get=b).apply(this,arguments)}}}!function(){var b,c,d=l.documentElement,e=l.createElement("div"),f=l.createElement("div");if(f.style){f.style.backgroundClip="content-box",f.cloneNode(!0).style.backgroundClip="",k.clearCloneStyle="content-box"===f.style.backgroundClip,e.style.cssText="border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;position:absolute",e.appendChild(f);function g(){f.style.cssText="-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;display:block;margin-top:1%;top:1%;border:1px;padding:1px;width:4px;position:absolute",f.innerHTML="",d.appendChild(e);var g=a.getComputedStyle(f,null);b="1%"!==g.top,c="4px"===g.width,d.removeChild(e)}a.getComputedStyle&&n.extend(k,{pixelPosition:function(){return g(),b},boxSizingReliable:function(){return null==c&&g(),c},reliableMarginRight:function(){var b,c=f.appendChild(l.createElement("div"));return c.style.cssText=f.style.cssText="-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:0",c.style.marginRight=c.style.width="0",f.style.width="1px",d.appendChild(e),b=!parseFloat(a.getComputedStyle(c,null).marginRight),d.removeChild(e),b}})}}(),n.swap=function(a,b,c,d){var e,f,g={};for(f in b)g[f]=a.style[f],a.style[f]=b[f];e=c.apply(a,d||[]);for(f in b)a.style[f]=g[f];return e};var zb=/^(none|table(?!-c[ea]).+)/,Ab=new RegExp("^("+Q+")(.*)$","i"),Bb=new RegExp("^([+-])=("+Q+")","i"),Cb={position:"absolute",visibility:"hidden",display:"block"},Db={letterSpacing:"0",fontWeight:"400"},Eb=["Webkit","O","Moz","ms"];function Fb(a,b){if(b in a)return b;var c=b[0].toUpperCase()+b.slice(1),d=b,e=Eb.length;while(e--)if(b=Eb[e]+c,b in a)return b;return d}function Gb(a,b,c){var d=Ab.exec(b);return d?Math.max(0,d[1]-(c||0))+(d[2]||"px"):b}function Hb(a,b,c,d,e){for(var f=c===(d?"border":"content")?4:"width"===b?1:0,g=0;4>f;f+=2)"margin"===c&&(g+=n.css(a,c+R[f],!0,e)),d?("content"===c&&(g-=n.css(a,"padding"+R[f],!0,e)),"margin"!==c&&(g-=n.css(a,"border"+R[f]+"Width",!0,e))):(g+=n.css(a,"padding"+R[f],!0,e),"padding"!==c&&(g+=n.css(a,"border"+R[f]+"Width",!0,e)));return g}function Ib(a,b,c){var d=!0,e="width"===b?a.offsetWidth:a.offsetHeight,f=wb(a),g="border-box"===n.css(a,"boxSizing",!1,f);if(0>=e||null==e){if(e=xb(a,b,f),(0>e||null==e)&&(e=a.style[b]),vb.test(e))return e;d=g&&(k.boxSizingReliable()||e===a.style[b]),e=parseFloat(e)||0}return e+Hb(a,b,c||(g?"border":"content"),d,f)+"px"}function Jb(a,b){for(var c,d,e,f=[],g=0,h=a.length;h>g;g++)d=a[g],d.style&&(f[g]=L.get(d,"olddisplay"),c=d.style.display,b?(f[g]||"none"!==c||(d.style.display=""),""===d.style.display&&S(d)&&(f[g]=L.access(d,"olddisplay",tb(d.nodeName)))):(e=S(d),"none"===c&&e||L.set(d,"olddisplay",e?c:n.css(d,"display"))));for(g=0;h>g;g++)d=a[g],d.style&&(b&&"none"!==d.style.display&&""!==d.style.display||(d.style.display=b?f[g]||"":"none"));return a}n.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=xb(a,"opacity");return""===c?"1":c}}}},cssNumber:{columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":"cssFloat"},style:function(a,b,c,d){if(a&&3!==a.nodeType&&8!==a.nodeType&&a.style){var e,f,g,h=n.camelCase(b),i=a.style;return b=n.cssProps[h]||(n.cssProps[h]=Fb(i,h)),g=n.cssHooks[b]||n.cssHooks[h],void 0===c?g&&"get"in g&&void 0!==(e=g.get(a,!1,d))?e:i[b]:(f=typeof c,"string"===f&&(e=Bb.exec(c))&&(c=(e[1]+1)*e[2]+parseFloat(n.css(a,b)),f="number"),null!=c&&c===c&&("number"!==f||n.cssNumber[h]||(c+="px"),k.clearCloneStyle||""!==c||0!==b.indexOf("background")||(i[b]="inherit"),g&&"set"in g&&void 0===(c=g.set(a,c,d))||(i[b]=c)),void 0)}},css:function(a,b,c,d){var e,f,g,h=n.camelCase(b);return b=n.cssProps[h]||(n.cssProps[h]=Fb(a.style,h)),g=n.cssHooks[b]||n.cssHooks[h],g&&"get"in g&&(e=g.get(a,!0,c)),void 0===e&&(e=xb(a,b,d)),"normal"===e&&b in Db&&(e=Db[b]),""===c||c?(f=parseFloat(e),c===!0||n.isNumeric(f)?f||0:e):e}}),n.each(["height","width"],function(a,b){n.cssHooks[b]={get:function(a,c,d){return c?zb.test(n.css(a,"display"))&&0===a.offsetWidth?n.swap(a,Cb,function(){return Ib(a,b,d)}):Ib(a,b,d):void 0},set:function(a,c,d){var e=d&&wb(a);return Gb(a,c,d?Hb(a,b,d,"border-box"===n.css(a,"boxSizing",!1,e),e):0)}}}),n.cssHooks.marginRight=yb(k.reliableMarginRight,function(a,b){return b?n.swap(a,{display:"inline-block"},xb,[a,"marginRight"]):void 0}),n.each({margin:"",padding:"",border:"Width"},function(a,b){n.cssHooks[a+b]={expand:function(c){for(var d=0,e={},f="string"==typeof c?c.split(" "):[c];4>d;d++)e[a+R[d]+b]=f[d]||f[d-2]||f[0];return e}},ub.test(a)||(n.cssHooks[a+b].set=Gb)}),n.fn.extend({css:function(a,b){return J(this,function(a,b,c){var d,e,f={},g=0;if(n.isArray(b)){for(d=wb(a),e=b.length;e>g;g++)f[b[g]]=n.css(a,b[g],!1,d);return f}return void 0!==c?n.style(a,b,c):n.css(a,b)},a,b,arguments.length>1)},show:function(){return Jb(this,!0)},hide:function(){return Jb(this)},toggle:function(a){return"boolean"==typeof a?a?this.show():this.hide():this.each(function(){S(this)?n(this).show():n(this).hide()})}});function Kb(a,b,c,d,e){return new Kb.prototype.init(a,b,c,d,e)}n.Tween=Kb,Kb.prototype={constructor:Kb,init:function(a,b,c,d,e,f){this.elem=a,this.prop=c,this.easing=e||"swing",this.options=b,this.start=this.now=this.cur(),this.end=d,this.unit=f||(n.cssNumber[c]?"":"px")},cur:function(){var a=Kb.propHooks[this.prop];return a&&a.get?a.get(this):Kb.propHooks._default.get(this)},run:function(a){var b,c=Kb.propHooks[this.prop];return this.pos=b=this.options.duration?n.easing[this.easing](a,this.options.duration*a,0,1,this.options.duration):a,this.now=(this.end-this.start)*b+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),c&&c.set?c.set(this):Kb.propHooks._default.set(this),this}},Kb.prototype.init.prototype=Kb.prototype,Kb.propHooks={_default:{get:function(a){var b;return null==a.elem[a.prop]||a.elem.style&&null!=a.elem.style[a.prop]?(b=n.css(a.elem,a.prop,""),b&&"auto"!==b?b:0):a.elem[a.prop]},set:function(a){n.fx.step[a.prop]?n.fx.step[a.prop](a):a.elem.style&&(null!=a.elem.style[n.cssProps[a.prop]]||n.cssHooks[a.prop])?n.style(a.elem,a.prop,a.now+a.unit):a.elem[a.prop]=a.now}}},Kb.propHooks.scrollTop=Kb.propHooks.scrollLeft={set:function(a){a.elem.nodeType&&a.elem.parentNode&&(a.elem[a.prop]=a.now)}},n.easing={linear:function(a){return a},swing:function(a){return.5-Math.cos(a*Math.PI)/2}},n.fx=Kb.prototype.init,n.fx.step={};var Lb,Mb,Nb=/^(?:toggle|show|hide)$/,Ob=new RegExp("^(?:([+-])=|)("+Q+")([a-z%]*)$","i"),Pb=/queueHooks$/,Qb=[Vb],Rb={"*":[function(a,b){var c=this.createTween(a,b),d=c.cur(),e=Ob.exec(b),f=e&&e[3]||(n.cssNumber[a]?"":"px"),g=(n.cssNumber[a]||"px"!==f&&+d)&&Ob.exec(n.css(c.elem,a)),h=1,i=20;if(g&&g[3]!==f){f=f||g[3],e=e||[],g=+d||1;do h=h||".5",g/=h,n.style(c.elem,a,g+f);while(h!==(h=c.cur()/d)&&1!==h&&--i)}return e&&(g=c.start=+g||+d||0,c.unit=f,c.end=e[1]?g+(e[1]+1)*e[2]:+e[2]),c}]};function Sb(){return setTimeout(function(){Lb=void 0}),Lb=n.now()}function Tb(a,b){var c,d=0,e={height:a};for(b=b?1:0;4>d;d+=2-b)c=R[d],e["margin"+c]=e["padding"+c]=a;return b&&(e.opacity=e.width=a),e}function Ub(a,b,c){for(var d,e=(Rb[b]||[]).concat(Rb["*"]),f=0,g=e.length;g>f;f++)if(d=e[f].call(c,b,a))return d}function Vb(a,b,c){var d,e,f,g,h,i,j,k,l=this,m={},o=a.style,p=a.nodeType&&S(a),q=L.get(a,"fxshow");c.queue||(h=n._queueHooks(a,"fx"),null==h.unqueued&&(h.unqueued=0,i=h.empty.fire,h.empty.fire=function(){h.unqueued||i()}),h.unqueued++,l.always(function(){l.always(function(){h.unqueued--,n.queue(a,"fx").length||h.empty.fire()})})),1===a.nodeType&&("height"in b||"width"in b)&&(c.overflow=[o.overflow,o.overflowX,o.overflowY],j=n.css(a,"display"),k="none"===j?L.get(a,"olddisplay")||tb(a.nodeName):j,"inline"===k&&"none"===n.css(a,"float")&&(o.display="inline-block")),c.overflow&&(o.overflow="hidden",l.always(function(){o.overflow=c.overflow[0],o.overflowX=c.overflow[1],o.overflowY=c.overflow[2]}));for(d in b)if(e=b[d],Nb.exec(e)){if(delete b[d],f=f||"toggle"===e,e===(p?"hide":"show")){if("show"!==e||!q||void 0===q[d])continue;p=!0}m[d]=q&&q[d]||n.style(a,d)}else j=void 0;if(n.isEmptyObject(m))"inline"===("none"===j?tb(a.nodeName):j)&&(o.display=j);else{q?"hidden"in q&&(p=q.hidden):q=L.access(a,"fxshow",{}),f&&(q.hidden=!p),p?n(a).show():l.done(function(){n(a).hide()}),l.done(function(){var b;L.remove(a,"fxshow");for(b in m)n.style(a,b,m[b])});for(d in m)g=Ub(p?q[d]:0,d,l),d in q||(q[d]=g.start,p&&(g.end=g.start,g.start="width"===d||"height"===d?1:0))}}function Wb(a,b){var c,d,e,f,g;for(c in a)if(d=n.camelCase(c),e=b[d],f=a[c],n.isArray(f)&&(e=f[1],f=a[c]=f[0]),c!==d&&(a[d]=f,delete a[c]),g=n.cssHooks[d],g&&"expand"in g){f=g.expand(f),delete a[d];for(c in f)c in a||(a[c]=f[c],b[c]=e)}else b[d]=e}function Xb(a,b,c){var d,e,f=0,g=Qb.length,h=n.Deferred().always(function(){delete i.elem}),i=function(){if(e)return!1;for(var b=Lb||Sb(),c=Math.max(0,j.startTime+j.duration-b),d=c/j.duration||0,f=1-d,g=0,i=j.tweens.length;i>g;g++)j.tweens[g].run(f);return h.notifyWith(a,[j,f,c]),1>f&&i?c:(h.resolveWith(a,[j]),!1)},j=h.promise({elem:a,props:n.extend({},b),opts:n.extend(!0,{specialEasing:{}},c),originalProperties:b,originalOptions:c,startTime:Lb||Sb(),duration:c.duration,tweens:[],createTween:function(b,c){var d=n.Tween(a,j.opts,b,c,j.opts.specialEasing[b]||j.opts.easing);return j.tweens.push(d),d},stop:function(b){var c=0,d=b?j.tweens.length:0;if(e)return this;for(e=!0;d>c;c++)j.tweens[c].run(1);return b?h.resolveWith(a,[j,b]):h.rejectWith(a,[j,b]),this}}),k=j.props;for(Wb(k,j.opts.specialEasing);g>f;f++)if(d=Qb[f].call(j,a,k,j.opts))return d;return n.map(k,Ub,j),n.isFunction(j.opts.start)&&j.opts.start.call(a,j),n.fx.timer(n.extend(i,{elem:a,anim:j,queue:j.opts.queue})),j.progress(j.opts.progress).done(j.opts.done,j.opts.complete).fail(j.opts.fail).always(j.opts.always)}n.Animation=n.extend(Xb,{tweener:function(a,b){n.isFunction(a)?(b=a,a=["*"]):a=a.split(" ");for(var c,d=0,e=a.length;e>d;d++)c=a[d],Rb[c]=Rb[c]||[],Rb[c].unshift(b)},prefilter:function(a,b){b?Qb.unshift(a):Qb.push(a)}}),n.speed=function(a,b,c){var d=a&&"object"==typeof a?n.extend({},a):{complete:c||!c&&b||n.isFunction(a)&&a,duration:a,easing:c&&b||b&&!n.isFunction(b)&&b};return d.duration=n.fx.off?0:"number"==typeof d.duration?d.duration:d.duration in n.fx.speeds?n.fx.speeds[d.duration]:n.fx.speeds._default,(null==d.queue||d.queue===!0)&&(d.queue="fx"),d.old=d.complete,d.complete=function(){n.isFunction(d.old)&&d.old.call(this),d.queue&&n.dequeue(this,d.queue)},d},n.fn.extend({fadeTo:function(a,b,c,d){return this.filter(S).css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){var e=n.isEmptyObject(a),f=n.speed(b,c,d),g=function(){var b=Xb(this,n.extend({},a),f);(e||L.get(this,"finish"))&&b.stop(!0)};return g.finish=g,e||f.queue===!1?this.each(g):this.queue(f.queue,g)},stop:function(a,b,c){var d=function(a){var b=a.stop;delete a.stop,b(c)};return"string"!=typeof a&&(c=b,b=a,a=void 0),b&&a!==!1&&this.queue(a||"fx",[]),this.each(function(){var b=!0,e=null!=a&&a+"queueHooks",f=n.timers,g=L.get(this);if(e)g[e]&&g[e].stop&&d(g[e]);else for(e in g)g[e]&&g[e].stop&&Pb.test(e)&&d(g[e]);for(e=f.length;e--;)f[e].elem!==this||null!=a&&f[e].queue!==a||(f[e].anim.stop(c),b=!1,f.splice(e,1));(b||!c)&&n.dequeue(this,a)})},finish:function(a){return a!==!1&&(a=a||"fx"),this.each(function(){var b,c=L.get(this),d=c[a+"queue"],e=c[a+"queueHooks"],f=n.timers,g=d?d.length:0;for(c.finish=!0,n.queue(this,a,[]),e&&e.stop&&e.stop.call(this,!0),b=f.length;b--;)f[b].elem===this&&f[b].queue===a&&(f[b].anim.stop(!0),f.splice(b,1));for(b=0;g>b;b++)d[b]&&d[b].finish&&d[b].finish.call(this);delete c.finish})}}),n.each(["toggle","show","hide"],function(a,b){var c=n.fn[b];n.fn[b]=function(a,d,e){return null==a||"boolean"==typeof a?c.apply(this,arguments):this.animate(Tb(b,!0),a,d,e)}}),n.each({slideDown:Tb("show"),slideUp:Tb("hide"),slideToggle:Tb("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){n.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),n.timers=[],n.fx.tick=function(){var a,b=0,c=n.timers;for(Lb=n.now();b<c.length;b++)a=c[b],a()||c[b]!==a||c.splice(b--,1);c.length||n.fx.stop(),Lb=void 0},n.fx.timer=function(a){n.timers.push(a),a()?n.fx.start():n.timers.pop()},n.fx.interval=13,n.fx.start=function(){Mb||(Mb=setInterval(n.fx.tick,n.fx.interval))},n.fx.stop=function(){clearInterval(Mb),Mb=null},n.fx.speeds={slow:600,fast:200,_default:400},n.fn.delay=function(a,b){return a=n.fx?n.fx.speeds[a]||a:a,b=b||"fx",this.queue(b,function(b,c){var d=setTimeout(b,a);c.stop=function(){clearTimeout(d)}})},function(){var a=l.createElement("input"),b=l.createElement("select"),c=b.appendChild(l.createElement("option"));a.type="checkbox",k.checkOn=""!==a.value,k.optSelected=c.selected,b.disabled=!0,k.optDisabled=!c.disabled,a=l.createElement("input"),a.value="t",a.type="radio",k.radioValue="t"===a.value}();var Yb,Zb,$b=n.expr.attrHandle;n.fn.extend({attr:function(a,b){return J(this,n.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){n.removeAttr(this,a)})}}),n.extend({attr:function(a,b,c){var d,e,f=a.nodeType;if(a&&3!==f&&8!==f&&2!==f)return typeof a.getAttribute===U?n.prop(a,b,c):(1===f&&n.isXMLDoc(a)||(b=b.toLowerCase(),d=n.attrHooks[b]||(n.expr.match.bool.test(b)?Zb:Yb)),void 0===c?d&&"get"in d&&null!==(e=d.get(a,b))?e:(e=n.find.attr(a,b),null==e?void 0:e):null!==c?d&&"set"in d&&void 0!==(e=d.set(a,c,b))?e:(a.setAttribute(b,c+""),c):void n.removeAttr(a,b))
},removeAttr:function(a,b){var c,d,e=0,f=b&&b.match(E);if(f&&1===a.nodeType)while(c=f[e++])d=n.propFix[c]||c,n.expr.match.bool.test(c)&&(a[d]=!1),a.removeAttribute(c)},attrHooks:{type:{set:function(a,b){if(!k.radioValue&&"radio"===b&&n.nodeName(a,"input")){var c=a.value;return a.setAttribute("type",b),c&&(a.value=c),b}}}}}),Zb={set:function(a,b,c){return b===!1?n.removeAttr(a,c):a.setAttribute(c,c),c}},n.each(n.expr.match.bool.source.match(/\w+/g),function(a,b){var c=$b[b]||n.find.attr;$b[b]=function(a,b,d){var e,f;return d||(f=$b[b],$b[b]=e,e=null!=c(a,b,d)?b.toLowerCase():null,$b[b]=f),e}});var _b=/^(?:input|select|textarea|button)$/i;n.fn.extend({prop:function(a,b){return J(this,n.prop,a,b,arguments.length>1)},removeProp:function(a){return this.each(function(){delete this[n.propFix[a]||a]})}}),n.extend({propFix:{"for":"htmlFor","class":"className"},prop:function(a,b,c){var d,e,f,g=a.nodeType;if(a&&3!==g&&8!==g&&2!==g)return f=1!==g||!n.isXMLDoc(a),f&&(b=n.propFix[b]||b,e=n.propHooks[b]),void 0!==c?e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:a[b]=c:e&&"get"in e&&null!==(d=e.get(a,b))?d:a[b]},propHooks:{tabIndex:{get:function(a){return a.hasAttribute("tabindex")||_b.test(a.nodeName)||a.href?a.tabIndex:-1}}}}),k.optSelected||(n.propHooks.selected={get:function(a){var b=a.parentNode;return b&&b.parentNode&&b.parentNode.selectedIndex,null}}),n.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){n.propFix[this.toLowerCase()]=this});var ac=/[\t\r\n\f]/g;n.fn.extend({addClass:function(a){var b,c,d,e,f,g,h="string"==typeof a&&a,i=0,j=this.length;if(n.isFunction(a))return this.each(function(b){n(this).addClass(a.call(this,b,this.className))});if(h)for(b=(a||"").match(E)||[];j>i;i++)if(c=this[i],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ac," "):" ")){f=0;while(e=b[f++])d.indexOf(" "+e+" ")<0&&(d+=e+" ");g=n.trim(d),c.className!==g&&(c.className=g)}return this},removeClass:function(a){var b,c,d,e,f,g,h=0===arguments.length||"string"==typeof a&&a,i=0,j=this.length;if(n.isFunction(a))return this.each(function(b){n(this).removeClass(a.call(this,b,this.className))});if(h)for(b=(a||"").match(E)||[];j>i;i++)if(c=this[i],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ac," "):"")){f=0;while(e=b[f++])while(d.indexOf(" "+e+" ")>=0)d=d.replace(" "+e+" "," ");g=a?n.trim(d):"",c.className!==g&&(c.className=g)}return this},toggleClass:function(a,b){var c=typeof a;return"boolean"==typeof b&&"string"===c?b?this.addClass(a):this.removeClass(a):this.each(n.isFunction(a)?function(c){n(this).toggleClass(a.call(this,c,this.className,b),b)}:function(){if("string"===c){var b,d=0,e=n(this),f=a.match(E)||[];while(b=f[d++])e.hasClass(b)?e.removeClass(b):e.addClass(b)}else(c===U||"boolean"===c)&&(this.className&&L.set(this,"__className__",this.className),this.className=this.className||a===!1?"":L.get(this,"__className__")||"")})},hasClass:function(a){for(var b=" "+a+" ",c=0,d=this.length;d>c;c++)if(1===this[c].nodeType&&(" "+this[c].className+" ").replace(ac," ").indexOf(b)>=0)return!0;return!1}});var bc=/\r/g;n.fn.extend({val:function(a){var b,c,d,e=this[0];{if(arguments.length)return d=n.isFunction(a),this.each(function(c){var e;1===this.nodeType&&(e=d?a.call(this,c,n(this).val()):a,null==e?e="":"number"==typeof e?e+="":n.isArray(e)&&(e=n.map(e,function(a){return null==a?"":a+""})),b=n.valHooks[this.type]||n.valHooks[this.nodeName.toLowerCase()],b&&"set"in b&&void 0!==b.set(this,e,"value")||(this.value=e))});if(e)return b=n.valHooks[e.type]||n.valHooks[e.nodeName.toLowerCase()],b&&"get"in b&&void 0!==(c=b.get(e,"value"))?c:(c=e.value,"string"==typeof c?c.replace(bc,""):null==c?"":c)}}}),n.extend({valHooks:{option:{get:function(a){var b=n.find.attr(a,"value");return null!=b?b:n.trim(n.text(a))}},select:{get:function(a){for(var b,c,d=a.options,e=a.selectedIndex,f="select-one"===a.type||0>e,g=f?null:[],h=f?e+1:d.length,i=0>e?h:f?e:0;h>i;i++)if(c=d[i],!(!c.selected&&i!==e||(k.optDisabled?c.disabled:null!==c.getAttribute("disabled"))||c.parentNode.disabled&&n.nodeName(c.parentNode,"optgroup"))){if(b=n(c).val(),f)return b;g.push(b)}return g},set:function(a,b){var c,d,e=a.options,f=n.makeArray(b),g=e.length;while(g--)d=e[g],(d.selected=n.inArray(d.value,f)>=0)&&(c=!0);return c||(a.selectedIndex=-1),f}}}}),n.each(["radio","checkbox"],function(){n.valHooks[this]={set:function(a,b){return n.isArray(b)?a.checked=n.inArray(n(a).val(),b)>=0:void 0}},k.checkOn||(n.valHooks[this].get=function(a){return null===a.getAttribute("value")?"on":a.value})}),n.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(a,b){n.fn[b]=function(a,c){return arguments.length>0?this.on(b,null,a,c):this.trigger(b)}}),n.fn.extend({hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)},bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return 1===arguments.length?this.off(a,"**"):this.off(b,a||"**",c)}});var cc=n.now(),dc=/\?/;n.parseJSON=function(a){return JSON.parse(a+"")},n.parseXML=function(a){var b,c;if(!a||"string"!=typeof a)return null;try{c=new DOMParser,b=c.parseFromString(a,"text/xml")}catch(d){b=void 0}return(!b||b.getElementsByTagName("parsererror").length)&&n.error("Invalid XML: "+a),b};var ec,fc,gc=/#.*$/,hc=/([?&])_=[^&]*/,ic=/^(.*?):[ \t]*([^\r\n]*)$/gm,jc=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,kc=/^(?:GET|HEAD)$/,lc=/^\/\//,mc=/^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,nc={},oc={},pc="*/".concat("*");try{fc=location.href}catch(qc){fc=l.createElement("a"),fc.href="",fc=fc.href}ec=mc.exec(fc.toLowerCase())||[];function rc(a){return function(b,c){"string"!=typeof b&&(c=b,b="*");var d,e=0,f=b.toLowerCase().match(E)||[];if(n.isFunction(c))while(d=f[e++])"+"===d[0]?(d=d.slice(1)||"*",(a[d]=a[d]||[]).unshift(c)):(a[d]=a[d]||[]).push(c)}}function sc(a,b,c,d){var e={},f=a===oc;function g(h){var i;return e[h]=!0,n.each(a[h]||[],function(a,h){var j=h(b,c,d);return"string"!=typeof j||f||e[j]?f?!(i=j):void 0:(b.dataTypes.unshift(j),g(j),!1)}),i}return g(b.dataTypes[0])||!e["*"]&&g("*")}function tc(a,b){var c,d,e=n.ajaxSettings.flatOptions||{};for(c in b)void 0!==b[c]&&((e[c]?a:d||(d={}))[c]=b[c]);return d&&n.extend(!0,a,d),a}function uc(a,b,c){var d,e,f,g,h=a.contents,i=a.dataTypes;while("*"===i[0])i.shift(),void 0===d&&(d=a.mimeType||b.getResponseHeader("Content-Type"));if(d)for(e in h)if(h[e]&&h[e].test(d)){i.unshift(e);break}if(i[0]in c)f=i[0];else{for(e in c){if(!i[0]||a.converters[e+" "+i[0]]){f=e;break}g||(g=e)}f=f||g}return f?(f!==i[0]&&i.unshift(f),c[f]):void 0}function vc(a,b,c,d){var e,f,g,h,i,j={},k=a.dataTypes.slice();if(k[1])for(g in a.converters)j[g.toLowerCase()]=a.converters[g];f=k.shift();while(f)if(a.responseFields[f]&&(c[a.responseFields[f]]=b),!i&&d&&a.dataFilter&&(b=a.dataFilter(b,a.dataType)),i=f,f=k.shift())if("*"===f)f=i;else if("*"!==i&&i!==f){if(g=j[i+" "+f]||j["* "+f],!g)for(e in j)if(h=e.split(" "),h[1]===f&&(g=j[i+" "+h[0]]||j["* "+h[0]])){g===!0?g=j[e]:j[e]!==!0&&(f=h[0],k.unshift(h[1]));break}if(g!==!0)if(g&&a["throws"])b=g(b);else try{b=g(b)}catch(l){return{state:"parsererror",error:g?l:"No conversion from "+i+" to "+f}}}return{state:"success",data:b}}n.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:fc,type:"GET",isLocal:jc.test(ec[1]),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":pc,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":n.parseJSON,"text xml":n.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(a,b){return b?tc(tc(a,n.ajaxSettings),b):tc(n.ajaxSettings,a)},ajaxPrefilter:rc(nc),ajaxTransport:rc(oc),ajax:function(a,b){"object"==typeof a&&(b=a,a=void 0),b=b||{};var c,d,e,f,g,h,i,j,k=n.ajaxSetup({},b),l=k.context||k,m=k.context&&(l.nodeType||l.jquery)?n(l):n.event,o=n.Deferred(),p=n.Callbacks("once memory"),q=k.statusCode||{},r={},s={},t=0,u="canceled",v={readyState:0,getResponseHeader:function(a){var b;if(2===t){if(!f){f={};while(b=ic.exec(e))f[b[1].toLowerCase()]=b[2]}b=f[a.toLowerCase()]}return null==b?null:b},getAllResponseHeaders:function(){return 2===t?e:null},setRequestHeader:function(a,b){var c=a.toLowerCase();return t||(a=s[c]=s[c]||a,r[a]=b),this},overrideMimeType:function(a){return t||(k.mimeType=a),this},statusCode:function(a){var b;if(a)if(2>t)for(b in a)q[b]=[q[b],a[b]];else v.always(a[v.status]);return this},abort:function(a){var b=a||u;return c&&c.abort(b),x(0,b),this}};if(o.promise(v).complete=p.add,v.success=v.done,v.error=v.fail,k.url=((a||k.url||fc)+"").replace(gc,"").replace(lc,ec[1]+"//"),k.type=b.method||b.type||k.method||k.type,k.dataTypes=n.trim(k.dataType||"*").toLowerCase().match(E)||[""],null==k.crossDomain&&(h=mc.exec(k.url.toLowerCase()),k.crossDomain=!(!h||h[1]===ec[1]&&h[2]===ec[2]&&(h[3]||("http:"===h[1]?"80":"443"))===(ec[3]||("http:"===ec[1]?"80":"443")))),k.data&&k.processData&&"string"!=typeof k.data&&(k.data=n.param(k.data,k.traditional)),sc(nc,k,b,v),2===t)return v;i=k.global,i&&0===n.active++&&n.event.trigger("ajaxStart"),k.type=k.type.toUpperCase(),k.hasContent=!kc.test(k.type),d=k.url,k.hasContent||(k.data&&(d=k.url+=(dc.test(d)?"&":"?")+k.data,delete k.data),k.cache===!1&&(k.url=hc.test(d)?d.replace(hc,"$1_="+cc++):d+(dc.test(d)?"&":"?")+"_="+cc++)),k.ifModified&&(n.lastModified[d]&&v.setRequestHeader("If-Modified-Since",n.lastModified[d]),n.etag[d]&&v.setRequestHeader("If-None-Match",n.etag[d])),(k.data&&k.hasContent&&k.contentType!==!1||b.contentType)&&v.setRequestHeader("Content-Type",k.contentType),v.setRequestHeader("Accept",k.dataTypes[0]&&k.accepts[k.dataTypes[0]]?k.accepts[k.dataTypes[0]]+("*"!==k.dataTypes[0]?", "+pc+"; q=0.01":""):k.accepts["*"]);for(j in k.headers)v.setRequestHeader(j,k.headers[j]);if(k.beforeSend&&(k.beforeSend.call(l,v,k)===!1||2===t))return v.abort();u="abort";for(j in{success:1,error:1,complete:1})v[j](k[j]);if(c=sc(oc,k,b,v)){v.readyState=1,i&&m.trigger("ajaxSend",[v,k]),k.async&&k.timeout>0&&(g=setTimeout(function(){v.abort("timeout")},k.timeout));try{t=1,c.send(r,x)}catch(w){if(!(2>t))throw w;x(-1,w)}}else x(-1,"No Transport");function x(a,b,f,h){var j,r,s,u,w,x=b;2!==t&&(t=2,g&&clearTimeout(g),c=void 0,e=h||"",v.readyState=a>0?4:0,j=a>=200&&300>a||304===a,f&&(u=uc(k,v,f)),u=vc(k,u,v,j),j?(k.ifModified&&(w=v.getResponseHeader("Last-Modified"),w&&(n.lastModified[d]=w),w=v.getResponseHeader("etag"),w&&(n.etag[d]=w)),204===a||"HEAD"===k.type?x="nocontent":304===a?x="notmodified":(x=u.state,r=u.data,s=u.error,j=!s)):(s=x,(a||!x)&&(x="error",0>a&&(a=0))),v.status=a,v.statusText=(b||x)+"",j?o.resolveWith(l,[r,x,v]):o.rejectWith(l,[v,x,s]),v.statusCode(q),q=void 0,i&&m.trigger(j?"ajaxSuccess":"ajaxError",[v,k,j?r:s]),p.fireWith(l,[v,x]),i&&(m.trigger("ajaxComplete",[v,k]),--n.active||n.event.trigger("ajaxStop")))}return v},getJSON:function(a,b,c){return n.get(a,b,c,"json")},getScript:function(a,b){return n.get(a,void 0,b,"script")}}),n.each(["get","post"],function(a,b){n[b]=function(a,c,d,e){return n.isFunction(c)&&(e=e||d,d=c,c=void 0),n.ajax({url:a,type:b,dataType:e,data:c,success:d})}}),n.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(a,b){n.fn[b]=function(a){return this.on(b,a)}}),n._evalUrl=function(a){return n.ajax({url:a,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0})},n.fn.extend({wrapAll:function(a){var b;return n.isFunction(a)?this.each(function(b){n(this).wrapAll(a.call(this,b))}):(this[0]&&(b=n(a,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){var a=this;while(a.firstElementChild)a=a.firstElementChild;return a}).append(this)),this)},wrapInner:function(a){return this.each(n.isFunction(a)?function(b){n(this).wrapInner(a.call(this,b))}:function(){var b=n(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=n.isFunction(a);return this.each(function(c){n(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(){return this.parent().each(function(){n.nodeName(this,"body")||n(this).replaceWith(this.childNodes)}).end()}}),n.expr.filters.hidden=function(a){return a.offsetWidth<=0&&a.offsetHeight<=0},n.expr.filters.visible=function(a){return!n.expr.filters.hidden(a)};var wc=/%20/g,xc=/\[\]$/,yc=/\r?\n/g,zc=/^(?:submit|button|image|reset|file)$/i,Ac=/^(?:input|select|textarea|keygen)/i;function Bc(a,b,c,d){var e;if(n.isArray(b))n.each(b,function(b,e){c||xc.test(a)?d(a,e):Bc(a+"["+("object"==typeof e?b:"")+"]",e,c,d)});else if(c||"object"!==n.type(b))d(a,b);else for(e in b)Bc(a+"["+e+"]",b[e],c,d)}n.param=function(a,b){var c,d=[],e=function(a,b){b=n.isFunction(b)?b():null==b?"":b,d[d.length]=encodeURIComponent(a)+"="+encodeURIComponent(b)};if(void 0===b&&(b=n.ajaxSettings&&n.ajaxSettings.traditional),n.isArray(a)||a.jquery&&!n.isPlainObject(a))n.each(a,function(){e(this.name,this.value)});else for(c in a)Bc(c,a[c],b,e);return d.join("&").replace(wc,"+")},n.fn.extend({serialize:function(){return n.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var a=n.prop(this,"elements");return a?n.makeArray(a):this}).filter(function(){var a=this.type;return this.name&&!n(this).is(":disabled")&&Ac.test(this.nodeName)&&!zc.test(a)&&(this.checked||!T.test(a))}).map(function(a,b){var c=n(this).val();return null==c?null:n.isArray(c)?n.map(c,function(a){return{name:b.name,value:a.replace(yc,"\r\n")}}):{name:b.name,value:c.replace(yc,"\r\n")}}).get()}}),n.ajaxSettings.xhr=function(){try{return new XMLHttpRequest}catch(a){}};var Cc=0,Dc={},Ec={0:200,1223:204},Fc=n.ajaxSettings.xhr();a.ActiveXObject&&n(a).on("unload",function(){for(var a in Dc)Dc[a]()}),k.cors=!!Fc&&"withCredentials"in Fc,k.ajax=Fc=!!Fc,n.ajaxTransport(function(a){var b;return k.cors||Fc&&!a.crossDomain?{send:function(c,d){var e,f=a.xhr(),g=++Cc;if(f.open(a.type,a.url,a.async,a.username,a.password),a.xhrFields)for(e in a.xhrFields)f[e]=a.xhrFields[e];a.mimeType&&f.overrideMimeType&&f.overrideMimeType(a.mimeType),a.crossDomain||c["X-Requested-With"]||(c["X-Requested-With"]="XMLHttpRequest");for(e in c)f.setRequestHeader(e,c[e]);b=function(a){return function(){b&&(delete Dc[g],b=f.onload=f.onerror=null,"abort"===a?f.abort():"error"===a?d(f.status,f.statusText):d(Ec[f.status]||f.status,f.statusText,"string"==typeof f.responseText?{text:f.responseText}:void 0,f.getAllResponseHeaders()))}},f.onload=b(),f.onerror=b("error"),b=Dc[g]=b("abort");try{f.send(a.hasContent&&a.data||null)}catch(h){if(b)throw h}},abort:function(){b&&b()}}:void 0}),n.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/(?:java|ecma)script/},converters:{"text script":function(a){return n.globalEval(a),a}}}),n.ajaxPrefilter("script",function(a){void 0===a.cache&&(a.cache=!1),a.crossDomain&&(a.type="GET")}),n.ajaxTransport("script",function(a){if(a.crossDomain){var b,c;return{send:function(d,e){b=n("<script>").prop({async:!0,charset:a.scriptCharset,src:a.url}).on("load error",c=function(a){b.remove(),c=null,a&&e("error"===a.type?404:200,a.type)}),l.head.appendChild(b[0])},abort:function(){c&&c()}}}});var Gc=[],Hc=/(=)\?(?=&|$)|\?\?/;n.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var a=Gc.pop()||n.expando+"_"+cc++;return this[a]=!0,a}}),n.ajaxPrefilter("json jsonp",function(b,c,d){var e,f,g,h=b.jsonp!==!1&&(Hc.test(b.url)?"url":"string"==typeof b.data&&!(b.contentType||"").indexOf("application/x-www-form-urlencoded")&&Hc.test(b.data)&&"data");return h||"jsonp"===b.dataTypes[0]?(e=b.jsonpCallback=n.isFunction(b.jsonpCallback)?b.jsonpCallback():b.jsonpCallback,h?b[h]=b[h].replace(Hc,"$1"+e):b.jsonp!==!1&&(b.url+=(dc.test(b.url)?"&":"?")+b.jsonp+"="+e),b.converters["script json"]=function(){return g||n.error(e+" was not called"),g[0]},b.dataTypes[0]="json",f=a[e],a[e]=function(){g=arguments},d.always(function(){a[e]=f,b[e]&&(b.jsonpCallback=c.jsonpCallback,Gc.push(e)),g&&n.isFunction(f)&&f(g[0]),g=f=void 0}),"script"):void 0}),n.parseHTML=function(a,b,c){if(!a||"string"!=typeof a)return null;"boolean"==typeof b&&(c=b,b=!1),b=b||l;var d=v.exec(a),e=!c&&[];return d?[b.createElement(d[1])]:(d=n.buildFragment([a],b,e),e&&e.length&&n(e).remove(),n.merge([],d.childNodes))};var Ic=n.fn.load;n.fn.load=function(a,b,c){if("string"!=typeof a&&Ic)return Ic.apply(this,arguments);var d,e,f,g=this,h=a.indexOf(" ");return h>=0&&(d=n.trim(a.slice(h)),a=a.slice(0,h)),n.isFunction(b)?(c=b,b=void 0):b&&"object"==typeof b&&(e="POST"),g.length>0&&n.ajax({url:a,type:e,dataType:"html",data:b}).done(function(a){f=arguments,g.html(d?n("<div>").append(n.parseHTML(a)).find(d):a)}).complete(c&&function(a,b){g.each(c,f||[a.responseText,b,a])}),this},n.expr.filters.animated=function(a){return n.grep(n.timers,function(b){return a===b.elem}).length};var Jc=a.document.documentElement;function Kc(a){return n.isWindow(a)?a:9===a.nodeType&&a.defaultView}n.offset={setOffset:function(a,b,c){var d,e,f,g,h,i,j,k=n.css(a,"position"),l=n(a),m={};"static"===k&&(a.style.position="relative"),h=l.offset(),f=n.css(a,"top"),i=n.css(a,"left"),j=("absolute"===k||"fixed"===k)&&(f+i).indexOf("auto")>-1,j?(d=l.position(),g=d.top,e=d.left):(g=parseFloat(f)||0,e=parseFloat(i)||0),n.isFunction(b)&&(b=b.call(a,c,h)),null!=b.top&&(m.top=b.top-h.top+g),null!=b.left&&(m.left=b.left-h.left+e),"using"in b?b.using.call(a,m):l.css(m)}},n.fn.extend({offset:function(a){if(arguments.length)return void 0===a?this:this.each(function(b){n.offset.setOffset(this,a,b)});var b,c,d=this[0],e={top:0,left:0},f=d&&d.ownerDocument;if(f)return b=f.documentElement,n.contains(b,d)?(typeof d.getBoundingClientRect!==U&&(e=d.getBoundingClientRect()),c=Kc(f),{top:e.top+c.pageYOffset-b.clientTop,left:e.left+c.pageXOffset-b.clientLeft}):e},position:function(){if(this[0]){var a,b,c=this[0],d={top:0,left:0};return"fixed"===n.css(c,"position")?b=c.getBoundingClientRect():(a=this.offsetParent(),b=this.offset(),n.nodeName(a[0],"html")||(d=a.offset()),d.top+=n.css(a[0],"borderTopWidth",!0),d.left+=n.css(a[0],"borderLeftWidth",!0)),{top:b.top-d.top-n.css(c,"marginTop",!0),left:b.left-d.left-n.css(c,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var a=this.offsetParent||Jc;while(a&&!n.nodeName(a,"html")&&"static"===n.css(a,"position"))a=a.offsetParent;return a||Jc})}}),n.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(b,c){var d="pageYOffset"===c;n.fn[b]=function(e){return J(this,function(b,e,f){var g=Kc(b);return void 0===f?g?g[c]:b[e]:void(g?g.scrollTo(d?a.pageXOffset:f,d?f:a.pageYOffset):b[e]=f)},b,e,arguments.length,null)}}),n.each(["top","left"],function(a,b){n.cssHooks[b]=yb(k.pixelPosition,function(a,c){return c?(c=xb(a,b),vb.test(c)?n(a).position()[b]+"px":c):void 0})}),n.each({Height:"height",Width:"width"},function(a,b){n.each({padding:"inner"+a,content:b,"":"outer"+a},function(c,d){n.fn[d]=function(d,e){var f=arguments.length&&(c||"boolean"!=typeof d),g=c||(d===!0||e===!0?"margin":"border");return J(this,function(b,c,d){var e;return n.isWindow(b)?b.document.documentElement["client"+a]:9===b.nodeType?(e=b.documentElement,Math.max(b.body["scroll"+a],e["scroll"+a],b.body["offset"+a],e["offset"+a],e["client"+a])):void 0===d?n.css(b,c,g):n.style(b,c,d,g)},b,f?d:void 0,f,null)}})}),n.fn.size=function(){return this.length},n.fn.andSelf=n.fn.addBack,"function"==typeof define&&define.amd&&define("jquery",[],function(){return n});var Lc=a.jQuery,Mc=a.$;return n.noConflict=function(b){return a.$===n&&(a.$=Mc),b&&a.jQuery===n&&(a.jQuery=Lc),n},typeof b===U&&(a.jQuery=a.$=n),n});
Opal.loaded(["jquery"]);
/* Generated by Opal 0.9.2 */
Opal.modules["opal"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require']);
  self.$require("opal/base");
  self.$require("opal/mini");
  self.$require("corelib/array/inheritance");
  self.$require("corelib/string/inheritance");
  self.$require("corelib/string/encoding");
  self.$require("corelib/math");
  self.$require("corelib/complex");
  self.$require("corelib/rational");
  self.$require("corelib/time");
  self.$require("corelib/struct");
  self.$require("corelib/io");
  self.$require("corelib/main");
  self.$require("corelib/dir");
  self.$require("corelib/file");
  self.$require("corelib/process");
  return self.$require("corelib/unsupported");
};

/* Generated by Opal 0.9.2 */
Opal.modules["native"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $range = Opal.range, $hash2 = Opal.hash2, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$try_convert', '$native?', '$respond_to?', '$to_n', '$raise', '$inspect', '$Native', '$proc', '$map!', '$end_with?', '$define_method', '$[]', '$convert', '$call', '$to_proc', '$new', '$each', '$native_reader', '$native_writer', '$extend', '$is_a?', '$map', '$alias_method', '$to_a', '$_Array', '$include', '$method_missing', '$bind', '$instance_method', '$[]=', '$slice', '$-', '$length', '$enum_for', '$===', '$>=', '$<<', '$each_pair', '$_initialize', '$name', '$exiting_mid', '$native_module']);
  (function($base) {
    var $Native, self = $Native = $module($base, 'Native');

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2;

    Opal.defs(self, '$is_a?', function(object, klass) {
      var self = this;

      
      try {
        return object instanceof self.$try_convert(klass);
      }
      catch (e) {
        return false;
      }
    ;
    });

    Opal.defs(self, '$try_convert', function(value) {
      var self = this;

      
      if (self['$native?'](value)) {
        return value;
      }
      else if (value['$respond_to?']("to_n")) {
        return value.$to_n();
      }
      else {
        return nil;
      }
    ;
    });

    Opal.defs(self, '$convert', function(value) {
      var self = this;

      
      if (self['$native?'](value)) {
        return value;
      }
      else if (value['$respond_to?']("to_n")) {
        return value.$to_n();
      }
      else {
        self.$raise($scope.get('ArgumentError'), "" + (value.$inspect()) + " isn't native");
      }
    ;
    });

    Opal.defs(self, '$call', TMP_1 = function(obj, key) {
      var self = this, $iter = TMP_1.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 2;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 2];
      }
      TMP_1.$$p = null;
      
      var prop = obj[key];

      if (prop instanceof Function) {
        var converted = new Array(args.length);

        for (var i = 0, length = args.length; i < length; i++) {
          var item = args[i],
              conv = self.$try_convert(item);

          converted[i] = conv === nil ? item : conv;
        }

        if (block !== nil) {
          converted.push(block);
        }

        return self.$Native(prop.apply(obj, converted));
      }
      else {
        return self.$Native(prop);
      }
    ;
    });

    Opal.defs(self, '$proc', TMP_2 = function() {
      var $a, $b, TMP_3, self = this, $iter = TMP_2.$$p, block = $iter || nil;

      TMP_2.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        self.$raise($scope.get('LocalJumpError'), "no block given")
      };
      return ($a = ($b = $scope.get('Kernel')).$proc, $a.$$p = (TMP_3 = function(args){var self = TMP_3.$$s || this, $a, $b, TMP_4, instance = nil;
args = $slice.call(arguments, 0);
      ($a = ($b = args)['$map!'], $a.$$p = (TMP_4 = function(arg){var self = TMP_4.$$s || this;
if (arg == null) arg = nil;
        return self.$Native(arg)}, TMP_4.$$s = self, TMP_4), $a).call($b);
        instance = self.$Native(this);
        
        // if global is current scope, run the block in the scope it was defined
        if (this === Opal.global) {
          return block.apply(self, args);
        }

        var self_ = block.$$s;
        block.$$s = null;

        try {
          return block.apply(instance, args);
        }
        finally {
          block.$$s = self_;
        }
      ;}, TMP_3.$$s = self, TMP_3), $a).call($b);
    });

    (function($base) {
      var $Helpers, self = $Helpers = $module($base, 'Helpers');

      var def = self.$$proto, $scope = self.$$scope;

      Opal.defn(self, '$alias_native', function(new$, old, $kwargs) {
        var $a, $b, TMP_5, $c, TMP_6, $d, TMP_7, self = this, as = nil;

        if (old == null) {
          old = new$
        }
        if (old == null) {
          $kwargs = $hash2([], {});
        }
        else if (old.$$is_hash) {
          $kwargs = old;
          old = new$;
        }
        else if ($kwargs == null) {
          $kwargs = $hash2([], {});
        }
        if (!$kwargs.$$is_hash) {
          throw Opal.ArgumentError.$new('expecting keyword args');
        }
        if ((as = $kwargs.$$smap['as']) == null) {
          as = nil
        }
        if ((($a = old['$end_with?']("=")) !== nil && (!$a.$$is_boolean || $a == true))) {
          return ($a = ($b = self).$define_method, $a.$$p = (TMP_5 = function(value){var self = TMP_5.$$s || this;
            if (self["native"] == null) self["native"] = nil;
if (value == null) value = nil;
          self["native"][old['$[]']($range(0, -2, false))] = $scope.get('Native').$convert(value);
            return value;}, TMP_5.$$s = self, TMP_5), $a).call($b, new$)
        } else if (as !== false && as !== nil) {
          return ($a = ($c = self).$define_method, $a.$$p = (TMP_6 = function(args){var self = TMP_6.$$s || this, block, $a, $b, $c, value = nil;
            if (self["native"] == null) self["native"] = nil;
args = $slice.call(arguments, 0);
            block = TMP_6.$$p || nil, TMP_6.$$p = null;
          if ((($a = value = ($b = ($c = $scope.get('Native')).$call, $b.$$p = block.$to_proc(), $b).apply($c, [self["native"], old].concat(Opal.to_a(args)))) !== nil && (!$a.$$is_boolean || $a == true))) {
              return as.$new(value.$to_n())
              } else {
              return nil
            }}, TMP_6.$$s = self, TMP_6), $a).call($c, new$)
          } else {
          return ($a = ($d = self).$define_method, $a.$$p = (TMP_7 = function(args){var self = TMP_7.$$s || this, block, $a, $b;
            if (self["native"] == null) self["native"] = nil;
args = $slice.call(arguments, 0);
            block = TMP_7.$$p || nil, TMP_7.$$p = null;
          return ($a = ($b = $scope.get('Native')).$call, $a.$$p = block.$to_proc(), $a).apply($b, [self["native"], old].concat(Opal.to_a(args)))}, TMP_7.$$s = self, TMP_7), $a).call($d, new$)
        };
      });

      Opal.defn(self, '$native_reader', function() {
        var $a, $b, TMP_8, self = this, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var names = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          names[$splat_index] = arguments[$splat_index + 0];
        }
        return ($a = ($b = names).$each, $a.$$p = (TMP_8 = function(name){var self = TMP_8.$$s || this, $a, $b, TMP_9;
if (name == null) name = nil;
        return ($a = ($b = self).$define_method, $a.$$p = (TMP_9 = function(){var self = TMP_9.$$s || this;
            if (self["native"] == null) self["native"] = nil;

          return self.$Native(self["native"][name])}, TMP_9.$$s = self, TMP_9), $a).call($b, name)}, TMP_8.$$s = self, TMP_8), $a).call($b);
      });

      Opal.defn(self, '$native_writer', function() {
        var $a, $b, TMP_10, self = this, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var names = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          names[$splat_index] = arguments[$splat_index + 0];
        }
        return ($a = ($b = names).$each, $a.$$p = (TMP_10 = function(name){var self = TMP_10.$$s || this, $a, $b, TMP_11;
if (name == null) name = nil;
        return ($a = ($b = self).$define_method, $a.$$p = (TMP_11 = function(value){var self = TMP_11.$$s || this;
            if (self["native"] == null) self["native"] = nil;
if (value == null) value = nil;
          return self.$Native(self["native"][name] = value)}, TMP_11.$$s = self, TMP_11), $a).call($b, "" + (name) + "=")}, TMP_10.$$s = self, TMP_10), $a).call($b);
      });

      Opal.defn(self, '$native_accessor', function() {
        var $a, $b, self = this, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var names = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          names[$splat_index] = arguments[$splat_index + 0];
        }
        ($a = self).$native_reader.apply($a, Opal.to_a(names));
        return ($b = self).$native_writer.apply($b, Opal.to_a(names));
      });
    })($scope.base);

    Opal.defs(self, '$included', function(klass) {
      var self = this;

      return klass.$extend($scope.get('Helpers'));
    });

    Opal.defn(self, '$initialize', function(native$) {
      var $a, self = this;

      if ((($a = $scope.get('Kernel')['$native?'](native$)) !== nil && (!$a.$$is_boolean || $a == true))) {
        } else {
        $scope.get('Kernel').$raise($scope.get('ArgumentError'), "" + (native$.$inspect()) + " isn't native")
      };
      return self["native"] = native$;
    });

    Opal.defn(self, '$to_n', function() {
      var self = this;
      if (self["native"] == null) self["native"] = nil;

      return self["native"];
    });
  })($scope.base);
  (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, TMP_14;

    Opal.defn(self, '$native?', function(value) {
      var self = this;

      return value == null || !value.$$class;
    });

    Opal.defn(self, '$Native', function(obj) {
      var $a, $b, TMP_12, $c, TMP_13, self = this;

      if ((($a = obj == null) !== nil && (!$a.$$is_boolean || $a == true))) {
        return nil
      } else if ((($a = self['$native?'](obj)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return (($scope.get('Native')).$$scope.get('Object')).$new(obj)
      } else if ((($a = obj['$is_a?']($scope.get('Array'))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return ($a = ($b = obj).$map, $a.$$p = (TMP_12 = function(o){var self = TMP_12.$$s || this;
if (o == null) o = nil;
        return self.$Native(o)}, TMP_12.$$s = self, TMP_12), $a).call($b)
      } else if ((($a = obj['$is_a?']($scope.get('Proc'))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return ($a = ($c = self).$proc, $a.$$p = (TMP_13 = function(args){var self = TMP_13.$$s || this, block, $a, $b;
args = $slice.call(arguments, 0);
          block = TMP_13.$$p || nil, TMP_13.$$p = null;
        return self.$Native(($a = ($b = obj).$call, $a.$$p = block.$to_proc(), $a).apply($b, Opal.to_a(args)))}, TMP_13.$$s = self, TMP_13), $a).call($c)
        } else {
        return obj
      };
    });

    self.$alias_method("_Array", "Array");

    Opal.defn(self, '$Array', TMP_14 = function(object) {
      var $a, $b, self = this, $iter = TMP_14.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 1;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 1];
      }
      TMP_14.$$p = null;
      if ((($a = self['$native?'](object)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return ($a = ($b = (($scope.get('Native')).$$scope.get('Array'))).$new, $a.$$p = block.$to_proc(), $a).apply($b, [object].concat(Opal.to_a(args))).$to_a()};
      return self.$_Array(object);
    });
  })($scope.base);
  (function($base, $super) {
    function $Object(){};
    var self = $Object = $klass($base, $super, 'Object', $Object);

    var def = self.$$proto, $scope = self.$$scope, TMP_15, TMP_16, TMP_17;

    def["native"] = nil;
    self.$include(Opal.get('Native'));

    Opal.defn(self, '$==', function(other) {
      var self = this;

      return self["native"] === $scope.get('Native').$try_convert(other);
    });

    Opal.defn(self, '$has_key?', function(name) {
      var self = this;

      return Opal.hasOwnProperty.call(self["native"], name);
    });

    Opal.alias(self, 'key?', 'has_key?');

    Opal.alias(self, 'include?', 'has_key?');

    Opal.alias(self, 'member?', 'has_key?');

    Opal.defn(self, '$each', TMP_15 = function() {
      var $a, self = this, $iter = TMP_15.$$p, $yield = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      TMP_15.$$p = null;
      if (($yield !== nil)) {
        
        for (var key in self["native"]) {
          ((($a = Opal.yieldX($yield, [key, self["native"][key]])) === $breaker) ? $breaker.$v : $a)
        }
      ;
        return self;
        } else {
        return ($a = self).$method_missing.apply($a, ["each"].concat(Opal.to_a(args)))
      };
    });

    Opal.defn(self, '$[]', function(key) {
      var self = this;

      
      var prop = self["native"][key];

      if (prop instanceof Function) {
        return prop;
      }
      else {
        return Opal.get('Native').$call(self["native"], key)
      }
    ;
    });

    Opal.defn(self, '$[]=', function(key, value) {
      var $a, self = this, native$ = nil;

      native$ = $scope.get('Native').$try_convert(value);
      if ((($a = native$ === nil) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self["native"][key] = value;
        } else {
        return self["native"][key] = native$;
      };
    });

    Opal.defn(self, '$merge!', function(other) {
      var self = this;

      
      other = $scope.get('Native').$convert(other);

      for (var prop in other) {
        self["native"][prop] = other[prop];
      }
    ;
      return self;
    });

    Opal.defn(self, '$respond_to?', function(name, include_all) {
      var self = this;

      if (include_all == null) {
        include_all = false
      }
      return $scope.get('Kernel').$instance_method("respond_to?").$bind(self).$call(name, include_all);
    });

    Opal.defn(self, '$respond_to_missing?', function(name, include_all) {
      var self = this;

      if (include_all == null) {
        include_all = false
      }
      return Opal.hasOwnProperty.call(self["native"], name);
    });

    Opal.defn(self, '$method_missing', TMP_16 = function(mid) {
      var $a, $b, self = this, $iter = TMP_16.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 1;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 1];
      }
      TMP_16.$$p = null;
      
      if (mid.charAt(mid.length - 1) === '=') {
        return self['$[]='](mid.$slice(0, $rb_minus(mid.$length(), 1)), args['$[]'](0));
      }
      else {
        return ($a = ($b = Opal.get('Native')).$call, $a.$$p = block.$to_proc(), $a).apply($b, [self["native"], mid].concat(Opal.to_a(args)));
      }
    ;
    });

    Opal.defn(self, '$nil?', function() {
      var self = this;

      return false;
    });

    Opal.defn(self, '$is_a?', function(klass) {
      var self = this;

      return Opal.is_a(self, klass);
    });

    Opal.alias(self, 'kind_of?', 'is_a?');

    Opal.defn(self, '$instance_of?', function(klass) {
      var self = this;

      return self.$$class === klass;
    });

    Opal.defn(self, '$class', function() {
      var self = this;

      return self.$$class;
    });

    Opal.defn(self, '$to_a', TMP_17 = function(options) {
      var $a, $b, self = this, $iter = TMP_17.$$p, block = $iter || nil;

      if (options == null) {
        options = $hash2([], {})
      }
      TMP_17.$$p = null;
      return ($a = ($b = (($scope.get('Native')).$$scope.get('Array'))).$new, $a.$$p = block.$to_proc(), $a).call($b, self["native"], options).$to_a();
    });

    return (Opal.defn(self, '$inspect', function() {
      var self = this;

      return "#<Native:" + (String(self["native"])) + ">";
    }), nil) && 'inspect';
  })($scope.get('Native'), $scope.get('BasicObject'));
  (function($base, $super) {
    function $Array(){};
    var self = $Array = $klass($base, $super, 'Array', $Array);

    var def = self.$$proto, $scope = self.$$scope, TMP_18, TMP_19;

    def.named = def["native"] = def.get = def.block = def.set = def.length = nil;
    self.$include($scope.get('Native'));

    self.$include($scope.get('Enumerable'));

    Opal.defn(self, '$initialize', TMP_18 = function(native$, options) {
      var $a, self = this, $iter = TMP_18.$$p, block = $iter || nil;

      if (options == null) {
        options = $hash2([], {})
      }
      TMP_18.$$p = null;
      Opal.find_super_dispatcher(self, 'initialize', TMP_18, null).apply(self, [native$]);
      self.get = ((($a = options['$[]']("get")) !== false && $a !== nil) ? $a : options['$[]']("access"));
      self.named = options['$[]']("named");
      self.set = ((($a = options['$[]']("set")) !== false && $a !== nil) ? $a : options['$[]']("access"));
      self.length = ((($a = options['$[]']("length")) !== false && $a !== nil) ? $a : "length");
      self.block = block;
      if ((($a = self.$length() == null) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('ArgumentError'), "no length found on the array-like object")
        } else {
        return nil
      };
    });

    Opal.defn(self, '$each', TMP_19 = function() {
      var self = this, $iter = TMP_19.$$p, block = $iter || nil;

      TMP_19.$$p = null;
      if (block !== false && block !== nil) {
        } else {
        return self.$enum_for("each")
      };
      
      for (var i = 0, length = self.$length(); i < length; i++) {
        var value = Opal.yield1(block, self['$[]'](i));

        if (value === $breaker) {
          return $breaker.$v;
        }
      }
    ;
      return self;
    });

    Opal.defn(self, '$[]', function(index) {
      var $a, self = this, result = nil, $case = nil;

      result = (function() {$case = index;if ($scope.get('String')['$===']($case) || $scope.get('Symbol')['$===']($case)) {if ((($a = self.named) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self["native"][self.named](index);
        } else {
        return self["native"][index];
      }}else if ($scope.get('Integer')['$===']($case)) {if ((($a = self.get) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self["native"][self.get](index);
        } else {
        return self["native"][index];
      }}else { return nil }})();
      if (result !== false && result !== nil) {
        if ((($a = self.block) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self.block.$call(result)
          } else {
          return self.$Native(result)
        }
        } else {
        return nil
      };
    });

    Opal.defn(self, '$[]=', function(index, value) {
      var $a, self = this;

      if ((($a = self.set) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self["native"][self.set](index, $scope.get('Native').$convert(value));
        } else {
        return self["native"][index] = $scope.get('Native').$convert(value);
      };
    });

    Opal.defn(self, '$last', function(count) {
      var $a, $b, self = this, index = nil, result = nil;

      if (count == null) {
        count = nil
      }
      if (count !== false && count !== nil) {
        index = $rb_minus(self.$length(), 1);
        result = [];
        while ((($b = $rb_ge(index, 0)) !== nil && (!$b.$$is_boolean || $b == true))) {
        result['$<<'](self['$[]'](index));
        index = $rb_minus(index, 1);};
        return result;
        } else {
        return self['$[]']($rb_minus(self.$length(), 1))
      };
    });

    Opal.defn(self, '$length', function() {
      var self = this;

      return self["native"][self.length];
    });

    Opal.alias(self, 'to_ary', 'to_a');

    return (Opal.defn(self, '$inspect', function() {
      var self = this;

      return self.$to_a().$inspect();
    }), nil) && 'inspect';
  })($scope.get('Native'), null);
  (function($base, $super) {
    function $Numeric(){};
    var self = $Numeric = $klass($base, $super, 'Numeric', $Numeric);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_n', function() {
      var self = this;

      return self.valueOf();
    }), nil) && 'to_n'
  })($scope.base, null);
  (function($base, $super) {
    function $Proc(){};
    var self = $Proc = $klass($base, $super, 'Proc', $Proc);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_n', function() {
      var self = this;

      return self;
    }), nil) && 'to_n'
  })($scope.base, null);
  (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_n', function() {
      var self = this;

      return self.valueOf();
    }), nil) && 'to_n'
  })($scope.base, null);
  (function($base, $super) {
    function $Regexp(){};
    var self = $Regexp = $klass($base, $super, 'Regexp', $Regexp);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_n', function() {
      var self = this;

      return self.valueOf();
    }), nil) && 'to_n'
  })($scope.base, null);
  (function($base, $super) {
    function $MatchData(){};
    var self = $MatchData = $klass($base, $super, 'MatchData', $MatchData);

    var def = self.$$proto, $scope = self.$$scope;

    def.matches = nil;
    return (Opal.defn(self, '$to_n', function() {
      var self = this;

      return self.matches;
    }), nil) && 'to_n'
  })($scope.base, null);
  (function($base, $super) {
    function $Struct(){};
    var self = $Struct = $klass($base, $super, 'Struct', $Struct);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_n', function() {
      var $a, $b, TMP_20, self = this, result = nil;

      result = {};
      ($a = ($b = self).$each_pair, $a.$$p = (TMP_20 = function(name, value){var self = TMP_20.$$s || this;
if (name == null) name = nil;if (value == null) value = nil;
      return result[name] = $scope.get('Native').$try_convert(value);}, TMP_20.$$s = self, TMP_20), $a).call($b);
      return result;
    }), nil) && 'to_n'
  })($scope.base, null);
  (function($base, $super) {
    function $Array(){};
    var self = $Array = $klass($base, $super, 'Array', $Array);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_n', function() {
      var self = this;

      
      var result = [];

      for (var i = 0, length = self.length; i < length; i++) {
        var obj = self[i];

        result.push($scope.get('Native').$try_convert(obj));
      }

      return result;
    
    }), nil) && 'to_n'
  })($scope.base, null);
  (function($base, $super) {
    function $Boolean(){};
    var self = $Boolean = $klass($base, $super, 'Boolean', $Boolean);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_n', function() {
      var self = this;

      return self.valueOf();
    }), nil) && 'to_n'
  })($scope.base, null);
  (function($base, $super) {
    function $Time(){};
    var self = $Time = $klass($base, $super, 'Time', $Time);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_n', function() {
      var self = this;

      return self;
    }), nil) && 'to_n'
  })($scope.base, null);
  (function($base, $super) {
    function $NilClass(){};
    var self = $NilClass = $klass($base, $super, 'NilClass', $NilClass);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_n', function() {
      var self = this;

      return null;
    }), nil) && 'to_n'
  })($scope.base, null);
  (function($base, $super) {
    function $Hash(){};
    var self = $Hash = $klass($base, $super, 'Hash', $Hash);

    var def = self.$$proto, $scope = self.$$scope, TMP_21;

    self.$alias_method("_initialize", "initialize");

    Opal.defn(self, '$initialize', TMP_21 = function(defaults) {
      var $a, $b, self = this, $iter = TMP_21.$$p, block = $iter || nil;

      TMP_21.$$p = null;
      
      if (defaults !== undefined && defaults.constructor === Object) {
        var smap = self.$$smap,
            keys = self.$$keys,
            key, value;

        for (key in defaults) {
          value = defaults[key];

          if (value && value.constructor === Object) {
            smap[key] = $scope.get('Hash').$new(value);
          } else if (value && value.$$is_array) {
            value = value.map(function(item) {
              if (item && item.constructor === Object) {
                return $scope.get('Hash').$new(item);
              }

              return item;
            });
            smap[key] = value
          } else {
            smap[key] = self.$Native(value);
          }

          keys.push(key);
        }

        return self;
      }

      return ($a = ($b = self).$_initialize, $a.$$p = block.$to_proc(), $a).call($b, defaults);
    
    });

    return (Opal.defn(self, '$to_n', function() {
      var self = this;

      
      var result = {},
          keys = self.$$keys,
          smap = self.$$smap,
          key, value;

      for (var i = 0, length = keys.length; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = smap[key];
        } else {
          key = key.key;
          value = key.value;
        }

        result[key] = $scope.get('Native').$try_convert(value);
      }

      return result;
    
    }), nil) && 'to_n';
  })($scope.base, null);
  (function($base, $super) {
    function $Module(){};
    var self = $Module = $klass($base, $super, 'Module', $Module);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$native_module', function() {
      var self = this;

      return Opal.global[self.$name()] = self;
    }), nil) && 'native_module'
  })($scope.base, null);
  (function($base, $super) {
    function $Class(){};
    var self = $Class = $klass($base, $super, 'Class', $Class);

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defn(self, '$native_alias', function(new_jsid, existing_mid) {
      var self = this;

      
      var aliased = self.$$proto['$' + existing_mid];
      if (!aliased) {
        self.$raise($scope.get('NameError').$new("undefined method `" + (existing_mid) + "' for class `" + (self.$inspect()) + "'", self.$exiting_mid()));
      }
      self.$$proto[new_jsid] = aliased;
    ;
    });

    return (Opal.defn(self, '$native_class', function() {
      var self = this;

      self.$native_module();
      self["new"] = self.$new;
    }), nil) && 'native_class';
  })($scope.base, null);
  return $gvars.$ = $gvars.global = self.$Native(Opal.global);
};

/* Generated by Opal 0.9.2 */
Opal.modules["opal/jquery/constants"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var $a, self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require', '$raise']);
  self.$require("native");
  if ((($a = ($scope.JQUERY_CLASS != null)) !== nil && (!$a.$$is_boolean || $a == true))) {
    return nil
    } else {
    return (function() {if ((($a = !!Opal.global.jQuery) !== nil && (!$a.$$is_boolean || $a == true))) {return Opal.cdecl($scope, 'JQUERY_CLASS', Opal.cdecl($scope, 'JQUERY_SELECTOR', Opal.global.jQuery))}else if ((($a = !!Opal.global.Zepto) !== nil && (!$a.$$is_boolean || $a == true))) {Opal.cdecl($scope, 'JQUERY_SELECTOR', Opal.global.Zepto);
    return Opal.cdecl($scope, 'JQUERY_CLASS', Opal.global.Zepto.zepto.Z);}else {return self.$raise($scope.get('NameError'), "Can't find jQuery or Zepto. jQuery must be included before opal-jquery")}})()
  };
};

/* Generated by Opal 0.9.2 */
Opal.modules["opal/jquery/element"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$to_n', '$include', '$each', '$alias_native', '$attr_reader', '$nil?', '$[]', '$[]=', '$raise', '$is_a?', '$has_key?', '$delete', '$call', '$gsub', '$upcase', '$compact', '$map', '$respond_to?', '$<<', '$Native', '$new']);
  self.$require("native");
  self.$require("opal/jquery/constants");
  return (function($base, $super) {
    function $Element(){};
    var self = $Element = $klass($base, $super, 'Element', $Element);

    var def = self.$$proto, $scope = self.$$scope, TMP_2, TMP_3, TMP_6, TMP_7, TMP_8;

    var $ = $scope.get('JQUERY_SELECTOR').$to_n();

    self.$include($scope.get('Enumerable'));

    Opal.defs(self, '$find', function(selector) {
      var self = this;

      return $(selector);
    });

    Opal.defs(self, '$[]', function(selector) {
      var self = this;

      return $(selector);
    });

    Opal.defs(self, '$id', function(id) {
      var self = this;

      
      var el = document.getElementById(id);

      if (!el) {
        return nil;
      }

      return $(el);
    
    });

    Opal.defs(self, '$new', function(tag) {
      var self = this;

      if (tag == null) {
        tag = "div"
      }
      return $(document.createElement(tag));
    });

    Opal.defs(self, '$parse', function(str) {
      var self = this;

      return $.parseHTML ? $($.parseHTML(str)) : $(str);
    });

    Opal.defs(self, '$expose', function() {
      var $a, $b, TMP_1, self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var methods = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        methods[$splat_index] = arguments[$splat_index + 0];
      }
      return ($a = ($b = methods).$each, $a.$$p = (TMP_1 = function(method){var self = TMP_1.$$s || this;
if (method == null) method = nil;
      return self.$alias_native(method)}, TMP_1.$$s = self, TMP_1), $a).call($b);
    });

    self.$attr_reader("selector");

    self.$alias_native("after");

    self.$alias_native("before");

    self.$alias_native("parent");

    self.$alias_native("parents");

    self.$alias_native("prev");

    self.$alias_native("remove");

    self.$alias_native("hide");

    self.$alias_native("show");

    self.$alias_native("toggle");

    self.$alias_native("children");

    self.$alias_native("blur");

    self.$alias_native("closest");

    self.$alias_native("detach");

    self.$alias_native("focus");

    self.$alias_native("find");

    self.$alias_native("next");

    self.$alias_native("siblings");

    self.$alias_native("text");

    self.$alias_native("trigger");

    self.$alias_native("append");

    self.$alias_native("prepend");

    self.$alias_native("serialize");

    self.$alias_native("is");

    self.$alias_native("filter");

    self.$alias_native("last");

    self.$alias_native("wrap");

    self.$alias_native("stop");

    self.$alias_native("clone");

    self.$alias_native("empty");

    self.$alias_native("get");

    self.$alias_native("prop");

    Opal.alias(self, 'succ', 'next');

    Opal.alias(self, '<<', 'append');

    self.$alias_native("add_class", "addClass");

    self.$alias_native("append_to", "appendTo");

    self.$alias_native("has_class?", "hasClass");

    self.$alias_native("html=", "html");

    self.$alias_native("index");

    self.$alias_native("is?", "is");

    self.$alias_native("remove_attr", "removeAttr");

    self.$alias_native("remove_class", "removeClass");

    self.$alias_native("submit");

    self.$alias_native("text=", "text");

    self.$alias_native("toggle_class", "toggleClass");

    self.$alias_native("value=", "val");

    self.$alias_native("scroll_top=", "scrollTop");

    self.$alias_native("scroll_top", "scrollTop");

    self.$alias_native("scroll_left=", "scrollLeft");

    self.$alias_native("scroll_left", "scrollLeft");

    self.$alias_native("remove_attribute", "removeAttr");

    self.$alias_native("slide_down", "slideDown");

    self.$alias_native("slide_up", "slideUp");

    self.$alias_native("slide_toggle", "slideToggle");

    self.$alias_native("fade_toggle", "fadeToggle");

    self.$alias_native("height=", "height");

    self.$alias_native("width=", "width");

    self.$alias_native("outer_width", "outerWidth");

    self.$alias_native("outer_height", "outerHeight");

    Opal.defn(self, '$to_n', function() {
      var self = this;

      return self;
    });

    Opal.defn(self, '$[]', function(name) {
      var self = this;

      
      var value = self.attr(name);
      if(value === undefined) return nil;
      return value;
    
    });

    Opal.defn(self, '$[]=', function(name, value) {
      var $a, self = this;

      if ((($a = value['$nil?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.removeAttr(name);};
      return self.attr(name, value);
    });

    Opal.defn(self, '$attr', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      
      var size = args.length;
      switch (size) {
      case 1:
        return self['$[]'](args[0]);
        break;
      case 2:
        return self['$[]='](args[0], args[1]);
        break;
      default:
        self.$raise($scope.get('ArgumentError'), "#attr only accepts 1 or 2 arguments")
      }
    ;
    });

    Opal.defn(self, '$has_attribute?', function(name) {
      var self = this;

      return self.attr(name) !== undefined;
    });

    Opal.defn(self, '$append_to_body', function() {
      var self = this;

      return self.appendTo(document.body);
    });

    Opal.defn(self, '$append_to_head', function() {
      var self = this;

      return self.appendTo(document.head);
    });

    Opal.defn(self, '$at', function(index) {
      var self = this;

      
      var length = self.length;

      if (index < 0) {
        index += length;
      }

      if (index < 0 || index >= length) {
        return nil;
      }

      return $(self[index]);
    
    });

    Opal.defn(self, '$class_name', function() {
      var self = this;

      
      var first = self[0];
      return (first && first.className) || "";
    
    });

    Opal.defn(self, '$class_name=', function(name) {
      var self = this;

      
      for (var i = 0, length = self.length; i < length; i++) {
        self[i].className = name;
      }
    
      return self;
    });

    Opal.defn(self, '$css', function(name, value) {
      var $a, $b, self = this;

      if (value == null) {
        value = nil
      }
      if ((($a = ($b = value['$nil?'](), $b !== false && $b !== nil ?name['$is_a?']($scope.get('String')) : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.css(name)
      } else if ((($a = name['$is_a?']($scope.get('Hash'))) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.css(name.$to_n());
        } else {
        self.css(name, value);
      };
      return self;
    });

    Opal.defn(self, '$animate', TMP_2 = function(params) {
      var $a, self = this, $iter = TMP_2.$$p, block = $iter || nil, speed = nil;

      TMP_2.$$p = null;
      speed = (function() {if ((($a = params['$has_key?']("speed")) !== nil && (!$a.$$is_boolean || $a == true))) {
        return params.$delete("speed")
        } else {
        return 400
      }; return nil; })();
      
      self.animate(params.$to_n(), speed, function() {
        (function() {if ((block !== nil)) {
        return block.$call()
        } else {
        return nil
      }; return nil; })()
      })
    ;
    });

    Opal.defn(self, '$data', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 0];
      }
      
      var result = self.data.apply(self, args);
      return result == null ? nil : result;
    
    });

    Opal.defn(self, '$effect', TMP_3 = function(name) {
      var $a, $b, TMP_4, $c, TMP_5, self = this, $iter = TMP_3.$$p, block = $iter || nil, $splat_index = nil;

      var array_size = arguments.length - 1;
      if(array_size < 0) array_size = 0;
      var args = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        args[$splat_index] = arguments[$splat_index + 1];
      }
      TMP_3.$$p = null;
      name = ($a = ($b = name).$gsub, $a.$$p = (TMP_4 = function(match){var self = TMP_4.$$s || this;
if (match == null) match = nil;
      return match['$[]'](1).$upcase()}, TMP_4.$$s = self, TMP_4), $a).call($b, /_\w/);
      args = ($a = ($c = args).$map, $a.$$p = (TMP_5 = function(a){var self = TMP_5.$$s || this, $a;
if (a == null) a = nil;
      if ((($a = a['$respond_to?']("to_n")) !== nil && (!$a.$$is_boolean || $a == true))) {
          return a.$to_n()
          } else {
          return nil
        }}, TMP_5.$$s = self, TMP_5), $a).call($c).$compact();
      args['$<<'](function() { (function() {if ((block !== nil)) {
        return block.$call()
        } else {
        return nil
      }; return nil; })() });
      return self[name].apply(self, args);
    });

    Opal.defn(self, '$visible?', function() {
      var self = this;

      return self.is(':visible');
    });

    Opal.defn(self, '$offset', function() {
      var self = this;

      return self.$Native(self.offset());
    });

    Opal.defn(self, '$each', TMP_6 = function() {
      var self = this, $iter = TMP_6.$$p, $yield = $iter || nil;

      TMP_6.$$p = null;
      for (var i = 0, length = self.length; i < length; i++) {
      if (Opal.yield1($yield, $(self[i])) === $breaker) return $breaker.$v;
      };
      return self;
    });

    Opal.defn(self, '$first', function() {
      var self = this;

      return self.length ? self.first() : nil;
    });

    Opal.defn(self, '$html', function(content) {
      var self = this;

      
      if (content != null) {
        return self.html(content);
      }

      return self.html() || '';
    
    });

    Opal.defn(self, '$id', function() {
      var self = this;

      
      var first = self[0];
      return (first && first.id) || "";
    
    });

    Opal.defn(self, '$id=', function(id) {
      var self = this;

      
      var first = self[0];

      if (first) {
        first.id = id;
      }

      return self;
    
    });

    Opal.defn(self, '$tag_name', function() {
      var self = this;

      return self.length > 0 ? self[0].tagName.toLowerCase() : nil;
    });

    Opal.defn(self, '$inspect', function() {
      var self = this;

      
      if      (self[0] === document) return '#<Element [document]>'
      else if (self[0] === window  ) return '#<Element [window]>'

      var val, el, str, result = [];

      for (var i = 0, length = self.length; i < length; i++) {
        el  = self[i];
        if (!el.tagName) { return '#<Element ['+el.toString()+']'; }

        str = "<" + el.tagName.toLowerCase();

        if (val = el.id) str += (' id="' + val + '"');
        if (val = el.className) str += (' class="' + val + '"');

        result.push(str + '>');
      }

      return '#<Element [' + result.join(', ') + ']>';
    
    });

    Opal.defn(self, '$to_s', function() {
      var self = this;

      
      var val, el, result = [];

      for (var i = 0, length = self.length; i < length; i++) {
        el  = self[i];

        result.push(el.outerHTML)
      }

      return result.join(', ');
    
    });

    Opal.defn(self, '$length', function() {
      var self = this;

      return self.length;
    });

    Opal.defn(self, '$any?', function() {
      var self = this;

      return self.length > 0;
    });

    Opal.defn(self, '$empty?', function() {
      var self = this;

      return self.length === 0;
    });

    Opal.alias(self, 'empty?', 'none?');

    Opal.defn(self, '$on', TMP_7 = function(name, sel) {
      var self = this, $iter = TMP_7.$$p, block = $iter || nil;

      if (sel == null) {
        sel = nil
      }
      TMP_7.$$p = null;
      
      var wrapper = function(evt) {
        if (evt.preventDefault) {
          evt = $scope.get('Event').$new(evt);
        }

        return block.apply(null, arguments);
      };

      block._jq_wrap = wrapper;

      if (sel == nil) {
        self.on(name, wrapper);
      }
      else {
        self.on(name, sel, wrapper);
      }
    ;
      return block;
    });

    Opal.defn(self, '$one', TMP_8 = function(name, sel) {
      var self = this, $iter = TMP_8.$$p, block = $iter || nil;

      if (sel == null) {
        sel = nil
      }
      TMP_8.$$p = null;
      
      var wrapper = function(evt) {
        if (evt.preventDefault) {
          evt = $scope.get('Event').$new(evt);
        }

        return block.apply(null, arguments);
      };

      block._jq_wrap = wrapper;

      if (sel == nil) {
        self.one(name, wrapper);
      }
      else {
        self.one(name, sel, wrapper);
      }
    ;
      return block;
    });

    Opal.defn(self, '$off', function(name, sel, block) {
      var self = this;

      if (block == null) {
        block = nil
      }
      
      if (sel == null) {
        return self.off(name);
      }
      else if (block === nil) {
        return self.off(name, sel._jq_wrap);
      }
      else {
        return self.off(name, sel, block._jq_wrap);
      }
    
    });

    Opal.defn(self, '$serialize_array', function() {
      var $a, $b, TMP_9, self = this;

      return ($a = ($b = (self.serializeArray())).$map, $a.$$p = (TMP_9 = function(e){var self = TMP_9.$$s || this;
if (e == null) e = nil;
      return $scope.get('Hash').$new(e)}, TMP_9.$$s = self, TMP_9), $a).call($b);
    });

    Opal.alias(self, 'size', 'length');

    Opal.defn(self, '$value', function() {
      var self = this;

      return self.val() || "";
    });

    Opal.defn(self, '$height', function() {
      var self = this;

      return self.height() || nil;
    });

    Opal.defn(self, '$width', function() {
      var self = this;

      return self.width() || nil;
    });

    return (Opal.defn(self, '$position', function() {
      var self = this;

      return self.$Native(self.position());
    }), nil) && 'position';
  })($scope.base, $scope.get('JQUERY_CLASS').$to_n());
};

/* Generated by Opal 0.9.2 */
Opal.modules["opal/jquery/window"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$include', '$find', '$on', '$to_proc', '$element', '$off', '$trigger', '$new']);
  self.$require("opal/jquery/element");
  (function($base) {
    var $Browser, self = $Browser = $module($base, 'Browser');

    var def = self.$$proto, $scope = self.$$scope;

    (function($base, $super) {
      function $Window(){};
      var self = $Window = $klass($base, $super, 'Window', $Window);

      var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2;

      def.element = nil;
      self.$include($scope.get('Native'));

      Opal.defn(self, '$element', function() {
        var $a, self = this;

        return ((($a = self.element) !== false && $a !== nil) ? $a : self.element = $scope.get('Element').$find(window));
      });

      Opal.defn(self, '$on', TMP_1 = function() {
        var $a, $b, self = this, $iter = TMP_1.$$p, block = $iter || nil, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var args = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          args[$splat_index] = arguments[$splat_index + 0];
        }
        TMP_1.$$p = null;
        return ($a = ($b = self.$element()).$on, $a.$$p = block.$to_proc(), $a).apply($b, Opal.to_a(args));
      });

      Opal.defn(self, '$off', TMP_2 = function() {
        var $a, $b, self = this, $iter = TMP_2.$$p, block = $iter || nil, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var args = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          args[$splat_index] = arguments[$splat_index + 0];
        }
        TMP_2.$$p = null;
        return ($a = ($b = self.$element()).$off, $a.$$p = block.$to_proc(), $a).apply($b, Opal.to_a(args));
      });

      return (Opal.defn(self, '$trigger', function() {
        var $a, self = this, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var args = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          args[$splat_index] = arguments[$splat_index + 0];
        }
        return ($a = self.$element()).$trigger.apply($a, Opal.to_a(args));
      }), nil) && 'trigger';
    })($scope.base, null)
  })($scope.base);
  Opal.cdecl($scope, 'Window', (($scope.get('Browser')).$$scope.get('Window')).$new(window));
  return $gvars.window = $scope.get('Window');
};

/* Generated by Opal 0.9.2 */
Opal.modules["opal/jquery/document"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$to_n', '$call', '$new', '$ready?', '$resolve', '$module_function', '$find', '$extend']);
  self.$require("opal/jquery/constants");
  self.$require("opal/jquery/element");
  (function($base) {
    var $Browser, self = $Browser = $module($base, 'Browser');

    var def = self.$$proto, $scope = self.$$scope;

    (function($base) {
      var $DocumentMethods, self = $DocumentMethods = $module($base, 'DocumentMethods');

      var def = self.$$proto, $scope = self.$$scope, TMP_1, $a, $b, TMP_3;

      var $ = $scope.get('JQUERY_SELECTOR').$to_n();

      Opal.defn(self, '$ready?', TMP_1 = function() {
        var $a, $b, self = this, $iter = TMP_1.$$p, block = $iter || nil;

        TMP_1.$$p = null;
        if ((block !== nil)) {
          if ((($a = (($b = Opal.cvars['@@__isReady']) == null ? nil : $b)) !== nil && (!$a.$$is_boolean || $a == true))) {
            return block.$call()
            } else {
            return $(block);
          }
          } else {
          return nil
        };
      });

      Opal.defn(self, '$ready', function() {
        var $a, $b, TMP_2, self = this, promise = nil;

        promise = $scope.get('Promise').$new();
        ($a = ($b = $scope.get('Document'))['$ready?'], $a.$$p = (TMP_2 = function(){var self = TMP_2.$$s || this;

        return promise.$resolve()}, TMP_2.$$s = self, TMP_2), $a).call($b);
        return promise;
      });

      self.$module_function("ready?");

      ($a = ($b = self)['$ready?'], $a.$$p = (TMP_3 = function(){var self = TMP_3.$$s || this;

      return (Opal.cvars['@@__isReady'] = true)}, TMP_3.$$s = self, TMP_3), $a).call($b);

      Opal.defn(self, '$title', function() {
        var self = this;

        return document.title;
      });

      Opal.defn(self, '$title=', function(title) {
        var self = this;

        return document.title = title;
      });

      Opal.defn(self, '$head', function() {
        var self = this;

        return $scope.get('Element').$find(document.head);
      });

      Opal.defn(self, '$body', function() {
        var self = this;

        return $scope.get('Element').$find(document.body);
      });
    })($scope.base)
  })($scope.base);
  Opal.cdecl($scope, 'Document', $scope.get('Element').$find(document));
  $scope.get('Document').$extend((($scope.get('Browser')).$$scope.get('DocumentMethods')));
  return $gvars.document = $scope.get('Document');
};

/* Generated by Opal 0.9.2 */
Opal.modules["opal/jquery/event"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$to_n', '$stop', '$prevent']);
  self.$require("opal/jquery/constants");
  return (function($base, $super) {
    function $Event(){};
    var self = $Event = $klass($base, $super, 'Event', $Event);

    var def = self.$$proto, $scope = self.$$scope;

    def["native"] = nil;
    var $ = $scope.get('JQUERY_SELECTOR').$to_n();

    Opal.defn(self, '$initialize', function(native$) {
      var self = this;

      return self["native"] = native$;
    });

    Opal.defn(self, '$to_n', function() {
      var self = this;

      return self["native"];
    });

    Opal.defn(self, '$[]', function(name) {
      var self = this;

      return self["native"][name];
    });

    Opal.defn(self, '$type', function() {
      var self = this;

      return self["native"].type;
    });

    Opal.defn(self, '$element', function() {
      var self = this;

      return $(self["native"].currentTarget);
    });

    Opal.alias(self, 'current_target', 'element');

    Opal.defn(self, '$target', function() {
      var self = this;

      return $(self["native"].target);
    });

    Opal.defn(self, '$prevented?', function() {
      var self = this;

      return self["native"].isDefaultPrevented();
    });

    Opal.defn(self, '$prevent', function() {
      var self = this;

      return self["native"].preventDefault();
    });

    Opal.defn(self, '$stopped?', function() {
      var self = this;

      return self["native"].isPropagationStopped();
    });

    Opal.defn(self, '$stop', function() {
      var self = this;

      return self["native"].stopPropagation();
    });

    Opal.defn(self, '$stop_immediate', function() {
      var self = this;

      return self["native"].stopImmediatePropagation();
    });

    Opal.defn(self, '$kill', function() {
      var self = this;

      self.$stop();
      return self.$prevent();
    });

    Opal.defn(self, '$page_x', function() {
      var self = this;

      return self["native"].pageX;
    });

    Opal.defn(self, '$page_y', function() {
      var self = this;

      return self["native"].pageY;
    });

    Opal.defn(self, '$touch_x', function() {
      var self = this;

      return self["native"].originalEvent.touches[0].pageX;
    });

    Opal.defn(self, '$touch_y', function() {
      var self = this;

      return self["native"].originalEvent.touches[0].pageY;
    });

    Opal.defn(self, '$ctrl_key', function() {
      var self = this;

      return self["native"].ctrlKey;
    });

    Opal.defn(self, '$meta_key', function() {
      var self = this;

      return self["native"].metaKey;
    });

    Opal.defn(self, '$alt_key', function() {
      var self = this;

      return self["native"].altKey;
    });

    Opal.defn(self, '$shift_key', function() {
      var self = this;

      return self["native"].shiftKey;
    });

    Opal.defn(self, '$key_code', function() {
      var self = this;

      return self["native"].keyCode;
    });

    Opal.defn(self, '$which', function() {
      var self = this;

      return self["native"].which;
    });

    Opal.alias(self, 'default_prevented?', 'prevented?');

    Opal.alias(self, 'prevent_default', 'prevent');

    Opal.alias(self, 'propagation_stopped?', 'stopped?');

    Opal.alias(self, 'stop_propagation', 'stop');

    return Opal.alias(self, 'stop_immediate_propagation', 'stop_immediate');
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["json"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $hash2 = Opal.hash2, $klass = Opal.klass;

  Opal.add_stubs(['$new', '$push', '$[]=', '$[]', '$create_id', '$json_create', '$attr_accessor', '$create_id=', '$===', '$parse', '$generate', '$from_object', '$merge', '$to_json', '$responds_to?', '$to_io', '$write', '$to_s', '$to_a', '$strftime']);
  (function($base) {
    var $JSON, self = $JSON = $module($base, 'JSON');

    var def = self.$$proto, $scope = self.$$scope, $a, $b;

    
    var $parse  = JSON.parse,
        $hasOwn = Opal.hasOwnProperty;

    function to_opal(value, options) {
      var klass, arr, hash, i, ii, k;

      switch (typeof value) {
        case 'string':
          return value;

        case 'number':
          return value;

        case 'boolean':
          return !!value;

        case 'null':
          return nil;

        case 'object':
          if (!value) return nil;

          if (value.$$is_array) {
            arr = (options.array_class).$new();

            for (i = 0, ii = value.length; i < ii; i++) {
              (arr).$push(to_opal(value[i], options));
            }

            return arr;
          }
          else {
            hash = (options.object_class).$new();

            for (k in value) {
              if ($hasOwn.call(value, k)) {
                (hash)['$[]='](k, to_opal(value[k], options));
              }
            }

            if (!options.parse && (klass = (hash)['$[]']($scope.get('JSON').$create_id())) != nil) {
              klass = Opal.get(klass);
              return (klass).$json_create(hash);
            }
            else {
              return hash;
            }
          }
        }
    };
  

    (function(self) {
      var $scope = self.$$scope, def = self.$$proto;

      return self.$attr_accessor("create_id")
    })(Opal.get_singleton_class(self));

    (($a = ["json_class"]), $b = self, $b['$create_id='].apply($b, $a), $a[$a.length-1]);

    Opal.defs(self, '$[]', function(value, options) {
      var $a, self = this;

      if (options == null) {
        options = $hash2([], {})
      }
      if ((($a = $scope.get('String')['$==='](value)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$parse(value, options)
        } else {
        return self.$generate(value, options)
      };
    });

    Opal.defs(self, '$parse', function(source, options) {
      var self = this;

      if (options == null) {
        options = $hash2([], {})
      }
      return self.$from_object($parse(source), options.$merge($hash2(["parse"], {"parse": true})));
    });

    Opal.defs(self, '$parse!', function(source, options) {
      var self = this;

      if (options == null) {
        options = $hash2([], {})
      }
      return self.$parse(source, options);
    });

    Opal.defs(self, '$load', function(source, options) {
      var self = this;

      if (options == null) {
        options = $hash2([], {})
      }
      return self.$from_object($parse(source), options);
    });

    Opal.defs(self, '$from_object', function(js_object, options) {
      var $a, $b, $c, self = this;

      if (options == null) {
        options = $hash2([], {})
      }
      ($a = "object_class", $b = options, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, $scope.get('Hash'))));
      ($a = "array_class", $b = options, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, $scope.get('Array'))));
      return to_opal(js_object, options.$$smap);
    });

    Opal.defs(self, '$generate', function(obj, options) {
      var self = this;

      if (options == null) {
        options = $hash2([], {})
      }
      return obj.$to_json(options);
    });

    Opal.defs(self, '$dump', function(obj, io, limit) {
      var $a, self = this, string = nil;

      if (io == null) {
        io = nil
      }
      if (limit == null) {
        limit = nil
      }
      string = self.$generate(obj);
      if (io !== false && io !== nil) {
        if ((($a = io['$responds_to?']("to_io")) !== nil && (!$a.$$is_boolean || $a == true))) {
          io = io.$to_io()};
        io.$write(string);
        return io;
        } else {
        return string
      };
    });
  })($scope.base);
  (function($base, $super) {
    function $Object(){};
    var self = $Object = $klass($base, $super, 'Object', $Object);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_json', function() {
      var self = this;

      return self.$to_s().$to_json();
    }), nil) && 'to_json'
  })($scope.base, null);
  (function($base) {
    var $Enumerable, self = $Enumerable = $module($base, 'Enumerable');

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defn(self, '$to_json', function() {
      var self = this;

      return self.$to_a().$to_json();
    })
  })($scope.base);
  (function($base, $super) {
    function $Array(){};
    var self = $Array = $klass($base, $super, 'Array', $Array);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_json', function() {
      var self = this;

      
      var result = [];

      for (var i = 0, length = self.length; i < length; i++) {
        result.push((self[i]).$to_json());
      }

      return '[' + result.join(', ') + ']';
    
    }), nil) && 'to_json'
  })($scope.base, null);
  (function($base, $super) {
    function $Boolean(){};
    var self = $Boolean = $klass($base, $super, 'Boolean', $Boolean);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_json', function() {
      var self = this;

      return (self == true) ? 'true' : 'false';
    }), nil) && 'to_json'
  })($scope.base, null);
  (function($base, $super) {
    function $Hash(){};
    var self = $Hash = $klass($base, $super, 'Hash', $Hash);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_json', function() {
      var self = this;

      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        result.push((key).$to_s().$to_json() + ':' + (value).$to_json());
      }

      return '{' + result.join(', ') + '}';
    ;
    }), nil) && 'to_json'
  })($scope.base, null);
  (function($base, $super) {
    function $NilClass(){};
    var self = $NilClass = $klass($base, $super, 'NilClass', $NilClass);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_json', function() {
      var self = this;

      return "null";
    }), nil) && 'to_json'
  })($scope.base, null);
  (function($base, $super) {
    function $Numeric(){};
    var self = $Numeric = $klass($base, $super, 'Numeric', $Numeric);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_json', function() {
      var self = this;

      return self.toString();
    }), nil) && 'to_json'
  })($scope.base, null);
  (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope;

    return Opal.alias(self, 'to_json', 'inspect')
  })($scope.base, null);
  (function($base, $super) {
    function $Time(){};
    var self = $Time = $klass($base, $super, 'Time', $Time);

    var def = self.$$proto, $scope = self.$$scope;

    return (Opal.defn(self, '$to_json', function() {
      var self = this;

      return self.$strftime("%FT%T%z").$to_json();
    }), nil) && 'to_json'
  })($scope.base, null);
  return (function($base, $super) {
    function $Date(){};
    var self = $Date = $klass($base, $super, 'Date', $Date);

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defn(self, '$to_json', function() {
      var self = this;

      return self.$to_s().$to_json();
    });

    return (Opal.defn(self, '$as_json', function() {
      var self = this;

      return self.$to_s();
    }), nil) && 'as_json';
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["promise"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$resolve', '$new', '$reject', '$attr_reader', '$===', '$value', '$has_key?', '$keys', '$!', '$==', '$<<', '$>>', '$exception?', '$[]', '$resolved?', '$rejected?', '$error', '$include?', '$action', '$realized?', '$raise', '$^', '$call', '$resolve!', '$exception!', '$reject!', '$class', '$object_id', '$+', '$inspect', '$act?', '$nil?', '$prev', '$push', '$concat', '$it', '$lambda', '$reverse', '$pop', '$<=', '$length', '$shift', '$-', '$each', '$wait', '$then', '$to_proc', '$map', '$reduce', '$always', '$try', '$tap', '$all?', '$find']);
  return (function($base, $super) {
    function $Promise(){};
    var self = $Promise = $klass($base, $super, 'Promise', $Promise);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4;

    def.value = def.action = def.exception = def.realized = def.delayed = def.error = def.prev = def.next = nil;
    Opal.defs(self, '$value', function(value) {
      var self = this;

      return self.$new().$resolve(value);
    });

    Opal.defs(self, '$error', function(value) {
      var self = this;

      return self.$new().$reject(value);
    });

    Opal.defs(self, '$when', function() {
      var self = this, $splat_index = nil;

      var array_size = arguments.length - 0;
      if(array_size < 0) array_size = 0;
      var promises = new Array(array_size);
      for($splat_index = 0; $splat_index < array_size; $splat_index++) {
        promises[$splat_index] = arguments[$splat_index + 0];
      }
      return $scope.get('When').$new(promises);
    });

    self.$attr_reader("error", "prev", "next");

    Opal.defn(self, '$initialize', function(action) {
      var self = this;

      if (action == null) {
        action = $hash2([], {})
      }
      self.action = action;
      self.realized = false;
      self.exception = false;
      self.value = nil;
      self.error = nil;
      self.delayed = false;
      self.prev = nil;
      return self.next = nil;
    });

    Opal.defn(self, '$value', function() {
      var $a, self = this;

      if ((($a = $scope.get('Promise')['$==='](self.value)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.value.$value()
        } else {
        return self.value
      };
    });

    Opal.defn(self, '$act?', function() {
      var $a, self = this;

      return ((($a = self.action['$has_key?']("success")) !== false && $a !== nil) ? $a : self.action['$has_key?']("always"));
    });

    Opal.defn(self, '$action', function() {
      var self = this;

      return self.action.$keys();
    });

    Opal.defn(self, '$exception?', function() {
      var self = this;

      return self.exception;
    });

    Opal.defn(self, '$realized?', function() {
      var self = this;

      return self.realized['$!']()['$!']();
    });

    Opal.defn(self, '$resolved?', function() {
      var self = this;

      return self.realized['$==']("resolve");
    });

    Opal.defn(self, '$rejected?', function() {
      var self = this;

      return self.realized['$==']("reject");
    });

    Opal.defn(self, '$^', function(promise) {
      var self = this;

      promise['$<<'](self);
      self['$>>'](promise);
      return promise;
    });

    Opal.defn(self, '$<<', function(promise) {
      var self = this;

      self.prev = promise;
      return self;
    });

    Opal.defn(self, '$>>', function(promise) {
      var $a, $b, $c, self = this;

      self.next = promise;
      if ((($a = self['$exception?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        promise.$reject(self.delayed['$[]'](0))
      } else if ((($a = self['$resolved?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        promise.$resolve((function() {if ((($a = self.delayed) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self.delayed['$[]'](0)
          } else {
          return self.$value()
        }; return nil; })())
      } else if ((($a = self['$rejected?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ((($b = self.action['$has_key?']("failure")['$!']()) !== false && $b !== nil) ? $b : $scope.get('Promise')['$==='](((function() {if ((($c = self.delayed) !== nil && (!$c.$$is_boolean || $c == true))) {
          return self.delayed['$[]'](0)
          } else {
          return self.error
        }; return nil; })())))) !== nil && (!$a.$$is_boolean || $a == true))) {
          promise.$reject((function() {if ((($a = self.delayed) !== nil && (!$a.$$is_boolean || $a == true))) {
            return self.delayed['$[]'](0)
            } else {
            return self.$error()
          }; return nil; })())
        } else if ((($a = promise.$action()['$include?']("always")) !== nil && (!$a.$$is_boolean || $a == true))) {
          promise.$reject((function() {if ((($a = self.delayed) !== nil && (!$a.$$is_boolean || $a == true))) {
            return self.delayed['$[]'](0)
            } else {
            return self.$error()
          }; return nil; })())}};
      return self;
    });

    Opal.defn(self, '$resolve', function(value) {
      var $a, $b, self = this, block = nil, e = nil;

      if (value == null) {
        value = nil
      }
      if ((($a = self['$realized?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "the promise has already been realized")};
      if ((($a = $scope.get('Promise')['$==='](value)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return (value['$<<'](self.prev))['$^'](self)};
      try {
      if ((($a = block = ((($b = self.action['$[]']("success")) !== false && $b !== nil) ? $b : self.action['$[]']("always"))) !== nil && (!$a.$$is_boolean || $a == true))) {
          value = block.$call(value)};
        self['$resolve!'](value);
      } catch ($err) {if (Opal.rescue($err, [$scope.get('Exception')])) {e = $err;
        try {
          self['$exception!'](e)
        } finally {
          Opal.gvars["!"] = Opal.exceptions.pop() || Opal.nil;
        }
        }else { throw $err; }
      };
      return self;
    });

    Opal.defn(self, '$resolve!', function(value) {
      var $a, self = this;

      self.realized = "resolve";
      self.value = value;
      if ((($a = self.next) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.next.$resolve(value)
        } else {
        return self.delayed = [value]
      };
    });

    Opal.defn(self, '$reject', function(value) {
      var $a, $b, self = this, block = nil, e = nil;

      if (value == null) {
        value = nil
      }
      if ((($a = self['$realized?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "the promise has already been realized")};
      if ((($a = $scope.get('Promise')['$==='](value)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return (value['$<<'](self.prev))['$^'](self)};
      try {
      if ((($a = block = ((($b = self.action['$[]']("failure")) !== false && $b !== nil) ? $b : self.action['$[]']("always"))) !== nil && (!$a.$$is_boolean || $a == true))) {
          value = block.$call(value)};
        if ((($a = self.action['$has_key?']("always")) !== nil && (!$a.$$is_boolean || $a == true))) {
          self['$resolve!'](value)
          } else {
          self['$reject!'](value)
        };
      } catch ($err) {if (Opal.rescue($err, [$scope.get('Exception')])) {e = $err;
        try {
          self['$exception!'](e)
        } finally {
          Opal.gvars["!"] = Opal.exceptions.pop() || Opal.nil;
        }
        }else { throw $err; }
      };
      return self;
    });

    Opal.defn(self, '$reject!', function(value) {
      var $a, self = this;

      self.realized = "reject";
      self.error = value;
      if ((($a = self.next) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.next.$reject(value)
        } else {
        return self.delayed = [value]
      };
    });

    Opal.defn(self, '$exception!', function(error) {
      var self = this;

      self.exception = true;
      return self['$reject!'](error);
    });

    Opal.defn(self, '$then', TMP_1 = function() {
      var $a, self = this, $iter = TMP_1.$$p, block = $iter || nil;

      TMP_1.$$p = null;
      if ((($a = self.next) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "a promise has already been chained")};
      return self['$^']($scope.get('Promise').$new($hash2(["success"], {"success": block})));
    });

    Opal.alias(self, 'do', 'then');

    Opal.defn(self, '$fail', TMP_2 = function() {
      var $a, self = this, $iter = TMP_2.$$p, block = $iter || nil;

      TMP_2.$$p = null;
      if ((($a = self.next) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "a promise has already been chained")};
      return self['$^']($scope.get('Promise').$new($hash2(["failure"], {"failure": block})));
    });

    Opal.alias(self, 'rescue', 'fail');

    Opal.alias(self, 'catch', 'fail');

    Opal.defn(self, '$always', TMP_3 = function() {
      var $a, self = this, $iter = TMP_3.$$p, block = $iter || nil;

      TMP_3.$$p = null;
      if ((($a = self.next) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "a promise has already been chained")};
      return self['$^']($scope.get('Promise').$new($hash2(["always"], {"always": block})));
    });

    Opal.alias(self, 'finally', 'always');

    Opal.alias(self, 'ensure', 'always');

    Opal.defn(self, '$trace', TMP_4 = function(depth) {
      var $a, self = this, $iter = TMP_4.$$p, block = $iter || nil;

      if (depth == null) {
        depth = nil
      }
      TMP_4.$$p = null;
      if ((($a = self.next) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "a promise has already been chained")};
      return self['$^']($scope.get('Trace').$new(depth, block));
    });

    Opal.defn(self, '$inspect', function() {
      var $a, self = this, result = nil;

      result = "#<" + (self.$class()) + "(" + (self.$object_id()) + ")";
      if ((($a = self.next) !== nil && (!$a.$$is_boolean || $a == true))) {
        result = $rb_plus(result, " >> " + (self.next.$inspect()))};
      if ((($a = self['$realized?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        result = $rb_plus(result, ": " + ((((($a = self.value) !== false && $a !== nil) ? $a : self.error)).$inspect()) + ">")
        } else {
        result = $rb_plus(result, ">")
      };
      return result;
    });

    (function($base, $super) {
      function $Trace(){};
      var self = $Trace = $klass($base, $super, 'Trace', $Trace);

      var def = self.$$proto, $scope = self.$$scope, TMP_6;

      Opal.defs(self, '$it', function(promise) {
        var $a, $b, self = this, current = nil, prev = nil;

        current = [];
        if ((($a = ((($b = promise['$act?']()) !== false && $b !== nil) ? $b : promise.$prev()['$nil?']())) !== nil && (!$a.$$is_boolean || $a == true))) {
          current.$push(promise.$value())};
        if ((($a = prev = promise.$prev()) !== nil && (!$a.$$is_boolean || $a == true))) {
          return current.$concat(self.$it(prev))
          } else {
          return current
        };
      });

      return (Opal.defn(self, '$initialize', TMP_6 = function(depth, block) {
        var $a, $b, TMP_5, self = this, $iter = TMP_6.$$p, $yield = $iter || nil;

        TMP_6.$$p = null;
        self.depth = depth;
        return Opal.find_super_dispatcher(self, 'initialize', TMP_6, null).apply(self, [$hash2(["success"], {"success": ($a = ($b = self).$lambda, $a.$$p = (TMP_5 = function(){var self = TMP_5.$$s || this, $a, $b, trace = nil;

        trace = $scope.get('Trace').$it(self).$reverse();
          trace.$pop();
          if ((($a = (($b = depth !== false && depth !== nil) ? $rb_le(depth, trace.$length()) : depth)) !== nil && (!$a.$$is_boolean || $a == true))) {
            trace.$shift($rb_minus(trace.$length(), depth))};
          return ($a = block).$call.apply($a, Opal.to_a(trace));}, TMP_5.$$s = self, TMP_5), $a).call($b)})]);
      }), nil) && 'initialize';
    })($scope.base, self);

    return (function($base, $super) {
      function $When(){};
      var self = $When = $klass($base, $super, 'When', $When);

      var def = self.$$proto, $scope = self.$$scope, TMP_7, TMP_9, TMP_11, TMP_13, TMP_17;

      def.wait = nil;
      Opal.defn(self, '$initialize', TMP_7 = function(promises) {
        var $a, $b, TMP_8, self = this, $iter = TMP_7.$$p, $yield = $iter || nil;

        if (promises == null) {
          promises = []
        }
        TMP_7.$$p = null;
        Opal.find_super_dispatcher(self, 'initialize', TMP_7, null).apply(self, []);
        self.wait = [];
        return ($a = ($b = promises).$each, $a.$$p = (TMP_8 = function(promise){var self = TMP_8.$$s || this;
if (promise == null) promise = nil;
        return self.$wait(promise)}, TMP_8.$$s = self, TMP_8), $a).call($b);
      });

      Opal.defn(self, '$each', TMP_9 = function() {
        var $a, $b, TMP_10, self = this, $iter = TMP_9.$$p, block = $iter || nil;

        TMP_9.$$p = null;
        if (block !== false && block !== nil) {
          } else {
          self.$raise($scope.get('ArgumentError'), "no block given")
        };
        return ($a = ($b = self).$then, $a.$$p = (TMP_10 = function(values){var self = TMP_10.$$s || this, $a, $b;
if (values == null) values = nil;
        return ($a = ($b = values).$each, $a.$$p = block.$to_proc(), $a).call($b)}, TMP_10.$$s = self, TMP_10), $a).call($b);
      });

      Opal.defn(self, '$collect', TMP_11 = function() {
        var $a, $b, TMP_12, self = this, $iter = TMP_11.$$p, block = $iter || nil;

        TMP_11.$$p = null;
        if (block !== false && block !== nil) {
          } else {
          self.$raise($scope.get('ArgumentError'), "no block given")
        };
        return ($a = ($b = self).$then, $a.$$p = (TMP_12 = function(values){var self = TMP_12.$$s || this, $a, $b;
if (values == null) values = nil;
        return $scope.get('When').$new(($a = ($b = values).$map, $a.$$p = block.$to_proc(), $a).call($b))}, TMP_12.$$s = self, TMP_12), $a).call($b);
      });

      Opal.defn(self, '$inject', TMP_13 = function() {
        var $a, $b, TMP_14, self = this, $iter = TMP_13.$$p, block = $iter || nil, $splat_index = nil;

        var array_size = arguments.length - 0;
        if(array_size < 0) array_size = 0;
        var args = new Array(array_size);
        for($splat_index = 0; $splat_index < array_size; $splat_index++) {
          args[$splat_index] = arguments[$splat_index + 0];
        }
        TMP_13.$$p = null;
        return ($a = ($b = self).$then, $a.$$p = (TMP_14 = function(values){var self = TMP_14.$$s || this, $a, $b;
if (values == null) values = nil;
        return ($a = ($b = values).$reduce, $a.$$p = block.$to_proc(), $a).apply($b, Opal.to_a(args))}, TMP_14.$$s = self, TMP_14), $a).call($b);
      });

      Opal.alias(self, 'map', 'collect');

      Opal.alias(self, 'reduce', 'inject');

      Opal.defn(self, '$wait', function(promise) {
        var $a, $b, TMP_15, self = this;

        if ((($a = $scope.get('Promise')['$==='](promise)) !== nil && (!$a.$$is_boolean || $a == true))) {
          } else {
          promise = $scope.get('Promise').$value(promise)
        };
        if ((($a = promise['$act?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
          promise = promise.$then()};
        self.wait['$<<'](promise);
        ($a = ($b = promise).$always, $a.$$p = (TMP_15 = function(){var self = TMP_15.$$s || this, $a;
          if (self.next == null) self.next = nil;

        if ((($a = self.next) !== nil && (!$a.$$is_boolean || $a == true))) {
            return self.$try()
            } else {
            return nil
          }}, TMP_15.$$s = self, TMP_15), $a).call($b);
        return self;
      });

      Opal.alias(self, 'and', 'wait');

      Opal.defn(self, '$>>', TMP_17 = function() {
        var $a, $b, TMP_16, self = this, $iter = TMP_17.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil;

        TMP_17.$$p = null;
        $zuper = [];
        for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
          $zuper[$zuper_index] = arguments[$zuper_index];
        }
        return ($a = ($b = Opal.find_super_dispatcher(self, '>>', TMP_17, $iter).apply(self, $zuper)).$tap, $a.$$p = (TMP_16 = function(){var self = TMP_16.$$s || this;

        return self.$try()}, TMP_16.$$s = self, TMP_16), $a).call($b);
      });

      return (Opal.defn(self, '$try', function() {
        var $a, $b, $c, $d, self = this, promise = nil;

        if ((($a = ($b = ($c = self.wait)['$all?'], $b.$$p = "realized?".$to_proc(), $b).call($c)) !== nil && (!$a.$$is_boolean || $a == true))) {
          if ((($a = promise = ($b = ($d = self.wait).$find, $b.$$p = "rejected?".$to_proc(), $b).call($d)) !== nil && (!$a.$$is_boolean || $a == true))) {
            return self.$reject(promise.$error())
            } else {
            return self.$resolve(($a = ($b = self.wait).$map, $a.$$p = "value".$to_proc(), $a).call($b))
          }
          } else {
          return nil
        };
      }), nil) && 'try';
    })($scope.base, self);
  })($scope.base, null)
};

/* Generated by Opal 0.9.2 */
Opal.modules["opal/jquery/http"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$require', '$to_n', '$each', '$define_singleton_method', '$send', '$new', '$define_method', '$attr_reader', '$delete', '$update', '$upcase', '$succeed', '$fail', '$promise', '$parse', '$private', '$tap', '$proc', '$ok?', '$resolve', '$reject', '$from_object', '$call']);
  self.$require("json");
  self.$require("native");
  self.$require("promise");
  self.$require("opal/jquery/constants");
  return (function($base, $super) {
    function $HTTP(){};
    var self = $HTTP = $klass($base, $super, 'HTTP', $HTTP);

    var def = self.$$proto, $scope = self.$$scope, $a, $b, TMP_1;

    def.settings = def.payload = def.url = def.method = def.handler = def.json = def.body = def.ok = def.xhr = def.promise = def.status_code = nil;
    var $ = $scope.get('JQUERY_SELECTOR').$to_n();

    Opal.cdecl($scope, 'ACTIONS', ["get", "post", "put", "delete", "patch", "head"]);

    ($a = ($b = $scope.get('ACTIONS')).$each, $a.$$p = (TMP_1 = function(action){var self = TMP_1.$$s || this, $a, $b, TMP_2, $c, TMP_3;
if (action == null) action = nil;
    ($a = ($b = self).$define_singleton_method, $a.$$p = (TMP_2 = function(url, options){var self = TMP_2.$$s || this, block;
if (url == null) url = nil;if (options == null) options = $hash2([], {});
        block = TMP_2.$$p || nil, TMP_2.$$p = null;
      return self.$new().$send(action, url, options, block)}, TMP_2.$$s = self, TMP_2), $a).call($b, action);
      return ($a = ($c = self).$define_method, $a.$$p = (TMP_3 = function(url, options){var self = TMP_3.$$s || this, block;
if (url == null) url = nil;if (options == null) options = $hash2([], {});
        block = TMP_3.$$p || nil, TMP_3.$$p = null;
      return self.$send(action, url, options, block)}, TMP_3.$$s = self, TMP_3), $a).call($c, action);}, TMP_1.$$s = self, TMP_1), $a).call($b);

    Opal.defs(self, '$setup', function() {
      var self = this;

      return $scope.get('Hash').$new($.ajaxSetup());
    });

    Opal.defs(self, '$setup=', function(settings) {
      var self = this;

      return $.ajaxSetup(settings.$to_n());
    });

    self.$attr_reader("body", "error_message", "method", "status_code", "url", "xhr");

    Opal.defn(self, '$initialize', function() {
      var self = this;

      self.settings = $hash2([], {});
      return self.ok = true;
    });

    Opal.defn(self, '$send', function(method, url, options, block) {
      var $a, self = this, settings = nil, payload = nil;

      self.method = method;
      self.url = url;
      self.payload = options.$delete("payload");
      self.handler = block;
      self.settings.$update(options);
      $a = [self.settings.$to_n(), self.payload], settings = $a[0], payload = $a[1], $a;
      
      if (typeof(payload) === 'string') {
        settings.data = payload;
      }
      else if (payload != nil) {
        settings.data = payload.$to_json();
        settings.contentType = 'application/json';
      }

      settings.url  = self.url;
      settings.type = self.method.$upcase();

      settings.success = function(data, status, xhr) {
        return self.$succeed(data, status, xhr);
      };

      settings.error = function(xhr, status, error) {
        return self.$fail(xhr, status, error);
      };

      $.ajax(settings);
    ;
      if ((($a = self.handler) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self
        } else {
        return self.$promise()
      };
    });

    Opal.defn(self, '$json', function() {
      var $a, self = this;

      return ((($a = self.json) !== false && $a !== nil) ? $a : self.json = $scope.get('JSON').$parse(self.body));
    });

    Opal.defn(self, '$ok?', function() {
      var self = this;

      return self.ok;
    });

    Opal.defn(self, '$get_header', function(key) {
      var self = this;

      return self.xhr.getResponseHeader(key);;
    });

    self.$private();

    Opal.defn(self, '$promise', function() {
      var $a, $b, TMP_4, self = this;

      if ((($a = self.promise) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.promise};
      return self.promise = ($a = ($b = $scope.get('Promise').$new()).$tap, $a.$$p = (TMP_4 = function(promise){var self = TMP_4.$$s || this, $a, $b, TMP_5;
if (promise == null) promise = nil;
      return self.handler = ($a = ($b = self).$proc, $a.$$p = (TMP_5 = function(res){var self = TMP_5.$$s || this, $a;
if (res == null) res = nil;
        if ((($a = res['$ok?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
            return promise.$resolve(res)
            } else {
            return promise.$reject(res)
          }}, TMP_5.$$s = self, TMP_5), $a).call($b)}, TMP_4.$$s = self, TMP_4), $a).call($b);
    });

    Opal.defn(self, '$succeed', function(data, status, xhr) {
      var $a, self = this;

      
      self.body = data;
      self.xhr  = xhr;
      self.status_code = xhr.status;

      if (typeof(data) === 'object') {
        self.json = $scope.get('JSON').$from_object(data);
      }
    ;
      if ((($a = self.handler) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.handler.$call(self)
        } else {
        return nil
      };
    });

    return (Opal.defn(self, '$fail', function(xhr, status, error) {
      var $a, self = this;

      
      self.body = xhr.responseText;
      self.xhr = xhr;
      self.status_code = xhr.status;
    ;
      self.ok = false;
      if ((($a = self.handler) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.handler.$call(self)
        } else {
        return nil
      };
    }), nil) && 'fail';
  })($scope.base, null);
};

/* Generated by Opal 0.9.2 */
Opal.modules["opal/jquery/kernel"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  return (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope;

    Opal.defn(self, '$alert', function(msg) {
      var self = this;

      alert(msg);
      return nil;
    })
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["opal/jquery"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$==', '$require']);
  if ($scope.get('RUBY_ENGINE')['$==']("opal")) {
    self.$require("opal/jquery/window");
    self.$require("opal/jquery/document");
    self.$require("opal/jquery/element");
    self.$require("opal/jquery/event");
    self.$require("opal/jquery/http");
    return self.$require("opal/jquery/kernel");}
};

/* Generated by Opal 0.9.2 */
Opal.modules["opal-jquery"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require']);
  return self.$require("opal/jquery")
};

/* Generated by Opal 0.9.2 */
Opal.modules["dare/canvas"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$attr_reader', '$[]', '$[]=', '$to_s', '$rand', '$**']);
  return (function($base) {
    var $Dare, self = $Dare = $module($base, 'Dare');

    var def = self.$$proto, $scope = self.$$scope;

    (function($base, $super) {
      function $Canvas(){};
      var self = $Canvas = $klass($base, $super, 'Canvas', $Canvas);

      var def = self.$$proto, $scope = self.$$scope;

      def.id = def.canvas = nil;
      self.$attr_reader("id", "canvas");

      Opal.defn(self, '$initialize', function(opts) {
        var $a, $b, $c, self = this;

        if (opts == null) {
          opts = $hash2([], {})
        }
        ($a = "width", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 640)));
        ($a = "height", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 480)));
        ($a = "border", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, false)));
        var my_canvas = document.createElement("canvas");
        self.id = self.$rand((36)['$**'](8)).$to_s(36);
        my_canvas.setAttribute('id', self.id);
        my_canvas.width = opts['$[]']("width");
        my_canvas.height = opts['$[]']("height");
        if ((($a = opts['$[]']("border")) !== nil && (!$a.$$is_boolean || $a == true))) {
          my_canvas.style.border = "solid 1px black";};
        document.body.appendChild(my_canvas);
        return self.canvas = my_canvas;
      });

      return (Opal.defn(self, '$context', function() {
        var self = this;

        return self.canvas.getContext('2d');
      }), nil) && 'context';
    })($scope.base, null)
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["dare/clock"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$[]', '$[]=', '$call']);
  return (function($base) {
    var $Dare, self = $Dare = $module($base, 'Dare');

    var def = self.$$proto, $scope = self.$$scope;

    (function($base, $super) {
      function $Clock(){};
      var self = $Clock = $klass($base, $super, 'Clock', $Clock);

      var def = self.$$proto, $scope = self.$$scope, TMP_1;

      def.update_interval = def.interval = nil;
      Opal.defn(self, '$initialize', function(opts) {
        var $a, $b, $c, self = this;

        if (opts == null) {
          opts = $hash2([], {})
        }
        ($a = "update_interval", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 16.666)));
        return self.update_interval = opts['$[]']("update_interval");
      });

      Opal.defn(self, '$start', TMP_1 = function() {
        var self = this, $iter = TMP_1.$$p, block = $iter || nil;

        TMP_1.$$p = null;
        return self.interval = setInterval(function(){block.$call()}, self.update_interval);
      });

      return (Opal.defn(self, '$stop', function() {
        var self = this;

        return clearInterval(self.interval);
      }), nil) && 'stop';
    })($scope.base, null)
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["dare/font"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$[]', '$[]=', '$default_canvas', '$+', '$to_s', '$context']);
  return (function($base) {
    var $Dare, self = $Dare = $module($base, 'Dare');

    var def = self.$$proto, $scope = self.$$scope;

    (function($base, $super) {
      function $Font(){};
      var self = $Font = $klass($base, $super, 'Font', $Font);

      var def = self.$$proto, $scope = self.$$scope;

      def.canvas = def.font = def.color = nil;
      Opal.defn(self, '$initialize', function(opts) {
        var $a, $b, $c, self = this;

        if (opts == null) {
          opts = $hash2([], {})
        }
        ($a = "font", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, "Arial")));
        ($a = "canvas", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, $scope.get('Dare').$default_canvas())));
        ($a = "size", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 30)));
        ($a = "color", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, "black")));
        self.font = $rb_plus($rb_plus($rb_plus(opts['$[]']("size").$to_s(), "px"), " "), opts['$[]']("font"));
        self.canvas = opts['$[]']("canvas");
        return self.color = opts['$[]']("color");
      });

      return (Opal.defn(self, '$draw', function(string, x, y, opts) {
        var self = this;

        if (string == null) {
          string = ""
        }
        if (x == null) {
          x = 0
        }
        if (y == null) {
          y = 0
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        
        self.canvas.$context().font = self.font ;
        self.canvas.$context().textAlign = 'left';
        self.canvas.$context().textBaseline = 'top';
        self.canvas.$context().fillStyle = self.color;
        self.canvas.$context().fillText(string, x, y);
      ;
      }), nil) && 'draw';
    })($scope.base, null)
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["dare/image"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$[]', '$[]=', '$default_canvas', '$context', '$-', '$width', '$height', '$new', '$img', '$/', '$times', '$<<', '$*', '$to_i', '$attr_reader', '$draw_tile', '$merge', '$draw_tile_rot']);
  return (function($base) {
    var $Dare, self = $Dare = $module($base, 'Dare');

    var def = self.$$proto, $scope = self.$$scope;

    (function($base, $super) {
      function $Image(){};
      var self = $Image = $klass($base, $super, 'Image', $Image);

      var def = self.$$proto, $scope = self.$$scope;

      def.img = def.path = def.canvas = nil;
      Opal.defn(self, '$initialize', function(path, opts) {
        var $a, $b, $c, self = this;

        if (path == null) {
          path = ""
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        ($a = "canvas", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, $scope.get('Dare').$default_canvas())));
        self.path = path;
        self.img = new Image();
        self.img.src = path;
        return self.canvas = opts['$[]']("canvas");
      });

      Opal.defn(self, '$path', function() {
        var self = this;

        return self.path;
      });

      Opal.defn(self, '$img', function() {
        var self = this;

        return self.img;
      });

      Opal.defn(self, '$width', function() {
        var self = this;

        return self.img.width;
      });

      Opal.defn(self, '$height', function() {
        var self = this;

        return self.img.height;
      });

      Opal.defn(self, '$draw', function(x, y, opts) {
        var $a, $b, $c, self = this;

        if (x == null) {
          x = 0
        }
        if (y == null) {
          y = 0
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        ($a = "canvas", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, self.canvas)));
        
        opts['$[]']("canvas").$context().drawImage(
          self.img,
          x,
          y
        );
      ;
      });

      Opal.defn(self, '$draw_tile', function(x, y, opts) {
        var $a, $b, $c, self = this;

        if (x == null) {
          x = 0
        }
        if (y == null) {
          y = 0
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        ($a = "canvas", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, self.canvas)));
        ($a = "sx", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 0)));
        ($a = "sy", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 0)));
        ($a = "swidth", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, $rb_minus(self.$width(), opts['$[]']("sx")))));
        ($a = "sheight", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, $rb_minus(self.$height(), opts['$[]']("sy")))));
        ($a = "dwidth", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, opts['$[]']("swidth"))));
        ($a = "dheight", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, opts['$[]']("sheight"))));
        
        opts['$[]']("canvas").$context().drawImage(
          self.img,
          opts['$[]']("sx"),
          opts['$[]']("sy"),
          opts['$[]']("swidth"),
          opts['$[]']("sheight"),
          x,
          y,
          opts['$[]']("dwidth"),
          opts['$[]']("dheight")
        );
      ;
      });

      Opal.defn(self, '$draw_rot', function(x, y, angle, opts) {
        var $a, $b, $c, self = this;

        if (x == null) {
          x = 0
        }
        if (y == null) {
          y = 0
        }
        if (angle == null) {
          angle = 90
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        ($a = "canvas", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, self.canvas)));
        
        var context = opts['$[]']("canvas").$context();
        var width = self.img.width;
        var height = self.img.height;
        context.translate(x, y);
        context.rotate(-$rb_minus(angle, 90)*Math.PI/180.0);
        context.drawImage(self.img, -width/2, -height/2, width, height);
        context.rotate($rb_minus(angle, 90)*Math.PI/180.0);
        context.translate(-x, -y);
      ;
      });

      Opal.defn(self, '$draw_tile_rot', function(x, y, angle, opts) {
        var $a, $b, $c, self = this;

        if (x == null) {
          x = 0
        }
        if (y == null) {
          y = 0
        }
        if (angle == null) {
          angle = 90
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        ($a = "canvas", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, self.canvas)));
        ($a = "sx", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 0)));
        ($a = "sy", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 0)));
        ($a = "swidth", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, $rb_minus(self.$width(), opts['$[]']("sx")))));
        ($a = "sheight", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, $rb_minus(self.$height(), opts['$[]']("sy")))));
        ($a = "dwidth", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, opts['$[]']("swidth"))));
        ($a = "dheight", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, opts['$[]']("sheight"))));
        
        var context = opts['$[]']("canvas").$context();
        context.translate(x, y);
        context.rotate(-$rb_minus(angle, 90)*Math.PI/180.0);
        context.drawImage(
          self.img,
          opts['$[]']("sx"),
          opts['$[]']("sy"),
          opts['$[]']("swidth"),
          opts['$[]']("sheight"),
          -opts['$[]']("swidth")/2,
          -opts['$[]']("sheight")/2,
          opts['$[]']("swidth"),
          opts['$[]']("sheight"));
        context.rotate($rb_minus(angle, 90)*Math.PI/180.0);
        context.translate(-x, -y);
      ;
      });

      return (Opal.defs(self, '$load_tiles', function(path, opts) {
        var $a, $b, $c, TMP_1, self = this, image = nil, columns = nil, rows = nil;
        if (self.tiles == null) self.tiles = nil;

        if (path == null) {
          path = ""
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        image = $scope.get('Image').$new(path);
        self.tiles = [];
        
        image.$img().onload = function() {
          ($a = "width", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, image.$width())));
          ($a = "height", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, image.$height())));
          columns = $rb_divide(image.$width(), opts['$[]']("width"));
          rows = $rb_divide(image.$height(), opts['$[]']("height"));

          ($a = ($b = rows).$times, $a.$$p = (TMP_1 = function(row){var self = TMP_1.$$s || this, $a, $b, TMP_2;
if (row == null) row = nil;
        return ($a = ($b = columns).$times, $a.$$p = (TMP_2 = function(column){var self = TMP_2.$$s || this;
            if (self.tiles == null) self.tiles = nil;
if (column == null) column = nil;
          return self.tiles['$<<']($scope.get('ImageTile').$new(image, $rb_times(column, opts['$[]']("width").$to_i()), $rb_times(row, opts['$[]']("height").$to_i()), opts['$[]']("width").$to_i(), opts['$[]']("height").$to_i()))}, TMP_2.$$s = self, TMP_2), $a).call($b)}, TMP_1.$$s = self, TMP_1), $a).call($b);
        }
      ;
        return self.tiles;
      }), nil) && 'load_tiles';
    })($scope.base, null);

    (function($base, $super) {
      function $ImageTile(){};
      var self = $ImageTile = $klass($base, $super, 'ImageTile', $ImageTile);

      var def = self.$$proto, $scope = self.$$scope;

      def.image = def.x = def.y = def.width = def.height = nil;
      self.$attr_reader("width", "height");

      Opal.defn(self, '$initialize', function(image, x, y, width, height) {
        var self = this;

        if (image == null) {
          image = $scope.get('Image').$new()
        }
        if (x == null) {
          x = 0
        }
        if (y == null) {
          y = 0
        }
        if (width == null) {
          width = 0
        }
        if (height == null) {
          height = 0
        }
        self.image = image;
        self.x = x;
        self.y = y;
        self.width = width;
        return self.height = height;
      });

      Opal.defn(self, '$draw', function(x, y, opts) {
        var self = this;

        if (x == null) {
          x = 0
        }
        if (y == null) {
          y = 0
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        return self.image.$draw_tile(x, y, opts.$merge($hash2(["sx", "sy", "swidth", "sheight"], {"sx": self.x, "sy": self.y, "swidth": self.width, "sheight": self.height})));
      });

      return (Opal.defn(self, '$draw_rot', function(x, y, angle, opts) {
        var self = this;

        if (x == null) {
          x = 0
        }
        if (y == null) {
          y = 0
        }
        if (angle == null) {
          angle = 90
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        return self.image.$draw_tile_rot(x, y, angle, opts.$merge($hash2(["sx", "sy", "swidth", "sheight"], {"sx": self.x, "sy": self.y, "swidth": self.width, "sheight": self.height})));
      }), nil) && 'draw_rot';
    })($scope.base, null);
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["dare/keyboard_constants"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  
  //set jquery vars if jquery migrate doesn't work for some reason
  try{
    $.browser.mozilla;
    $.browser.webkit;
  } catch(e) { $.browser = {'mozilla': false,'webkit': false}; }

  return (function($base) {
    var $Dare, self = $Dare = $module($base, 'Dare');

    var def = self.$$proto, $scope = self.$$scope, $a, kbCmd = nil, kbCmdRight = nil;

    Opal.cdecl($scope, 'Kb0', 48);

    Opal.cdecl($scope, 'Kb1', 49);

    Opal.cdecl($scope, 'Kb2', 50);

    Opal.cdecl($scope, 'Kb3', 51);

    Opal.cdecl($scope, 'Kb4', 52);

    Opal.cdecl($scope, 'Kb5', 53);

    Opal.cdecl($scope, 'Kb6', 54);

    Opal.cdecl($scope, 'Kb7', 55);

    Opal.cdecl($scope, 'Kb8', 56);

    Opal.cdecl($scope, 'Kb9', 57);

    Opal.cdecl($scope, 'KbA', 65);

    Opal.cdecl($scope, 'KbB', 66);

    Opal.cdecl($scope, 'KbC', 67);

    Opal.cdecl($scope, 'KbD', 68);

    Opal.cdecl($scope, 'KbE', 69);

    Opal.cdecl($scope, 'KbF', 70);

    Opal.cdecl($scope, 'KbG', 71);

    Opal.cdecl($scope, 'KbH', 72);

    Opal.cdecl($scope, 'KbI', 73);

    Opal.cdecl($scope, 'KbJ', 74);

    Opal.cdecl($scope, 'KbK', 75);

    Opal.cdecl($scope, 'KbL', 76);

    Opal.cdecl($scope, 'KbM', 77);

    Opal.cdecl($scope, 'KbN', 78);

    Opal.cdecl($scope, 'KbO', 79);

    Opal.cdecl($scope, 'KbP', 80);

    Opal.cdecl($scope, 'KbQ', 81);

    Opal.cdecl($scope, 'KbR', 82);

    Opal.cdecl($scope, 'KbS', 83);

    Opal.cdecl($scope, 'KbT', 84);

    Opal.cdecl($scope, 'KbU', 85);

    Opal.cdecl($scope, 'KbV', 86);

    Opal.cdecl($scope, 'KbW', 87);

    Opal.cdecl($scope, 'KbX', 88);

    Opal.cdecl($scope, 'KbY', 89);

    Opal.cdecl($scope, 'KbZ', 90);

    Opal.cdecl($scope, 'KbBackspace', 8);

    Opal.cdecl($scope, 'KbDelete', 46);

    Opal.cdecl($scope, 'KbDown', 40);

    Opal.cdecl($scope, 'KbEnd', 35);

    Opal.cdecl($scope, 'KbEnter', 13);

    Opal.cdecl($scope, 'KbReturn', 13);

    Opal.cdecl($scope, 'KbEscape', 27);

    Opal.cdecl($scope, 'KbF1', 112);

    Opal.cdecl($scope, 'KbF2', 113);

    Opal.cdecl($scope, 'KbF3', 114);

    Opal.cdecl($scope, 'KbF4', 115);

    Opal.cdecl($scope, 'KbF5', 116);

    Opal.cdecl($scope, 'KbF6', 117);

    Opal.cdecl($scope, 'KbF7', 118);

    Opal.cdecl($scope, 'KbF8', 119);

    Opal.cdecl($scope, 'KbF9', 120);

    Opal.cdecl($scope, 'KbF10', 121);

    Opal.cdecl($scope, 'KbF11', 122);

    Opal.cdecl($scope, 'KbF12', 123);

    Opal.cdecl($scope, 'KbSpace', 32);

    Opal.cdecl($scope, 'KbPageUp', 33);

    Opal.cdecl($scope, 'KbPageDown', 34);

    Opal.cdecl($scope, 'KbHome', 36);

    Opal.cdecl($scope, 'KbLeft', 37);

    Opal.cdecl($scope, 'KbUp', 38);

    Opal.cdecl($scope, 'KbRight', 39);

    Opal.cdecl($scope, 'KbInsert', 45);

    Opal.cdecl($scope, 'KbShift', 16);

    Opal.cdecl($scope, 'KbControl', 17);

    Opal.cdecl($scope, 'KbAlt', 18);

    Opal.cdecl($scope, 'KbCapsLock', 20);

    Opal.cdecl($scope, 'KbNumpad0', 96);

    Opal.cdecl($scope, 'KbNumpad1', 97);

    Opal.cdecl($scope, 'KbNumpad2', 98);

    Opal.cdecl($scope, 'KbNumpad3', 99);

    Opal.cdecl($scope, 'KbNumpad4', 100);

    Opal.cdecl($scope, 'KbNumpad5', 101);

    Opal.cdecl($scope, 'KbNumpad6', 102);

    Opal.cdecl($scope, 'KbNumpad7', 103);

    Opal.cdecl($scope, 'KbNumpad8', 104);

    Opal.cdecl($scope, 'KbNumpad9', 105);

    Opal.cdecl($scope, 'KbNumpadMultiply', 106);

    Opal.cdecl($scope, 'KbNumpadAdd', 107);

    Opal.cdecl($scope, 'KbNumpadSubtract', 109);

    Opal.cdecl($scope, 'KbNumpadDivide', 111);

    Opal.cdecl($scope, 'KbTab', 9);

    Opal.cdecl($scope, 'KbBacktick', 192);

    Opal.cdecl($scope, 'KbTilde', 192);

    Opal.cdecl($scope, 'KbGraveAccent', 192);

    Opal.cdecl($scope, 'KbMinus', 189);

    Opal.cdecl($scope, 'KbDash', 189);

    Opal.cdecl($scope, 'KbEqual', 187);

    Opal.cdecl($scope, 'KbBracketLeft', 219);

    Opal.cdecl($scope, 'KbBracketRight', 221);

    Opal.cdecl($scope, 'KbBackslash', 220);

    Opal.cdecl($scope, 'KbSemicolon', 186);

    Opal.cdecl($scope, 'KbApostrophe', 222);

    Opal.cdecl($scope, 'KbComma', 188);

    Opal.cdecl($scope, 'KbPeriod', 190);

    Opal.cdecl($scope, 'KbSlash', 191);

    ((($a = kbCmd) !== false && $a !== nil) ? $a : kbCmd =  (function(){
      if($.browser.mozilla){
        return 224;
      } else if($.browser.webkit) {
        return 91;
      } else {
        return 17;
      }
    })()
  );

    ((($a = kbCmdRight) !== false && $a !== nil) ? $a : kbCmdRight =  (function(){
      if($.browser.webkit) {
        return 93;
      } else {
        return 17;
      }
    })()
  );

    Opal.cdecl($scope, 'KbCmd', kbCmd);

    Opal.cdecl($scope, 'KbCmdLeft', $scope.get('KbCmd'));

    Opal.cdecl($scope, 'KbCmdRight', kbCmdRight);

    (function($base) {
      var $Kb, self = $Kb = $module($base, 'Kb');

      var def = self.$$proto, $scope = self.$$scope, $a, kbCmd = nil, kbCmdRight = nil;

      Opal.cdecl($scope, 'Kb0', 48);

      Opal.cdecl($scope, 'Kb1', 49);

      Opal.cdecl($scope, 'Kb2', 50);

      Opal.cdecl($scope, 'Kb3', 51);

      Opal.cdecl($scope, 'Kb4', 52);

      Opal.cdecl($scope, 'Kb5', 53);

      Opal.cdecl($scope, 'Kb6', 54);

      Opal.cdecl($scope, 'Kb7', 55);

      Opal.cdecl($scope, 'Kb8', 56);

      Opal.cdecl($scope, 'Kb9', 57);

      Opal.cdecl($scope, 'KbA', 65);

      Opal.cdecl($scope, 'KbB', 66);

      Opal.cdecl($scope, 'KbC', 67);

      Opal.cdecl($scope, 'KbD', 68);

      Opal.cdecl($scope, 'KbE', 69);

      Opal.cdecl($scope, 'KbF', 70);

      Opal.cdecl($scope, 'KbG', 71);

      Opal.cdecl($scope, 'KbH', 72);

      Opal.cdecl($scope, 'KbI', 73);

      Opal.cdecl($scope, 'KbJ', 74);

      Opal.cdecl($scope, 'KbK', 75);

      Opal.cdecl($scope, 'KbL', 76);

      Opal.cdecl($scope, 'KbM', 77);

      Opal.cdecl($scope, 'KbN', 78);

      Opal.cdecl($scope, 'KbO', 79);

      Opal.cdecl($scope, 'KbP', 80);

      Opal.cdecl($scope, 'KbQ', 81);

      Opal.cdecl($scope, 'KbR', 82);

      Opal.cdecl($scope, 'KbS', 83);

      Opal.cdecl($scope, 'KbT', 84);

      Opal.cdecl($scope, 'KbU', 85);

      Opal.cdecl($scope, 'KbV', 86);

      Opal.cdecl($scope, 'KbW', 87);

      Opal.cdecl($scope, 'KbX', 88);

      Opal.cdecl($scope, 'KbY', 89);

      Opal.cdecl($scope, 'KbZ', 90);

      Opal.cdecl($scope, 'KbBackspace', 8);

      Opal.cdecl($scope, 'KbDelete', 46);

      Opal.cdecl($scope, 'KbDown', 40);

      Opal.cdecl($scope, 'KbEnd', 35);

      Opal.cdecl($scope, 'KbEnter', 13);

      Opal.cdecl($scope, 'KbReturn', 13);

      Opal.cdecl($scope, 'KbEscape', 27);

      Opal.cdecl($scope, 'KbF1', 112);

      Opal.cdecl($scope, 'KbF2', 113);

      Opal.cdecl($scope, 'KbF3', 114);

      Opal.cdecl($scope, 'KbF4', 115);

      Opal.cdecl($scope, 'KbF5', 116);

      Opal.cdecl($scope, 'KbF6', 117);

      Opal.cdecl($scope, 'KbF7', 118);

      Opal.cdecl($scope, 'KbF8', 119);

      Opal.cdecl($scope, 'KbF9', 120);

      Opal.cdecl($scope, 'KbF10', 121);

      Opal.cdecl($scope, 'KbF11', 122);

      Opal.cdecl($scope, 'KbF12', 123);

      Opal.cdecl($scope, 'KbSpace', 32);

      Opal.cdecl($scope, 'KbPageUp', 33);

      Opal.cdecl($scope, 'KbPageDown', 34);

      Opal.cdecl($scope, 'KbHome', 36);

      Opal.cdecl($scope, 'KbLeft', 37);

      Opal.cdecl($scope, 'KbUp', 38);

      Opal.cdecl($scope, 'KbRight', 39);

      Opal.cdecl($scope, 'KbInsert', 45);

      Opal.cdecl($scope, 'KbShift', 16);

      Opal.cdecl($scope, 'KbControl', 17);

      Opal.cdecl($scope, 'KbAlt', 18);

      Opal.cdecl($scope, 'KbCapsLock', 20);

      Opal.cdecl($scope, 'KbNumpad0', 96);

      Opal.cdecl($scope, 'KbNumpad1', 97);

      Opal.cdecl($scope, 'KbNumpad2', 98);

      Opal.cdecl($scope, 'KbNumpad3', 99);

      Opal.cdecl($scope, 'KbNumpad4', 100);

      Opal.cdecl($scope, 'KbNumpad5', 101);

      Opal.cdecl($scope, 'KbNumpad6', 102);

      Opal.cdecl($scope, 'KbNumpad7', 103);

      Opal.cdecl($scope, 'KbNumpad8', 104);

      Opal.cdecl($scope, 'KbNumpad9', 105);

      Opal.cdecl($scope, 'KbNumpadMultiply', 106);

      Opal.cdecl($scope, 'KbNumpadAdd', 107);

      Opal.cdecl($scope, 'KbNumpadSubtract', 109);

      Opal.cdecl($scope, 'KbNumpadDivide', 111);

      Opal.cdecl($scope, 'KbTab', 9);

      Opal.cdecl($scope, 'KbBacktick', 192);

      Opal.cdecl($scope, 'KbTilde', 192);

      Opal.cdecl($scope, 'KbGraveAccent', 192);

      Opal.cdecl($scope, 'KbMinus', 189);

      Opal.cdecl($scope, 'KbDash', 189);

      Opal.cdecl($scope, 'KbEqual', 187);

      Opal.cdecl($scope, 'KbBracketLeft', 219);

      Opal.cdecl($scope, 'KbBracketRight', 221);

      Opal.cdecl($scope, 'KbBackslash', 220);

      Opal.cdecl($scope, 'KbSemicolon', 186);

      Opal.cdecl($scope, 'KbApostrophe', 222);

      Opal.cdecl($scope, 'KbComma', 188);

      Opal.cdecl($scope, 'KbPeriod', 190);

      Opal.cdecl($scope, 'KbSlash', 191);

      ((($a = kbCmd) !== false && $a !== nil) ? $a : kbCmd =  (function(){
        if($.browser.mozilla){
          return 224;
        } else if($.browser.webkit) {
          return 91;
        } else {
          return 17;
        }
      })()
    );

      ((($a = kbCmdRight) !== false && $a !== nil) ? $a : kbCmdRight =  (function(){
        if($.browser.webkit) {
          return 93;
        } else {
          return 17;
        }
      })()
    );

      Opal.cdecl($scope, 'KbCmd', kbCmd);

      Opal.cdecl($scope, 'KbCmdLeft', $scope.get('KbCmd'));

      Opal.cdecl($scope, 'KbCmdRight', kbCmdRight);
    })($scope.base);
  })($scope.base);
};

/* Generated by Opal 0.9.2 */
Opal.modules["dare/sound"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$[]', '$[]=', '$<', '$to_i', '$>', '$times', '$<<', '$+', '$%']);
  return (function($base) {
    var $Dare, self = $Dare = $module($base, 'Dare');

    var def = self.$$proto, $scope = self.$$scope;

    (function($base, $super) {
      function $Sound(){};
      var self = $Sound = $klass($base, $super, 'Sound', $Sound);

      var def = self.$$proto, $scope = self.$$scope;

      def.overlap = def.sound = def.sounds = nil;
      Opal.defn(self, '$initialize', function(path, opts) {
        var $a, $b, $c, TMP_1, self = this;

        if (opts == null) {
          opts = $hash2([], {})
        }
        ($a = "overlap", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 1)));
        ($a = "volume", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 1)));
        if ((($a = $rb_lt(opts['$[]']("overlap").$to_i(), 1)) !== nil && (!$a.$$is_boolean || $a == true))) {
          opts['$[]=']("overlap", 1)};
        if ((($a = $rb_gt(opts['$[]']("overlap").$to_i(), 10)) !== nil && (!$a.$$is_boolean || $a == true))) {
          opts['$[]=']("overlap", 10)};
        self.overlap = opts['$[]']("overlap");
        self.sounds = [];
        ($a = ($b = self.overlap).$times, $a.$$p = (TMP_1 = function(){var self = TMP_1.$$s || this;
          if (self.sounds == null) self.sounds = nil;

        var snd = new Audio(path);
          snd.volume = opts['$[]']("volume");
          return self.sounds['$<<'](snd);}, TMP_1.$$s = self, TMP_1), $a).call($b);
        return self.sound = 0;
      });

      Opal.defn(self, '$volume=', function(vol) {
        var self = this;

        return self.sound.volume = vol;
      });

      Opal.defn(self, '$volume', function() {
        var self = this;

        return self.sound.volume;
      });

      Opal.defn(self, '$play', function() {
        var self = this;

        self.sound = $rb_plus(self.sound, 1);
        self.sound = self.sound['$%'](self.overlap);
        return self.sounds['$[]'](self.sound).play();
      });

      Opal.defn(self, '$pause', function() {
        var self = this;

        return self.sound.pause();
      });

      return (Opal.defn(self, '$time=', function(time) {
        var self = this;

        return self.sound.currentTime = time;
      }), nil) && 'time=';
    })($scope.base, null)
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["dare/sprite"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $klass = Opal.klass;

  Opal.add_stubs(['$attr_accessor', '$new', '$[]=', '$default_canvas', '$draw', '$[]', '$button_down?', '$walk', '$stand', '$==', '$>=', '$+']);
  return (function($base) {
    var $Dare, self = $Dare = $module($base, 'Dare');

    var def = self.$$proto, $scope = self.$$scope;

    (function($base, $super) {
      function $Sprite(){};
      var self = $Sprite = $klass($base, $super, 'Sprite', $Sprite);

      var def = self.$$proto, $scope = self.$$scope;

      def.images = def.current_image = def.window = def.ticks_on_current_image = nil;
      self.$attr_accessor("images", "state");

      Opal.defn(self, '$initialize', function(window) {
        var $a, $b, TMP_1, self = this;

        if (window == null) {
          window = $scope.get('Dare').$default_canvas()
        }
        self.window = window;
        self.images = [];
        self.state = ($a = ($b = $scope.get('Hash')).$new, $a.$$p = (TMP_1 = function(h, k){var self = TMP_1.$$s || this;
if (h == null) h = nil;if (k == null) k = nil;
        return h['$[]='](k, (($scope.get('Dare')).$$scope.get('AnimationState')).$new())}, TMP_1.$$s = self, TMP_1), $a).call($b);
        self.current_image = 0;
        self.ticks_on_current_image = 0;
        self.x = 0;
        return self.y = 0;
      });

      Opal.defn(self, '$draw', function(x, y) {
        var self = this;

        if (x == null) {
          x = 0
        }
        if (y == null) {
          y = 0
        }
        return self.images['$[]'](self.current_image).$draw(x, y);
      });

      Opal.defn(self, '$update', function() {
        var $a, self = this;

        if ((($a = self.window['$button_down?']((($scope.get('Dare')).$$scope.get('KbRight')))) !== nil && (!$a.$$is_boolean || $a == true))) {
          return self.$walk()
          } else {
          return self.$stand()
        };
      });

      Opal.defn(self, '$walk', function() {
        var $a, self = this;

        if (self.current_image['$=='](0)) {
          self.current_image = 2;
          return self.ticks_on_current_image = 0;
        } else if (self.current_image['$=='](2)) {
          if ((($a = $rb_ge(self.ticks_on_current_image, 5)) !== nil && (!$a.$$is_boolean || $a == true))) {
            self.current_image = 3;
            return self.ticks_on_current_image = 0;
            } else {
            return self.ticks_on_current_image = $rb_plus(self.ticks_on_current_image, 1)
          }
        } else if (self.current_image['$=='](3)) {
          if ((($a = $rb_ge(self.ticks_on_current_image, 5)) !== nil && (!$a.$$is_boolean || $a == true))) {
            self.current_image = 4;
            return self.ticks_on_current_image = 0;
            } else {
            return self.ticks_on_current_image = $rb_plus(self.ticks_on_current_image, 1)
          }
        } else if (self.current_image['$=='](4)) {
          if ((($a = $rb_ge(self.ticks_on_current_image, 5)) !== nil && (!$a.$$is_boolean || $a == true))) {
            self.current_image = 2;
            return self.ticks_on_current_image = 0;
            } else {
            return self.ticks_on_current_image = $rb_plus(self.ticks_on_current_image, 1)
          }
          } else {
          return nil
        };
      });

      return (Opal.defn(self, '$stand', function() {
        var self = this;

        self.current_image = 0;
        return self.ticks_on_current_image = 0;
      }), nil) && 'stand';
    })($scope.base, null)
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["dare/window"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$attr_accessor', '$attr_reader', '$[]', '$[]=', '$new', '$default_canvas', '$default_canvas=', '$add_mouse_event_listener', '$add_keyboard_event_listeners', '$update', '$canvas', '$draw', '$on', '$get_cursor_position', '$x', '$find', '$id', '$get_key_id', '$fill', '$page_x', '$page_y', '$Document', '$+', '$scrollLeft', '$documentElement', '$scrollTop', '$body', '$-', '$context']);
  return (function($base) {
    var $Dare, self = $Dare = $module($base, 'Dare');

    var def = self.$$proto, $scope = self.$$scope;

    (function($base, $super) {
      function $Color(){};
      var self = $Color = $klass($base, $super, 'Color', $Color);

      var def = self.$$proto, $scope = self.$$scope;

      self.$attr_accessor("red", "green", "blue");

      return (Opal.defn(self, '$initialize', function(color) {
        var self = this;

        return nil;
      }), nil) && 'initialize';
    })($scope.base, null);

    (function($base, $super) {
      function $Window(){};
      var self = $Window = $klass($base, $super, 'Window', $Window);

      var def = self.$$proto, $scope = self.$$scope;

      def.canvas = def.update_interval = def.keys = nil;
      self.$attr_reader("width", "height", "ticks", "mouse_x", "mouse_y", "canvas", "key", "update_interval");

      Opal.defn(self, '$initialize', function(opts) {
        var $a, $b, $c, self = this;

        if (opts == null) {
          opts = $hash2([], {})
        }
        ($a = "width", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 640)));
        ($a = "height", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 480)));
        ($a = "update_interval", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 16.666666)));
        ($a = "border", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, false)));
        ($a = "canvas", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, $scope.get('Canvas').$new($hash2(["width", "height", "border"], {"width": opts['$[]']("width"), "height": opts['$[]']("height"), "border": opts['$[]']("border")})))));
        ($a = "mouse", $b = opts, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, true)));
        self.width = opts['$[]']("width");
        self.height = opts['$[]']("height");
        self.update_interval = opts['$[]']("update_interval");
        self.clock = opts['$[]']("clock");
        self.canvas = opts['$[]']("canvas");
        ($a = $scope.get('Dare'), ((($b = $a.$default_canvas()) !== false && $b !== nil) ? $b : $a['$default_canvas='](self.canvas)));
        self.keys = [];
        if ((($a = opts['$[]']("mouse")) !== nil && (!$a.$$is_boolean || $a == true))) {
          self.$add_mouse_event_listener()};
        return self.$add_keyboard_event_listeners();
      });

      Opal.defn(self, '$run!', function() {
        var self = this;

        
        function update_loop() {
          self.$update();
        }
        function anim_loop() {
          requestAnimationFrame(anim_loop);
          self.canvas.$canvas().width = self.canvas.$canvas().width;
          self.$draw();
        }
        setInterval(update_loop, self.update_interval);
        requestAnimationFrame(anim_loop);
      ;
      });

      Opal.defn(self, '$draw', function() {
        var self = this;

        return nil;
      });

      Opal.defn(self, '$update', function() {
        var self = this;

        return nil;
      });

      Opal.defn(self, '$add_mouse_event_listener', function() {
        var $a, $b, TMP_1, self = this;

        return ($a = ($b = $scope.get('Element').$find("#" + (self.canvas.$id()))).$on, $a.$$p = (TMP_1 = function(event){var self = TMP_1.$$s || this, coords = nil;
if (event == null) event = nil;
        coords = self.$get_cursor_position(event);
          self.mouse_x = coords.$x()['$[]']("x");
          return self.mouse_y = coords.$x()['$[]']("y");}, TMP_1.$$s = self, TMP_1), $a).call($b, "mousemove");
      });

      Opal.defn(self, '$add_keyboard_event_listeners', function() {
        var $a, $b, TMP_2, $c, TMP_3, $d, TMP_4, self = this;

        ($a = ($b = $scope.get('Element').$find("html")).$on, $a.$$p = (TMP_2 = function(event){var self = TMP_2.$$s || this;
          if (self.keys == null) self.keys = nil;
if (event == null) event = nil;
        return self.keys['$[]='](self.$get_key_id(event), true)}, TMP_2.$$s = self, TMP_2), $a).call($b, "keydown");
        ($a = ($c = $scope.get('Element').$find("html")).$on, $a.$$p = (TMP_3 = function(event){var self = TMP_3.$$s || this;
          if (self.keys == null) self.keys = nil;
if (event == null) event = nil;
        return self.keys['$[]='](self.$get_key_id(event), false)}, TMP_3.$$s = self, TMP_3), $a).call($c, "keyup");
        return ($a = ($d = Opal.get('Window')).$on, $a.$$p = (TMP_4 = function(event){var self = TMP_4.$$s || this;
          if (self.keys == null) self.keys = nil;
if (event == null) event = nil;
        return self.keys.$fill(false)}, TMP_4.$$s = self, TMP_4), $a).call($d, "blur");
      });

      Opal.defn(self, '$button_down?', function(button) {
        var self = this;

        return self.keys['$[]'](button);
      });

      Opal.defn(self, '$get_cursor_position', function(event) {
        var $a, $b, self = this, x = nil, y = nil, doc = nil;

        if ((($a = (($b = event.$page_x(), $b !== false && $b !== nil ?event.$page_y() : $b))) !== nil && (!$a.$$is_boolean || $a == true))) {
          x = event.$page_x();
          y = event.$page_y();
          } else {
          doc = $scope.get('Opal').$Document()['$[]'](0);
          x = $rb_plus($rb_plus(event['$[]']("clientX"), doc.$scrollLeft()), doc.$documentElement().$scrollLeft());
          y = $rb_plus($rb_plus(event['$[]']("clientY"), doc.$body().$scrollTop()), doc.$documentElement().$scrollTop());
        };
        x = $rb_minus(x, self.canvas.$canvas().offsetLeft);
        y = $rb_minus(y, self.canvas.$canvas().offsetTop);
        return $scope.get('Coordinates').$new($hash2(["x", "y"], {"x": x, "y": y}));
      });

      Opal.defn(self, '$get_key_id', function(event) {
        var self = this;

        return event['$[]']("keyCode");
      });

      Opal.defn(self, '$draw_rect', function(opts) {
        var self = this, x = nil, y = nil, width = nil, height = nil, color = nil;

        if (opts == null) {
          opts = $hash2([], {})
        }
        x = opts['$[]']("top_left")['$[]'](0);
        y = opts['$[]']("top_left")['$[]'](1);
        width = opts['$[]']("width");
        height = opts['$[]']("height");
        color = opts['$[]']("color");
        self.canvas.$context().fillStyle = color;
        return self.canvas.$context().fillRect(x, y, width, height);
      });

      Opal.defn(self, '$draw_quad', function(x1, y1, c1, x2, y2, c2, x3, y3, c3, x4, y4, c4, z) {
        var self = this;

        
        var QUALITY = 256;

        var canvas_colors = document.createElement( 'canvas' );
        canvas_colors.width = 2;
        canvas_colors.height = 2;

        var context_colors = canvas_colors.getContext( '2d' );
        context_colors.fillStyle = 'rgba(0,0,0,1)';
        context_colors.fillRect( 0, 0, 2, 2 );

        var image_colors = context_colors.getImageData( 0, 0, 2, 2 );
        var data = image_colors.data;

        var canvas_render = self.canvas;

        var context_render = self.canvas.$context();
        context_render.translate( - QUALITY / 2, - QUALITY / 2 );
        context_render.scale( QUALITY, QUALITY );

        data[ 0 ] = 255; // Top-left, red component
        data[ 5 ] = 255; // Top-right, green component
        data[ 10 ] = 255; // Bottom-left, blue component

        context_colors.putImageData( image_colors, 0, 0 );
        context_render.drawImage( canvas_colors, 0, 0 );
      
      });

      Opal.defn(self, '$caption=', function(title) {
        var self = this;

        return document.getElementById('pageTitle').innerHTML = title;
      });

      Opal.alias(self, 'title=', 'caption=');

      Opal.defn(self, '$fullscreen?', function() {
        var self = this;

        return false;
      });

      return (Opal.defn(self, '$text_input', function() {
        var self = this;

        return nil;
      }), nil) && 'text_input';
    })($scope.base, null);

    (function($base, $super) {
      function $Coordinates(){};
      var self = $Coordinates = $klass($base, $super, 'Coordinates', $Coordinates);

      var def = self.$$proto, $scope = self.$$scope;

      return nil;
    })($scope.base, $scope.get('Struct').$new("x", "y"));
  })($scope.base)
};

/* Generated by Opal 0.9.2 */
Opal.modules["dare"] = function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$require', '$require_tree', '$attr_accessor']);
  self.$require("opal");
  self.$require("opal-jquery");
  self.$require_tree("dare");
  return (function($base) {
    var $Dare, self = $Dare = $module($base, 'Dare');

    var def = self.$$proto, $scope = self.$$scope;

    Opal.cdecl($scope, 'VERSION', "0.2.0");

    Opal.defs(self, '$offset_x', function(angle, magnitude) {
      var self = this;

      return magnitude*Math.cos(-angle*Math.PI/180.0);
    });

    Opal.defs(self, '$offset_y', function(angle, magnitude) {
      var self = this;

      return magnitude*Math.sin(-angle*Math.PI/180.0);
    });

    Opal.defs(self, '$ms', function() {
      var self = this;

      return (new Date()).getTime();
    });

    Opal.defs(self, '$distance', function(x1, y1, x2, y2) {
      var self = this;

      return Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));
    });

    (function(self) {
      var $scope = self.$$scope, def = self.$$proto;

      return self.$attr_accessor("default_canvas")
    })(Opal.get_singleton_class(self));
  })($scope.base);
};

/* Generated by Opal 0.9.2 */
(function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2, $range = Opal.range;

  Opal.add_stubs(['$require', '$new', '$-', '$reset', '$each', '$draw', '$*', '$[]', '$length', '$button_down?', '$[]=', '$+', '$normalize', '$handle_enemies', '$winning?', '$reinit', '$loosing?', '$private', '$push', '$rand', '$<', '$abs', '$/', '$any?', '$collision?', '$>', '$close', '$map', '$==', '$random_mouvement', '$dup', '$run!']);
  self.$require("jquery");
  self.$require("opal");
  self.$require("opal-jquery");
  self.$require("dare");
  (function($base, $super) {
    function $Toto(){};
    var self = $Toto = $klass($base, $super, 'Toto', $Toto);

    var def = self.$$proto, $scope = self.$$scope, TMP_1;

    def.koala_sprite = def.player = def.enemies = def.flag_sprite = def.flag = def.font = def.speed = nil;
    Opal.cdecl($scope, 'SPRITE_SIZE', 128);

    Opal.cdecl($scope, 'WINDOW_X', 1024);

    Opal.cdecl($scope, 'WINDOW_Y', 768);

    Opal.defn(self, '$initialize', TMP_1 = function() {
      var self = this, $iter = TMP_1.$$p, $yield = $iter || nil;

      TMP_1.$$p = null;
      Opal.find_super_dispatcher(self, 'initialize', TMP_1, null).apply(self, [$hash2(["width", "height", "border"], {"width": 1024, "height": 768, "border": true})]);
      self.background_sprite = (($scope.get('Dare')).$$scope.get('Image')).$new("images/background.png");
      self.koala_sprite = (($scope.get('Dare')).$$scope.get('Image')).$new("images/koala.png");
      self.enemy_sprite = (($scope.get('Dare')).$$scope.get('Image')).$new("images/enemy.png");
      self.flag_sprite = (($scope.get('Dare')).$$scope.get('Image')).$new("images/flag.png");
      self.flag = $hash2(["x", "y"], {"x": $rb_minus($scope.get('WINDOW_X'), $scope.get('SPRITE_SIZE')), "y": $rb_minus($scope.get('WINDOW_Y'), $scope.get('SPRITE_SIZE'))});
      self.music = (($scope.get('Dare')).$$scope.get('Sound')).$new("musics/koala.wav");
      self.font = (($scope.get('Dare')).$$scope.get('Font')).$new($hash2(["font", "size", "color"], {"font": "Helvetica", "size": 20, "color": "black"}));
      return self.$reset();
    });

    Opal.defn(self, '$draw', function() {
      var $a, $b, TMP_2, $c, TMP_4, self = this;

      ($a = ($b = ($range(0, 8, false))).$each, $a.$$p = (TMP_2 = function(x){var self = TMP_2.$$s || this, $a, $b, TMP_3;
if (x == null) x = nil;
      return ($a = ($b = ($range(0, 8, false))).$each, $a.$$p = (TMP_3 = function(y){var self = TMP_3.$$s || this;
          if (self.background_sprite == null) self.background_sprite = nil;
if (y == null) y = nil;
        return self.background_sprite.$draw($rb_times(x, $scope.get('SPRITE_SIZE')), $rb_times(y, $scope.get('SPRITE_SIZE')))}, TMP_3.$$s = self, TMP_3), $a).call($b)}, TMP_2.$$s = self, TMP_2), $a).call($b);
      self.koala_sprite.$draw(self.player['$[]']("x"), self.player['$[]']("y"));
      ($a = ($c = self.enemies).$each, $a.$$p = (TMP_4 = function(enemy){var self = TMP_4.$$s || this;
        if (self.enemy_sprite == null) self.enemy_sprite = nil;
if (enemy == null) enemy = nil;
      return self.enemy_sprite.$draw(enemy['$[]']("x"), enemy['$[]']("y"))}, TMP_4.$$s = self, TMP_4), $a).call($c);
      self.flag_sprite.$draw(self.flag['$[]']("x"), self.flag['$[]']("y"));
      return self.font.$draw("Level " + (self.enemies.$length()), $rb_minus($scope.get('WINDOW_X'), 100), 10);
    });

    Opal.defn(self, '$update', function() {
      var $a, $b, self = this;

      if ((($a = self['$button_down?']((($scope.get('Dare')).$$scope.get('KbRight')))) !== nil && (!$a.$$is_boolean || $a == true))) {
        ($a = "x", $b = self.player, $b['$[]=']($a, $rb_plus($b['$[]']($a), self.speed)))};
      if ((($a = self['$button_down?']((($scope.get('Dare')).$$scope.get('KbLeft')))) !== nil && (!$a.$$is_boolean || $a == true))) {
        ($a = "x", $b = self.player, $b['$[]=']($a, $rb_minus($b['$[]']($a), self.speed)))};
      if ((($a = self['$button_down?']((($scope.get('Dare')).$$scope.get('KbDown')))) !== nil && (!$a.$$is_boolean || $a == true))) {
        ($a = "y", $b = self.player, $b['$[]=']($a, $rb_plus($b['$[]']($a), self.speed)))};
      if ((($a = self['$button_down?']((($scope.get('Dare')).$$scope.get('KbUp')))) !== nil && (!$a.$$is_boolean || $a == true))) {
        ($a = "y", $b = self.player, $b['$[]=']($a, $rb_minus($b['$[]']($a), self.speed)))};
      self.player['$[]=']("x", self.$normalize(self.player['$[]']("x"), $rb_minus($scope.get('WINDOW_X'), $scope.get('SPRITE_SIZE'))));
      self.player['$[]=']("y", self.$normalize(self.player['$[]']("y"), $rb_minus($scope.get('WINDOW_Y'), $scope.get('SPRITE_SIZE'))));
      self.$handle_enemies();
      if ((($a = self['$winning?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        self.$reinit()};
      if ((($a = self['$loosing?']()) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$reset()
        } else {
        return nil
      };
    });

    self.$private();

    Opal.defn(self, '$reset', function() {
      var self = this;

      self.enemies = [];
      self.speed = 3;
      return self.$reinit();
    });

    Opal.defn(self, '$reinit', function() {
      var self = this;

      self.speed = $rb_plus(self.speed, 1);
      self.player = $hash2(["x", "y"], {"x": 0, "y": 0});
      return self.enemies.$push($hash2(["x", "y"], {"x": $rb_plus(500, self.$rand(100)), "y": $rb_plus(200, self.$rand(300))}));
    });

    Opal.defn(self, '$collision?', function(a, b) {
      var $a, self = this;

      return ($a = $rb_lt(($rb_minus(a['$[]']("x"), b['$[]']("x"))).$abs(), $rb_divide($scope.get('SPRITE_SIZE'), 2)), $a !== false && $a !== nil ?$rb_lt(($rb_minus(a['$[]']("y"), b['$[]']("y"))).$abs(), $rb_divide($scope.get('SPRITE_SIZE'), 2)) : $a);
    });

    Opal.defn(self, '$loosing?', function() {
      var $a, $b, TMP_5, self = this;

      return ($a = ($b = self.enemies)['$any?'], $a.$$p = (TMP_5 = function(enemy){var self = TMP_5.$$s || this;
        if (self.player == null) self.player = nil;
if (enemy == null) enemy = nil;
      return self['$collision?'](self.player, enemy)}, TMP_5.$$s = self, TMP_5), $a).call($b);
    });

    Opal.defn(self, '$winning?', function() {
      var self = this;

      return self['$collision?'](self.player, self.flag);
    });

    Opal.defn(self, '$random_mouvement', function() {
      var self = this;

      return ($rb_minus(self.$rand(3), 1));
    });

    Opal.defn(self, '$normalize', function(v, max) {
      var $a, self = this;

      if ((($a = $rb_lt(v, 0)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return 0
      } else if ((($a = $rb_gt(v, max)) !== nil && (!$a.$$is_boolean || $a == true))) {
        return max
        } else {
        return v
      };
    });

    Opal.defn(self, '$handle_quit', function() {
      var $a, self = this;

      if ((($a = self['$button_down?']((($scope.get('Dare')).$$scope.get('KbEscape')))) !== nil && (!$a.$$is_boolean || $a == true))) {
        return self.$close()
        } else {
        return nil
      };
    });

    return (Opal.defn(self, '$handle_enemies', function() {
      var $a, $b, TMP_6, self = this;

      return self.enemies = ($a = ($b = self.enemies).$map, $a.$$p = (TMP_6 = function(enemy){var self = TMP_6.$$s || this, $a, $b, $c, new_enemy = nil;
        if (self.speed == null) self.speed = nil;
        if (self.flag == null) self.flag = nil;
if (enemy == null) enemy = nil;
      ($a = "timer", $b = enemy, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 0)));
        if (enemy['$[]']("timer")['$=='](0)) {
          enemy['$[]=']("result_x", self.$random_mouvement());
          enemy['$[]=']("result_y", self.$random_mouvement());
          enemy['$[]=']("timer", $rb_plus(50, self.$rand(50)));};
        ($a = "timer", $b = enemy, $b['$[]=']($a, $rb_minus($b['$[]']($a), 1)));
        new_enemy = enemy.$dup();
        ($a = "x", $b = new_enemy, $b['$[]=']($a, $rb_plus($b['$[]']($a), $rb_times(new_enemy['$[]']("result_x"), self.speed))));
        ($a = "y", $b = new_enemy, $b['$[]=']($a, $rb_plus($b['$[]']($a), $rb_times(new_enemy['$[]']("result_y"), self.speed))));
        new_enemy['$[]=']("x", self.$normalize(new_enemy['$[]']("x"), $rb_minus($scope.get('WINDOW_X'), $scope.get('SPRITE_SIZE'))));
        new_enemy['$[]=']("y", self.$normalize(new_enemy['$[]']("y"), $rb_minus($scope.get('WINDOW_Y'), $scope.get('SPRITE_SIZE'))));
        if ((($a = self['$collision?'](new_enemy, self.flag)) !== nil && (!$a.$$is_boolean || $a == true))) {
          } else {
          enemy = new_enemy
        };
        return enemy;}, TMP_6.$$s = self, TMP_6), $a).call($b);
    }), nil) && 'handle_enemies';
  })($scope.base, (($scope.get('Dare')).$$scope.get('Window')));
  return $scope.get('Toto').$new()['$run!']();
})(Opal);

/* Generated by Opal 0.9.2 */
(function(Opal) {
  Opal.dynamic_require_severity = "error";
  var OPAL_CONFIG = { method_missing: true, arity_check: false, freezing: true, tainting: true };
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$exit']);
  return $scope.get('Kernel').$exit()
})(Opal);
