'use strict';
let base = require('./base.spec');
let config = require('./member.spec.json');
let app = require('../server/server');
let url = 'http://0.0.0.0:3000/api';

base.run(config, app, url, function(err) {
  if (err) {
    console.log(err);
  }
});
