# knockout.mapping

[![npm version](https://badge.fury.io/js/ko-mapping.svg)](http://badge.fury.io/js/ko-mapping)

> Object mapping plugin for [Knockout](http://knockoutjs.com/) 3.5+ with built-in types, forked from https://github.com/crissdev/knockout.mapping.


## Documentation

Official documentation [here](http://knockoutjs.com/documentation/plugins-mapping.html).


## Install

#### NPM

```sh
npm install ko-mapping --save
```


## Quick Start

```js

var data = {
    email: 'demo@example.com',
    name: 'demo',
    addresses: [
        { type: 'home', country: 'Romania', city: 'Cluj' },
        { type: 'work', country: 'Spain', city: 'Barcelona' }
    ]
};

// Create a view model from data
var viewModel = ko.mapping.fromJS(data);

// Now use the viewModel to change some values (properties are now observable)
viewModel.email('demo2@example.com');
viewModel.name('demo2');
viewModel.addresses()[0].city('Bucharest');

// Retrieve the updated data (as JS object)
var newData = ko.mapping.toJS(viewModel);

// newData now looks like this
{
  email: 'demo2@example.com',
  name: 'demo2',
  addresses: [
    { type: 'home', country: 'Romania', city: 'Bucharest' },
    { type: 'work', country: 'Spain', city: 'Barcelona' }
  ]
}

```

Run this example in [JSFiddle](http://jsfiddle.net/wmeqx7ss/280/).


## Migrating from knockout.mapping or knockout-mapping?

```bash
npm uninstall knockout-mapping
# or
npm uninstall knockout.mapping

npm install ko-mapping
```

### Update imports

Update all your imports:

```diff
- import mapping from 'knockout-mapping';
+ import mapping from 'ko-mapping';
```


### Update types

If you used `KnockoutObservableType` (or [any of the other types](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/knockout.mapping/index.d.ts)) from the old `@types/knockout.mapping` package, you need to update to use `MappedObservable`:


```diff
- const myObj: KnockoutObservableType<SomeObject>;
+ import { MappedObservable } from 'ko-mapping';
+ const myObj: MappedObservable<SomeObject>;
```

If you happened to still use some types from `@types/knockout` (you shouldn't; types are included with Knockout 3.5), you need to update those as well. You might have used `KnockoutSubcription` or `KnockoutObservable`; use `ko.Subscription` or `ko.Observable` instead.

## Test

Unless `CI` environment variable is defined, the tests use the latest version Knockout.


## License

[MIT](http://www.opensource.org/licenses/mit-license.php)
