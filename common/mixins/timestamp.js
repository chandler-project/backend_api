'use strict';
module.exports = (Model, options) => {
  Model.defineProperty('created', {type: Date, default: '$now'});
  Model.defineProperty('modified', {type: Date, default: '$now'});
};
