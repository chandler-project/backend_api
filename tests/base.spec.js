'use strict';

let supertest = require('supertest');
let async = require('async');
let constants = require('./constants.json');

module.exports = {
  run: function(conf, app, url, callback) {
    let server;
    let agent = supertest.agent(url);
    let baseURL = '/';

    if (typeof conf !== 'object') {
      return callback('Failed to load test configuration from file');
    }

    if (app) {
      before(function(done) {
        server = app.listen(done);
      });

      after(function(done) {
        server.close(done);
      });
    }

    describe('PMP API', function() {
      async.each(conf, function(c, asyncCallback) {
        if (!c.hasOwnProperty('method')) {
          callback('Test has no method specified');
          return asyncCallback();
        }

        if (!c.hasOwnProperty('model')) {
          callback('Test has no route specified');
          return asyncCallback();
        }

        if (!c.hasOwnProperty('expect')) {
          callback('Test has no expected response code specified');
          return asyncCallback();
        }

        let hasData = (c.hasOwnProperty('withData'));
        let isWithAuthentication = (c.hasOwnProperty('username') && c.hasOwnProperty('password'));
        let authenticationDescription = (isWithAuthentication) ? 'authenticated' : 'unauthenticated';
        let description = 'should respond ' + c.expect + ' on ' + authenticationDescription + ' ' +
          c.method + ' requests to /' + c.model;
        let parsedMethod;
        var loginBlock;

        if (c.method.toUpperCase() === 'GET') {
          parsedMethod = agent.get(baseURL + c.model);
        } else if (c.method.toUpperCase() === 'POST') {
          parsedMethod = agent.post(baseURL + c.model);
        } else if (c.method.toUpperCase() === 'PUT') {
          parsedMethod = agent.put(baseURL + c.model);
        } else if (c.method.toUpperCase() === 'DELETE') {
          parsedMethod = agent.delete(baseURL + c.model);
        } else if (c.method.toUpperCase() === 'PATCH') {
          parsedMethod = agent.patch(baseURL + c.model);
        } else {
          callback('Test has an unrecognized method type');
          return asyncCallback();
        }

        var parseMessage = function(statusCode) {
          return constants[statusCode];
        };

        if (isWithAuthentication) {
          loginBlock = function(loginCallback) {
            agent
              .post(baseURL + 'Members/login')
              .send({
                email: c.username,
                password: c.password,
                ttl: '1209600000',
              })
              .set('Accept', 'application/json')
              .set('Content-Type', 'application/json')
              .expect(200)
              .end(function(err, authRes) {
                if (err) {
                  return loginCallback('Could not log in with provided' +
                    ' credentials', null);
                }

                let token = authRes.body.data.id;
                return loginCallback(null, token);
              });
          };
        } else {
          loginBlock = function(loginCallback) {
            return loginCallback(null, null);
          };
        }

        it(description, function(done) {
          loginBlock(function(loginError, loginToken) {
            if (loginError) {
              done(loginError);
              return asyncCallback();
            }

            if (loginToken) {
              parsedMethod = parsedMethod.set('Authorization', loginToken);
            }

            if (hasData) {
              parsedMethod = parsedMethod.send(c.withData)
                .set('Content-Type', 'application/json');
            }
            parsedMethod
              .expect(c.expect)
              .end(function(err, res) {
                let statusCode = res.body.error && res.body.error.statusCode;
                if (statusCode === null) statusCode = 200;
                if (statusCode !== c.expect) {
                  done(new Error(`expected ${c.expect} ` +
                    `"${parseMessage(c.expect)}",` +
                    ` got ${statusCode} "${parseMessage(statusCode)}"`));
                  return asyncCallback();
                } else {
                  done();
                  return asyncCallback();
                }
              });
          });
        });
      });
    });
  },
};
