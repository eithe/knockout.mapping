# knockout.mapping

[![npm version](https://badge.fury.io/js/knockout-mapping.svg)](http://badge.fury.io/js/ko-mapping)

> Object mapping plugin for [Knockout](http://knockoutjs.com/) with built-in types, forked from https://github.com/crissdev/knockout.mapping


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


## Test

Unless `CI` environment variable is defined, the tests use the latest version Knockout.


## License

[MIT](http://www.opensource.org/licenses/mit-license.php)
