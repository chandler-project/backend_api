'use strict';
const debug = require('debug');
module.exports = (Model, options) => {
  Model.observe('before save', (ctx, next) => {
    if (ctx.instance) {
      ctx.instance.modified = new Date();
    } else {
      ctx.data.modified = new Date();
    }

    if (ctx.isNewInstance) {
      if (typeof ctx.instance.id !== 'undefined') {
        ctx.instance.id = undefined;
      }
    }
    next();
  });
};
