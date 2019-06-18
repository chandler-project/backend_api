'use strict';

let loopback = require('loopback');
let boot = require('loopback-boot');
let app = module.exports = loopback();

// Add function to get app settings.
loopback.getConfigs = function () {
  return {
    // config in config.<env>.json.
    "configs": app.settings,
    // config in datasources.<env>.json.
    "dataSources": app.dataSources,
    "app_path": __dirname
  };
};


app.start = function () {
  // start the web server
  let server = app.listen(function () {
    app.emit('started');
    let baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      let explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
  return server;
};

boot(app, __dirname, (err) => {
  if (err) throw err;
  if (require.main === module) {
    app.io = require('socket.io')(app.start());
    require('socketio-auth')(app.io, {
      authenticate: function (socket, value, callback) {
        socket.client.accessToken = null;
        socket.client.userId = null;

        if (value && value.userId && value.id) {
          let AccessToken = app.models.AccessToken;
          let token = AccessToken.findOne({
            where: {
              and: [{userId: value.userId}, {id: value.id}],
            },
          }, function (err, tokenDetail) {
            if (err) throw err;
            if (tokenDetail) {
              // add user Id to app connections
              socket.client.accessToken = tokenDetail;
              socket.client.userId = value.userId;

              callback(null, true);
            } else {
              callback(null, true);
            }
          });
        } else {
          callback(null, true);
        }
      },
      postAuthenticate: function (socket, data) {
        console.log('User connected User:', socket.client.userId ? socket.client.userId : 'anonymous');
        if (socket.client.userId) {
          app.models.Member.updateAll({
            id: socket.client.userId,
          }, {
            socketId: socket.id,
          }, (err) => {
            console.log('Update user successfully');
          });
        }
      },
    });

    app.io.on('connection', function (socket) {
      socket.on('disconnect', function () {
        console.log('user disconnected User:', socket.client.userId ? socket.client.userId : 'anonymous');
      });
    });
  }
});

app.get('remoting').errorHandler = {
  handle: (err, req, res, defaultHandler) => {
    err = app.buildError(err);

    defaultHandler(err);
  },
  disableStackTrace: true,
};

app.buildError = (err) => {
  err.message = 'Binding error: ' + err.message;
  err.details = err.details.messages;
  if (err.name === 'ValidationError') delete err.message;
  return err;
};
