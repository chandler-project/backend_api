let fs = require('fs')
  , uuidV1 = require('uuid/v1')
  , path = require('path')
  , async = require('async')
  , request = require('request')
  , loopback = require('loopback')
  , url = require('url')
  , configs = loopback.getConfigs()
  , fileUploadSettings = configs.dataSources.storage.settings;

module.exports = function (Upload) {
  Upload.prefixError = "UPL_";

  Upload.disableRemoteMethodByName('createContainer', true);
  Upload.disableRemoteMethodByName('destroyContainer', true);
  Upload.disableRemoteMethodByName('getContainer', true);
  Upload.disableRemoteMethodByName('getContainers', true);

  function strNoneSpecialChar(strIn) {
    strIn = strIn.toLowerCase();
    strIn = strIn.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    strIn = strIn.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    strIn = strIn.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    strIn = strIn.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    strIn = strIn.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    strIn = strIn.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    strIn = strIn.replace(/đ/g, "d");
    strIn = strIn.replace(/!|@|\$|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\:|\'| |\"|\&|\#|\[|\]|~/g, "-");
    strIn = strIn.replace(/[^\040-\176\200-\377]/gi, "-");
    strIn = strIn.replace(/-+-/g, "-");
    strIn = strIn.replace(/^\-+|\-+$/g, "");
    return strIn;
  }

  let fn_adjustFileName = function (fileBaseName) {
    fileBaseName = fileBaseName.toLowerCase().replace(/(\.(gif|jpe?g|png)).*/g, '$1').replace(/\?.*$/g, '');
    if (fileBaseName.indexOf('.') === -1) {
      fileBaseName = fileBaseName + '.jpg';
    }
    else {
      var ext = fileBaseName.split('.').pop();
    }
    return strNoneSpecialChar(fileBaseName);
  };


  // Overwrite method createContainer of Upload model
  Upload.generateContainer = function (ctx, callback) {
    let accessToken = ctx.req ? ctx.req.accessToken : ctx.get('accessToken');
    if (accessToken && accessToken.userId) {
      let userId = accessToken.userId;
      let today = new Date();
      let time = today.valueOf(); // 1412744798047 - total miliseconds from 1970 to now.
      let str_plain = userId.toString().concat(time, Math.random());
      let str_hash = node_hash.sha1(str_plain);
      let container_name = PREFIX_TEMP_DIR + str_hash;
      let containerOptions = {name: container_name};
      Upload.createContainer(containerOptions, function (err, container) {
        if (!err) {
          callback(null, container);
        } else if (err.code === 'EEXIST') {
          Upload.generateContainer(ctx, callback);
        } else {
          let error = new Error('Cannot create container');
          error.code = Upload.prefixError + "GC01";
          callback(error);
        }
      });
    } else {
      let error = new Error('Can not get accessToken');
      error.code = "BAD_REQUEST";
      callback(error);
    }
  };

  var fn_rename = function (file, toName, callback) {
    file.name = toName;
    callback();
  };
  var fn_getNewName = function (inFileName, callback) {
    var ext = inFileName.split('.').pop()
      , pre_name = inFileName.replace('.' + ext, '')
      , uuid = uuidV1();
    callback(null, pre_name + "_" + uuid + "." + ext);
  };

  var fn_UpdateResponse = function (file, callback) {
    Upload.getFile(fileUploadSettings.container, file.originalFilename, function (err1, fileObj1) {
      if (err1) {//File is not exists
        fn_rename(file, file.originalFilename, function () {
          callback(null, {'container': fileUploadSettings.container, 'name': file.originalFilename});
        });
      } else {
        fn_getNewName(file.originalFilename, function (err, outFileName) {
          if (err) {
            callback(null, null);
          } else {
            fn_rename(file, outFileName, function () {
              callback(null, {'container': fileUploadSettings.container, 'name': outFileName});
            });
          }
        });
      }
    });
  };

  Upload.uploadURL = function (options, callback) {
    let files = options.files || [];
    if (typeof files !== 'undefined' && files) {
      // Convert to array if files is object
      if (!Array.isArray(files)) {
        files = [files];
      }
      let responseFiles = [];
      let mixedPath = path.join(configs.app_path, 'images', fileUploadSettings.container);
      if (!fs.existsSync(mixedPath)) {
        try {
          fs.mkdirSync(mixedPath);
        }
        catch (err) {
          callback(err);
        }
      }
      let fileType = '', fileBaseName = '', file_path = '';
      let options = {
        url: '',
        headers: {
          'User-Agent': 'request'
        }
      };
      async.eachSeries(files, function (uploadURL, nextFile) {
        let protocol = url.parse(uploadURL).protocol;
        if (uploadURL === '' || (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'data:')) nextFile();
        else {
          fileBaseName = fn_adjustFileName(path.basename(uploadURL));
          if (fileBaseName.length > 70) {
            fileBaseName = "too-long-name.jpg";
          }

          file_path = path.join(mixedPath, fileBaseName);
          options.url = uploadURL;
          request.get(options)
            .on('error', function (err) {
              nextFile(err);
            })
            .on('response', function (response) {
              fileType = response.headers['content-type'];
            })
            .pipe(fs.createWriteStream(file_path)).on('close', function () {
            responseFiles.push(fileBaseName);
            nextFile();
          });
        }
      }, function (err, rs) {
        if (err) {
          callback(err);
        }
        else {
          callback(null, responseFiles);
        }
      });
    }
    else {
      callback(null, null)
    }
  };
  Upload.getFileName = function (url, next) {
    return fn_adjustFileName(path.basename(url));
  };

  Upload.remoteMethod(
    'upload',
    {
      accepts: [
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}}
      ],
      description: 'Support more types of to-be-uploaded file',
      http: {verb: 'post', path: '/upload'},
      returns: {arg: 'result', type: 'object'}
    }
  );

  Upload.remoteMethod(
    'uploadURL',
    {
      accessType: 'WRITE',
      accepts: [
        {
          arg: 'data', type: 'any', description: '{"files":["url1","url2"]}', required: true,
          http: {source: 'body'}
        }
      ],
      description: 'Support more types of to-be-uploaded file',
      http: {verb: 'post', path: '/uploadURL'},
      returns: {arg: 'data', type: 'any', root: true}
    }
  );
};
