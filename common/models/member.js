let validator = require('validator')
    , path = require('path')
    , loopback = require('loopback')
    , clone = require('clone')
    , async = require('async')
    , errorCodes = require('../../server/configs/error-codes')
    , fs = require('fs')
    , util = require('util')
    , raw = require('facebook-api').raw
    , querystring = require('querystring')
    , Request = require('request')
    , CryptoJS = require('crypto-js');

const MEMBER_TYPES = {USER: 1, ADMIN: 2}
    , SALT_WORK_FACTOR = 10
    , SOCIAL_DEFAULT_EMAIL = '@chandler.com'
    , MALE = 1
    , FEMALE = 2
    , DEFAULT_MEMBER_TITLE = 'Member'
;

let bcrypt;
try {
    bcrypt = require('bcrypt');
    if (bcrypt && typeof bcrypt.compare !== 'function') {
        bcrypt = require('bcryptjs');
    }
} catch (err) {
    bcrypt = require('bcryptjs');
}

module.exports = function (Member) {

    Member.prefixError = "MEM_";

    function getKey(object, value) {
        for (let key in object) {
            if (object[key] === value) {
                return key;
            }
        }
        return null;
    }

    Member.handlerError = (message, statusCode, next) => {
        let c = getKey(errorCodes, statusCode);
        let error = new Error(message);
        error.statusCode = statusCode;
        error.code = c || 'UNKNOWN_ERROR';
        return next(error);
    };

    Member.observe('before save', function (ctx, next) {
        // Create new user.
        if (ctx.instance) {
            if (!ctx.instance.emailVerified) {
                ctx.instance.verificationToken = Member.generateVerificationToken();
            }
        }

        // Update current Member.
        if (ctx.currentInstance) {
            ctx.currentInstance.modified = new Date();
        }

        next();
    });

    Member.prototype.verify = function (next) {
        let createUser = this;
        let options = {
            "to": createUser.email,
            "from": Member.app.get('emailFrom'),
            "subject": Member.app.get('emailRegistrationSubject'),
            "html": '',
            "text": ''
        };

        // Not send mail if in dev local.
        let configs = loopback.getConfigs();
        if (configs.dataSources.mandrillsmtp.settings.transports[0].auth.user === 'UserName') {
            console.log('On DEV local, didn\'t config send mail.');
            return next(null, {email: createUser.email, token: createUser.verificationToken, uid: createUser.id});
        }

        options.redirect = Member.app.get('publicWebRegistrationRedirectURL');
        if (createUser.type.indexOf(MEMBER_TYPES.ADMIN) !== -1) {
            options.redirect = options.redirect.replace('{userdomain}', Member.app.get('domainAdmin'));
        } else {
            options.redirect = options.redirect.replace('{userdomain}', Member.app.get('domainShopping'));
        }
        options.redirect = options.redirect + '?uid=' + createUser.id + '&token=' + createUser.verificationToken;

        options.template = path.resolve(path.join(__dirname, '..', '..', 'server', 'templates', 'verify.ejs'));
        options.lastName = createUser.lastName || createUser.firstName || createUser.fullName || createUser.email;

        // For plain/text
        options.text = 'Please verify your email by opening this link in a web browser:\n\t{href}';
        options.text = options.text.replace(/\{href\}/g, options.redirect);

        // For HTML mail.
        let template = loopback.template(options.template);
        options.html = template(options);

        // Email model.
        let Email = createUser.constructor.email || loopback.getModelByType(loopback.Email);
        Email.send(options, function (err, email) {
            if (err) {
                next(err);
            } else {
                next(null, {email: createUser.email, token: createUser.verificationToken, uid: createUser.id});
            }
        });
    };

    Member.prototype.getFullName = function (next) {
        let fullName = this.fullName;
        if (!fullName) {
            fullName = this.firstName + ' ' + this.lastName;
        }
        return fullName;
    };

    /**
     * Confirm the user's identity.
     *
     * @param {Any} userId
     * @param {String} token The validation token
     * @param {String} redirect URL to redirect the user to once confirmed
     * @callback {Function} callback
     * @param {Error} err
     */
    Member.confirm = function (uid, token, redirect, fn) {
        this.findById(uid, function (err, user) {
            if (err) {
                fn(err);
            } else {
                if (user && user.emailVerified) {
                    err = new Error('This user account has already been verified');
                    err.statusCode = 400;
                    err.code = 'ALREADY_VERIFIED';
                    fn(err);
                } else if (user && (user.verificationToken && user.verificationToken === token)) {
                    Member.initStore(user, fn);
                } else {
                    if (user) {
                        err = new Error('Invalid token: ' + token);
                        err.statusCode = 400;
                        err.code = 'INVALID_TOKEN';
                    } else {
                        err = new Error('User not found: ' + uid);
                        err.statusCode = 404;
                        err.code = 'USER_NOT_FOUND';
                    }
                    fn(err);
                }
            }
        });
    };

    // check if user is verified or not with Facebook Access Token
    Member.isVerifiedYet = function (fbAccessToken, cb) {
        this.findOne({where: {"fbAccessToken": fbAccessToken}}, function (err, user) {
            if (err || !user) {
                error = new Error("AccessToken is invalid");
                error.code = Member.prefixError + "IV01";
                cb(error);
            } else {
                if (!user.emailVerified || user.emailVerified === false) {
                    error = new Error("Your account has not been activated. Check your email for the activation link.");
                    error.code = Member.prefixError + "IV02";
                    cb(error);
                } else {
                    cb(null, user);
                }
            }
        });
    };

    // check if user is verified or not with userId
    Member.isVerifiedYetWithUserId = function (userId, cb) {
        this.findById(userId, function (err, user) {
            if (err || !user) {
                cb(err);
            } else {
                if (!user.emailVerified || user.emailVerified === false) {
                    error = new Error("Your account has not been activated. Check your email for the activation link.");
                    error.code = Member.prefixError + "IW01";
                    cb(error);
                } else {
                    cb(null, user);
                }
            }
        });
    };

    Member.generateVerificationToken = function () {
        const PATTERN_STRING = "0123456789AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";
        let text = "";
        for (let i = 0; i < 128; i++) {
            text += PATTERN_STRING.charAt(Math.floor(Math.random() * PATTERN_STRING.length));
        }
        return text;
    };

    Member.isValidSNAAccessToken = function (params, next) {
        if (params.accessToken) {
            raw("GET", 'me', {access_token: params.accessToken}, function (err, data) {
                if (err) {
                    let _err = new Error();
                    _err.code = 'INVALID_TOKEN';
                    _err.message = "Error validating access token.";
                    if (err.data) {
                        try {
                            let _data = JSON.parse(err.data);
                            _err.message = _data.error.message;
                        }
                        catch (e) {
                            console.log(e);
                        }
                    }
                    next(_err);
                } else {
                    next();
                }
            });
        } else {
            let error = new Error("Missing parameter: accessToken");
            error.code = "MISSING_PARAMETER";
            next(error);
        }
    };

    Member.loginByFacebook = function (params, next) {
        let credentials = params.credentials;
        let include = params.include;
        let isSMSLogin = params.isSMSLogin;
        let res;
        let error;
        if (isSMSLogin) {
            var app_access_token = ['AA', '174659806454246', '3a6f163d92bb8acacae2005850ff44e8'].join('|');
            const me_endpoint_base_url = 'https://graph.accountkit.com/v1.1/me';
            const token_exchange_base_url = 'https://graph.accountkit.com/v1.1/access_token';
            var params = {
                grant_type: 'authorization_code',
                code: credentials.code,
                access_token: app_access_token
            };
            var token_exchange_url = token_exchange_base_url + '?' + querystring.stringify(params);
            Request.get({url: token_exchange_url, json: true}, function (err, resp, respBody) {
                var view = {
                    accessToken: respBody.access_token,
                    userId: respBody.id,
                };
                const appsecret_proof = CryptoJS.HmacSHA256(respBody.access_token, '3a6f163d92bb8acacae2005850ff44e8');
                var me_endpoint_url = me_endpoint_base_url + '?access_token=' + respBody.access_token + '&appsecret_proof=' + appsecret_proof;
                console.log(me_endpoint_url);
                Request.get({url: me_endpoint_url, json: true}, function (err, resp, rsBody) {
                    console.log(rsBody);
                });
            });
        } else {
            raw("GET", 'me', {
                access_token: credentials.accessToken,
                fields: 'id,name,email,picture,gender'
            }, function (err, data) {
                if (err) {
                    error = err.data ? new Error(err.data) : err;
                    next(error);
                } else {
                    Member.processLoginConfirmation(data, credentials, params, next);
                }
            });
        }
    };

    Member.processLoginConfirmation = function (data, credentials, params, next) {
        let createdMemberParams = {
            type: [MEMBER_TYPES.USER],
            email: credentials.userId + SOCIAL_DEFAULT_EMAIL,
            emailVerified: true,
            fbAccessToken: credentials.accessToken,
        };

        async.series([
            function (ass_1) {
                // validate userId and accessToken
                if (data.id !== credentials.userId) {
                    error = new Error("Invalid parameters: userId");
                    error.code = "INVALID_PARAMETER";
                    error.field = "userId";
                    ass_1(error);
                } else {
                    ass_1();
                }
            },
            function (ass_1) {
                // set email if email in in retrieved profile
                if (data.email) {
                    createdMemberParams.email = data.email;
                }

                // set fullName if name in in retrieved profile
                if (data.name) {
                    createdMemberParams.fullName = data.name;
                }

                // set gender if gender in in retrieved profile
                if (data.gender) {
                    if (data.gender === 'male') {
                        createdMemberParams.gender = MALE;
                    } else if (data.gender === 'female') {
                        createdMemberParams.gender = FEMALE;
                    }
                }
                // set picture if avatar appear in retrieved profile
                if (data.picture && data.picture.data && data.picture.data.url) {
                    Member.app.models.Upload.uploadURL({files: data.picture.data.url}, function (err, picture) {
                        if (err) {
                            ass_1(err);
                        } else {
                            if (typeof picture[0] !== 'undefined') {
                                createdMemberParams.avatar = picture[0];
                            }
                            ass_1();
                        }
                    });
                } else {
                    ass_1();
                }
            }
        ], function (err) {
            if (err) {
                next(err);
            } else {
                Member.findOrCreateWithEmail({
                    email: data.email,
                    createdMemberParams: createdMemberParams
                }, function (err, member) {
                    if (err) {
                        next(err);
                    } else if (!member) {
                        error = new Error("Can't find or create player with email from social network.");
                        error.code = Member.prefixError + "FB01";
                        next(error);
                    } else {
                        member.generateSocialNetworkAccount(params, next);
                    }
                });
            }
        });
    }


    // Find or Create member by email
    Member.findOrCreateWithEmail = function (params, next) {
        if (typeof params.email !== 'undefined') {
            Member.findOne({
                where: {
                    email: params.email
                }
            }, function (err, foundMember) {
                if (err) {
                    next(err);
                } else if (!foundMember) {
                    Member.create(params.createdMemberParams, function (err, createdMember) {
                        if (err) {
                            next(err);
                        } else {
                            createdMember.isNewAccount = true;
                            next(null, createdMember);
                        }
                    });
                } else {
                    next(null, foundMember);
                }
            });
        } else {
            Member.create(params.createdMemberParams, function (err, createdMember) {
                if (err) {
                    next(err);
                } else {
                    createdMember.isNewAccount = true;
                    next(null, createdMember);
                }
            });
        }
    };

    Member.prototype.createAccessToken = function (ttl, options, cb) {
        if (cb === undefined && typeof options === 'function') {
            // createAccessToken(ttl, cb)
            cb = options;
            options = undefined;
        }

        cb = cb || utils.createPromiseCallback();

        let tokenData;
        if (typeof ttl !== 'object') {
            // createAccessToken(ttl[, options], cb)
            tokenData = {ttl};
        } else if (options) {
            // createAccessToken(data, options, cb)
            tokenData = ttl;
        } else {
            // createAccessToken(options, cb);
            tokenData = {};
        }
        tokenData.ttl = -1;
        this.accessTokens.create(tokenData, options, cb);
        return cb.promise;
    };

    /**
     * Generate SocialNetwork and SocialNetworkAccount for created member
     * @param {object} credentials
     * @param {array|string} include - include information from login
     */
    Member.prototype.generateSocialNetworkAccount = function (params, next) {
        // Init letiables
        let member = this,
            credentials = params.credentials,
            include = params.include;
        force = params.force;
        let SocialNetworkAccount = Member.app.models.SocialNetworkAccount;

        // create AccessToken for login
        member.createAccessToken(credentials.ttl, function (err, token) {
            if (err) {
                next(err);
            } else {
                if (Array.isArray(include) ? include.indexOf('user') !== -1 : include === 'user') {
                    token.__data.user = member;
                }
                let SNAParams = {};
                if (params.socialNetworkAccount) {
                    SNAParams = params.socialNetworkAccount.__data;
                    SNAParams.accessToken = credentials.accessToken;
                } else {
                    SNAParams = {
                        accessToken: credentials.accessToken,
                        userId: credentials.userId,
                        memberId: member.id,
                        socialNetworkId: 'facebook'
                    };
                }

                async.parallel([
                    function (asp_1) {
                        SocialNetworkAccount.updateOrCreate(SNAParams, function (err, createdSNA) {
                            if (err) {
                                asp_1(err);
                            } else {
                                asp_1();
                            }
                        });
                    }
                ], function (err) {
                    if (err) {
                        next(err);
                    } else {
                        // Process after login success
                        Member.processLoginSuccess({
                            userInfo: member,
                            token: token,
                            force: force,
                            device: credentials.device || null
                        }, next);
                    }
                });
            }
        });
    };

    Member.processLoginSuccess = function (params, next) {
        if (params.userInfo.type.indexOf(MEMBER_TYPES.ADMIN) > -1) {
            return Member.updateLastLogin(params, next);
        }

        Member.app.models.AccessToken.find({where: {userId: params.userInfo.id}}, function (err, userTokens) {
            if (err) {
                next(err);
            } else if (userTokens.length === 1) {
                if (!params.token) {
                    params.token = userTokens[0];
                }
                Member.updateLastLogin(params, next);
            } else {
                Member.processForceLogin(params, next);
            }
        });
    };

    Member.processForceLogin = function (params, next) {
        if (!params.force) {
            params.token.destroy(function (err) {
                if (err) {
                    next(err);
                } else {
                    let errorObj = new Error('Force 0: Login error');
                    errorObj.code = Member.prefixError + "ML00";
                    next(errorObj);
                }
            });
        } else {
            // Remove old tokens
            Member.app.models.AccessToken.destroyAll({
                id: {neq: params.token.id},
                userId: params.token.userId
            }, function (err, count) {
                if (err) {
                    next(err);
                } else {
                    Member.updateLastLogin(params, next);
                }
            });
        }
    };

    Member.updateLastLogin = function (params, next) {
        let res = params.token;
        if (!params.userInfo.lastLogin) {
            res.isFirstLogin = true;
        } else {
            if (params.userInfo.categories && params.userInfo.categories.length) {
                res.isFirstLogin = false;
                res.lastLogin = params.userInfo.lastLogin;
            } else {
                res.isFirstLogin = true;
            }
        }
        params.userInfo.__data.lastLogin = new Date();
        if (params.device) {
            params.userInfo.__data.device = params.device;
        }

        async.parallel([
            function (asyc_cb) {
                params.userInfo.save({validate: true}, function (err, savedMember) {
                    if (err) {
                        asyc_cb(err);
                    } else {
                        asyc_cb(null);
                    }
                });
            }
        ], function (error) {
            if (error) {
                return next(error);
            }
            next(null, res);
        });
    };

    Member.linkWithFB = function (credentials, ctx, next) {
        let params = {
            "credentials": credentials
        };
        let error;

        if (!ctx.user) {
            error = new Error("Illegal request");
            error.code = "BAD_REQUEST";
            return next(error);
        }

        if (!credentials.accessToken) {
            error = new Error("Invalid parameters: accessToken");
            error.code = "INVALID_PARAMETER";
            error.field = "accessToken";
            return next(error);
        }
        if (!credentials.userId) {
            error = new Error("Invalid parameters: userId");
            error.code = "INVALID_PARAMETER";
            error.field = "userId";
            return next(error);
        }

        raw("GET", 'me', {
            access_token: credentials.accessToken,
            fields: 'id,name,email,picture,gender'
        }, function (err, data) {
            if (err) {
                error = err.data ? new Error(err.data) : err;
                next(error);
            } else {
                // Create new member in case not exists
                let createdMemberParams = {};
                async.series([
                    function (ass_1) {
                        // validate userId and accessToken
                        if (data.id !== credentials.userId) {
                            error = new Error("Invalid parameters: userId");
                            error.code = "INVALID_PARAMETER";
                            error.field = "userId";
                            ass_1(error);
                        } else {
                            ass_1();
                        }
                    },
                    function (ass_1) {
                        if (ctx.user.email && data.email && (ctx.user.email !== data.email)) {
                            error = new Error("Can not link this account with Facebook due to difference email.");
                            error.code = Member.prefixError + "LF01";
                            return ass_1(error);
                        }

                        // set email if email in in retrieved profile
                        if (data.email) {
                            if (!ctx.user.email) {
                                createdMemberParams.email = data.email;
                            }
                        }
                        else {
                            createdMemberParams.email = credentials.userId + SOCIAL_DEFAULT_EMAIL;
                        }

                        // set fullName if name in in retrieved profile
                        if (data.name && !ctx.user.fullName) {
                            createdMemberParams.fullName = data.name;
                        }

                        // set gender if gender in in retrieved profile
                        if (data.gender && !ctx.user.gender) {
                            if (data.gender === 'male') {
                                createdMemberParams.gender = MALE;
                            } else if (data.gender === 'female') {
                                createdMemberParams.gender = FEMALE;
                            }
                        }

                        // set picture if avatar appear in retrieved profile
                        if (data.picture && data.picture.data && data.picture.data.url && !ctx.user.picture) {
                            Member.app.models.Upload.uploadURL({files: data.picture.data.url}, function (err, picture) {
                                if (err) {
                                    ass_1(err);
                                } else {
                                    if (typeof picture[0] !== 'undefined') {
                                        createdMemberParams.picture = picture[0];
                                    }
                                    ass_1();
                                }
                            });
                        } else {
                            ass_1();
                        }
                    }
                ], function (err) {
                    if (err) {
                        return next(err);
                    }

                    createdMemberParams.createdByDeviceId = false; // making link with SN.
                    let MemberCollection = Member.getDataSource().connector.collection(Member.modelName);
                    MemberCollection.update({"_id": ctx.user.id}, {"$set": createdMemberParams}, function (err, result) {
                        if (err) {
                            return next(err);
                        }

                        let SNAParams = {
                            accessToken: credentials.accessToken,
                            userId: credentials.userId,
                            memberId: ctx.user.id,
                            socialNetworkId: SOCIAL_NETWORK.FACEBOOK
                        };

                        Member.app.models.SocialNetworkAccount.updateOrCreate(SNAParams, function (err, createdSNA) {
                            if (err) {
                                return next(err);
                            }

                            next(null, createdSNA);
                        });
                    });
                });
            }
        });
    };

    Member.getSocialNetworkAccount = function (credentials, next) {
        var condition = {
            where: {
                and: [
                    {socialNetworkId: 'facebook'},
                    {userId: credentials.userId},
                    {isDisabled: 0}
                ]
            }
        };

        Member.app.models.SocialNetworkAccount.findOne(condition, function (err, foundedSocialNetworkAccount) {
            if (err) {
                next(err);
            } else if (!foundedSocialNetworkAccount) {
                next(null, null);
            } else {
                next(null, foundedSocialNetworkAccount);
            }
        });
    };

    Member.loginByDeviceID = function (credentials, include, force, next) {
        let crypto = require('crypto');
        let error;
        let privateKey = fs.readFileSync("./cert/private", "utf8");
        let secretKeyConfig = Member.app.models.Setting.configs["LOGIN_SECRET_KEY"] || "6RkitQhN?62cfMuqQMk#";

        try {
            let a = crypto.privateDecrypt({
                "key": privateKey,
                "padding": crypto.constants.RSA_PKCS1_PADDING
            }, new Buffer(credentials.directToken, "base64"));
        } catch (e) {
            let error = new Error("Invalid parameter: directToken is not correct.");
            error.code = "INVALID_PARAMETER";
            error.field = "directToken";
            return next(error);
        }

        if (credentials.os && NOTIFICATION_DEVICE_OS.indexOf(credentials.os) === -1) {
            let error = new Error("Invalid parameter: device.os");
            error.code = "INVALID_PARAMETER";
            error.field = "os";
            return next(error);
        }

        let rs = new Buffer(a.toString(), "base64").toString().split("/");
        let deviceID = rs[0] || "";
        let secretKey = rs[1] || "";
        if (secretKeyConfig !== secretKey) {
            error = new Error("Invalid parameter: secretKey is not correct.");
            error.code = Member.prefixError + "LD01";
            error.field = "directToken";
            return next(error);
        }

        Member.find({
            "where": {
                "device.id": deviceID
            },
            "fields": []
        }, function (err, foundMembers) {
            if (err) {
                return next(err);
            }
            let maxLen = foundMembers.length;
            let device = credentials.device || {"id": deviceID, "os": credentials.os || null};
            if (maxLen > 1) {
                error = new Error("Invalid parameter: More than one user has the same your deviceID.");
                error.code = Member.prefixError + "LD02";
                error.field = "directToken";
                return next(error);
            }
            else if (maxLen === 1) {
                return foundMembers[0].loginByPass({
                    "device": device,
                    "credentials": credentials,
                    "include": include,
                    "force": force
                }, next);
            }

            let cache = Member.app.models.Cache;
            let cid = cache.createKey("Member.loginByDeviceID", device);
            cache.get(cid, function (err, data) {
                if (data) {
                    error = new Error("Can not login by this device ID now. One deviceID is used only in 24h.");
                    error.code = Member.prefixError + "LD03";
                    error.field = "directToken";
                    return next(error);
                }

                Member.createAndLoginTmpUser({
                    "device": device,
                    "credentials": credentials,
                    "include": include,
                    "force": force
                }, next);
            });
        });
    };

    Member.prototype.loginByPass = function (data, next) {
        let device = data.device || {},
            credentials = data.credentials,
            include = data.include,
            force = data.force || 0;

        let member = this;
        member.createAccessToken(null, credentials, function (err, token) {
            if (err) {
                return next(err);
            }

            // Check include to load user object.
            if (Array.isArray(include) ? include.indexOf('user') !== -1 : include === 'user') {
                token.__data.user = member;
            }

            if (typeof data.storeName === 'boolean') {
                token.storeName = data.storeName;
            }

            Member.processLoginSuccess({
                userInfo: member,
                token: token,
                force: force,
                device: device
            }, next);
        });
    };

    Member.createAndLoginTmpUser = function (data, next) {
        let device = data.device || {},
            credentials = data.credentials,
            include = data.include,
            force = data.force || 0;

        Member.create({
            "device": device,
            "verificationToken": null,
            "emailVerified": true,
            "createdByDeviceId": true
        }, function (err, createdMember) {
            if (err) {
                return next(err);
            }

            let cache = Member.app.models.Cache;
            let cid = cache.createKey("Member.loginByDeviceID", device);
            let ttl = 24 * 60 * 60;
            cache.set(cid, device.id, {"ttl": ttl}, function () {
            });

            data.storeName = false;

            createdMember.loginByPass(data, next);
        });
    };

    // special process for login with normal way (email and password) or login with Social Network Account
    Member.processLogin = function (credentials, include, force, next) {
        if (credentials.device) {
            if (typeof credentials.device !== 'object' || !credentials.device.id || !credentials.device.os) {
                let error = new Error("Invalid parameter: device. device:{id: '__id__', os: '__os__'}");
                error.code = "INVALID_PARAMETER";
                error.field = "device";
                return next(error);
            }
            if (NOTIFICATION_DEVICE_OS.indexOf(credentials.device.os) === -1) {
                let error = new Error("Invalid parameter: device.os");
                error.code = "INVALID_PARAMETER";
                error.field = "device.os";
                return next(error);
            }
        }
        let self = this;
        force = (typeof force !== 'undefined' ? parseInt(force) : 0);
        if (credentials.isSMSLogin) {
            Member.loginByFacebook({
                credentials: credentials,
                include: include,
                force: force,
                isSMSLogin: true
            }, next);
        } else {
            Member.isValidSNAAccessToken(credentials, function (err) {
                if (err) {
                    next(err);
                } else {
                    Member.getSocialNetworkAccount(credentials, function (err, socialNetworkAccount) {
                        if (err) {
                            next(err);
                        } else if (!socialNetworkAccount) {
                            Member.loginByFacebook({
                                credentials: credentials,
                                include: include,
                                force: force,
                                isSMSLogin: false
                            }, next);
                        } else {
                            Member.isVerifiedYetWithUserId(socialNetworkAccount.memberId, function (err, member) {
                                if (err) {
                                    next(err);
                                } else if (!member) {
                                    error = new Error("Can't find player with email from social network.");
                                    error.code = Member.prefixError + "PL02";
                                    next(error);
                                } else {
                                    member.generateSocialNetworkAccount({
                                        credentials: credentials,
                                        include: include,
                                        socialNetworkAccount: socialNetworkAccount,
                                        force: force
                                    }, next);
                                }
                            });
                        }
                    });
                }
            });
        }

    };

    // Forgot password request
    // email of member
    Member.requestPasswordRecovery = function (request, next) {
        if (typeof request.email === 'undefined' || !validator.isEmail(request.email)) {
            error = new Error("Email is invalid");
            error.code = Member.prefixError + "RP01";
            next(error);
        } else {
            let email_cond = {where: {email: request.email}};
            let user = this;
            this.findOne(email_cond, function (err, member) {
                if (err || !member) {
                    if (err) {
                        next(err);
                        return;
                    }
                    error = new Error("Email is not exist.");
                    error.code = Member.prefixError + "RP02";
                    next(error);
                } else {
                    let app = Member.app;
                    let options = {};
                    options.to = request.email;
                    options.template = path.resolve(path.join(__dirname, '..', '..', 'server', 'templates', 'forgotPassword.ejs'));
                    options.type = 'email';
                    options.from = (app && app.get('emailFrom')) || '';
                    options.subject = (app && app.get('emailForgotPasswordSubject')) || '';


                    // Init data
                    options.fullName = member.fullName || DEFAULT_MEMBER_TITLE;
                    options.pwdRecoveryToken = app.models.PasswordRecovery.generateForgotPasswordCode();
                    options.confirmURL = app.get('publicWebForgotPaswordRedirectURL');
                    if (member.type.indexOf(MEMBER_TYPES.ADMIN) !== -1) {
                        options.confirmURL = options.confirmURL.replace('{userdomain}', app.get('domainAdmin'));
                    } else {
                        options.confirmURL = options.confirmURL.replace('{userdomain}', app.get('domainShopping'));
                    }
                    options.confirmURL = options.confirmURL + member.id;

                    app.models.PasswordRecovery.findOne({memberId: member.id}, function (err, existPasswordRecovery) {
                        if (err) {
                            next(err);
                        } else {
                            if (!existPasswordRecovery) {
                                existPasswordRecovery = {};
                            }
                            existPasswordRecovery.memberId = member.id;
                            existPasswordRecovery.pwdRecoveryToken = options.pwdRecoveryToken;
                            app.models.PasswordRecovery.upsert(existPasswordRecovery, function (err, passwordRecovery) {
                                if (err) {
                                    next(err);
                                } else {
                                    options.text = (app && app.get('emailForgotPasswordContent')) || '';
                                    options.text = options.text.replace('{pwdRecoveryToken}', options.pwdRecoveryToken);

                                    let template = loopback.template(options.template);

                                    // Email model
                                    let Email = options.mailer || user.constructor.email || loopback.getModelByType(loopback.Email);
                                    Email.send({
                                        to: options.to,
                                        from: options.from,
                                        subject: options.subject,
                                        text: options.text,
                                        html: template(options)
                                    }, function (err, email) {
                                        if (err) {
                                            next(err);
                                        } else {
                                            next(null, {uid: member.id.toString()});
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
    };

    // Confirm password recovery
    // email of member
    Member.confirmPasswordRecovery = function (request, next) {
        let uid = request.uid;
        let pwdRecoveryToken = request.pwdRecoveryToken;
        let pwd = request.pwd + "";
        let missing = [];
        let self = this;
        if (typeof uid === 'undefined' || typeof pwdRecoveryToken === 'undefined' || typeof pwd === 'undefined' || pwd === '') {
            missing.push('Missing information: ');
            if (typeof uid === 'undefined') {
                missing.push('uid');
            }
            if (typeof pwdRecoveryToken === 'undefined') {
                missing.push('pwdRecoveryToken');
            }
            if (typeof pwd === 'undefined' || pwd === '') {
                missing.push('pwd');
            }
            let error = new Error(missing.join(' '));
            error.code = "MISSING_PARAMETER";
            next(error);
        } else {
            let passwordRecoveryCondition = {
                where:
                    {
                        memberId: uid
                        , pwdRecoveryToken: pwdRecoveryToken
                    }
            };
            // Find forgot password code
            Member.app.models.PasswordRecovery.findOne(passwordRecoveryCondition, function (err, passwordRecovery) {
                if (err) {
                    next(err);
                } else if (!passwordRecovery) {
                    // Because in MongoDB it automatic delete record after default time to live
                    // So if we can't find it maybe it can be deleted
                    error = new Error("Password Recovery Token is invalid");
                    error.code = Member.prefixError + "CP01";
                    next(error);
                } else {
                    // We need to make sure forgot password user is available
                    // and we can get email for responses to client
                    Member.findById(passwordRecovery.memberId, function (err, member) {
                        if (err || !member) {
                            error = new Error("Current user is unavailable");
                            error.code = Member.prefixError + "CP02";
                            next(error);
                        } else {
                            // Process generate new password
                            let tmpHashPwd = self.hashPassword(pwd);
                            Member.update({id: member.id}, {password: tmpHashPwd}, function (err, count) {
                                if (err || !count) {
                                    error = new Error("Password invalid");
                                    error.code = Member.prefixError + "CP03";
                                    next(error);
                                } else {
                                    Member.app.models.PasswordRecovery.destroyById(passwordRecovery.id, function (err, count) {
                                        if (err) {
                                            next(err);
                                        } else {
                                            next(null, {email: member.email});
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
    };

    // Reset this function for creating member with SNA
    Member.validatePassword = function (plain) {
        if (typeof plain === 'string' || plain === null) {
            return true;
        }
    }

    Member.hashPassword = function (plain) {
        let hashedPwd = null;
        if (plain !== null) {
            this.validatePassword(plain);
            let salt = bcrypt.genSaltSync(this.settings.saltWorkFactor || SALT_WORK_FACTOR);
            hashedPwd = bcrypt.hashSync(plain, salt);
        }
        return hashedPwd;
    };

    Member.getCurrentUser = function (ctx, next) {
        let userInfo = ctx.req.user || null;
        let accessToken = ctx.req.accessToken;
        async.parallel([
            function (async_cb) {
                // Check and get current user.
                if (accessToken && accessToken.userId && (typeof userInfo === 'undefined' || !userInfo || !userInfo.id)) {
                    Member.findById(accessToken.userId, function (err, foundMember) {
                        if (err) {
                            async_cb(err);
                        } else if (!foundMember) {
                            error = new Error("Current logged user is not found.");
                            error.code = Member.prefixError + "GC01";
                            async_cb(error);
                        } else {
                            foundMember.id = foundMember.id.toString();
                            ctx.req.user = foundMember;
                            async_cb(null, foundMember);
                        }
                    });
                }
                else {
                    async_cb(null, userInfo);
                }
            }
        ], function (err, results) {
            if (err) {
                return next(err);
            }

            next(null, results[0]);
        });
    };

    Member.getPublicProfile = (id, next) => {
        Member.findById(id, {
            fields: {
                gender: true,
                bio: true,
                avatar: true,
                points: true,
                id: true,
                categories: true,
                created: true,
                modified: true,
                fullName: true,
                address: true,
                phoneNumber: true
            }
        }, next);
    };

    Member.countAllDeals = (id, next) => {
        Member.app.models.Deal.count({
            "shipper.id": id
        }, (err, count) => {
            if (err) return next(err);
            return next(null, {
                total: count
            });
        });
    };

    Member.countAllRequests = (id, next) => {
        Member.app.models.Request.count({
            "owner.id": id
        }, (err, count) => {
            if (err) return next(err);
            return next(null, {
                total: count
            });
        });
    };

    Member.countAllOrders = (id, next) => {
        Member.app.models.Order.find({
            where: {
                'status': {
                    'neq': 'pending'
                },
                'requester.id': id
            }
        }, (err, count) => {
            if (err) return next(err);
            return next(null, {
                total: count
            });
        });
    };

    Member.countAllFeedBacks = (id, next) => {
        Member.app.models.FeedBack.count({
            "memberId": id
        }, (err, count) => {
            if (err) return next(err);
            return next(null, {
                total: count
            });
        });
    };

    Member.getAllFeedBacks = (id, next) => {
        Member.app.models.FeedBack.find({
            where: {
                "memberId": id
            },
            order: 'modified DESC'
        }, next);
    };

    Member.getAllDealByMemberId = (id, options, next) => {
        const {Deal} = Member.app.models;
        Member.findById(id, (err, member) => {
            if (err || !member) {
                return Member.handlerError('Member not found', 400, next);
            }
            Deal.find({
                where: {
                    or: [
                        {
                            "shipper.id": id,
                        },
                        {
                            "requesters.id": id
                        }
                    ]
                },
                include: 'category'
            }, next);
        })
    };

    Member.getAllRequestByMemberId = (id, options, next) => {
        const {Request} = Member.app.models;
        Member.findById(id, (err, member) => {
            if (err || !member) {
                return Member.handlerError('Member not found', 400, next);
            }
            Request.find({
                where: {
                    or: [
                        {
                            "owner.id": id,
                        },
                        {
                            "bidders.id": id
                        }
                    ]
                },
                include: 'category'
            }, next);
        })
    }

    // getAllFeedBackByMemberId
    Member.getAllFeedBackByMemberId = (id, options, next) => {
        const {FeedBack} = Member.app.models;
        Member.findById(id, (err, member) => {
            if (err || !member) {
                return Member.handlerError('Member not found', 400, next);
            }
            FeedBack.find({
                where: {
                    "memberId": id
                }
            }, next);
        })
    }
    Member.setup = function () {
        Member.disableRemoteMethodByName('login', true);
        Member.disableRemoteMethodByName('create');
        Member.disableRemoteMethodByName('upsert');
        Member.disableRemoteMethodByName('updateAll');
        Member.disableRemoteMethodByName('prototype.updateAttributes');

        Member.disableRemoteMethodByName('find');
        Member.disableRemoteMethodByName('findById');
        Member.disableRemoteMethodByName('findOne');

        Member.disableRemoteMethodByName('deleteById');
        Member.disableRemoteMethodByName('verify');
        Member.disableRemoteMethodByName('changePassword');
        Member.disableRemoteMethodByName('createChangeStream');
        Member.disableRemoteMethodByName('upsertWithWhere');
        Member.disableRemoteMethodByName('confirm');
        Member.disableRemoteMethodByName('count');
        Member.disableRemoteMethodByName('exists');
        Member.disableRemoteMethodByName('resetPassword');
        Member.disableRemoteMethodByName('replaceOrCreate');
        Member.disableRemoteMethodByName('replaceById');
        Member.disableRemoteMethodByName('prototype.__destroyById__deals');
        Member.disableRemoteMethodByName('prototype.__findById__deals');
        Member.disableRemoteMethodByName('prototype.__updateById__deals');
        Member.disableRemoteMethodByName('prototype.__delete__deals');

        Member.disableRemoteMethodByName('prototype.__destroyById__feedback');
        Member.disableRemoteMethodByName('prototype.__findById__feedback');
        Member.disableRemoteMethodByName('prototype.__updateById__feedback');
        Member.disableRemoteMethodByName('prototype.__delete__feedback');
        Member.disableRemoteMethodByName('prototype.__count__feedback');
        Member.disableRemoteMethodByName('prototype.__get__feedback');

        Member.disableRemoteMethodByName('prototype.__count__accessTokens');
        Member.disableRemoteMethodByName('prototype.__create__accessTokens');
        Member.disableRemoteMethodByName('prototype.__delete__accessTokens');
        Member.disableRemoteMethodByName('prototype.__destroyById__accessTokens');
        Member.disableRemoteMethodByName('prototype.__findById__accessTokens');
        Member.disableRemoteMethodByName('prototype.__get__accessTokens');
        Member.disableRemoteMethodByName('prototype.__updateById__accessTokens');
        loopback.remoteMethod(
            Member.processLogin,
            {
                description: 'Login a user with useremail/password pair or social network account info (accessToken, userId, provider)',
                accepts: [
                    {arg: 'credentials', type: 'object', required: true, http: {source: 'body'}},
                    {
                        arg: 'include', type: 'string', http: {source: 'query'}, description:
                        'Related objects to include in the response. ' +
                        'See the description of return value for more details.'
                    },
                    {arg: 'force', type: 'number', http: {source: 'query'}}
                ],
                returns: {
                    arg: 'accessToken', type: 'object', root: true, description:
                    'The response body contains properties of the AccessToken created on login.\n' +
                    'Depending on the value of `include` parameter, the body may contain ' +
                    'additional properties:\n\n' +
                    '  - `user` - `{User}` - Data of the currently logged in user. (`include=user`)\n\n'
                },
                http: {verb: 'post', path: '/login'}
            }
        );

        // detect, get and remove 'socialNetworkAccount' if it exists in request for Member creation
        Member.beforeRemote('create', function (ctx, member, next) {
            if (!("password" in ctx.req.body) || !ctx.req.body.password) {
                ctx.req.body.password = "";
            }
            if (ctx.req.body.hasOwnProperty("type")) {
                if (ctx.req.body.type.indexOf(MEMBER_TYPES.ADMIN) !== -1) {
                    next(new Error("Can not register an account with administrator role."));
                }
            }

            let restrictedFields = ["emailVerified", "lastLogin"];
            let errorFields = [];
            for (let i = 0; i < restrictedFields.length; i++) {
                let fieldName = restrictedFields[i];

                if (ctx.req.body.hasOwnProperty(fieldName)) {
                    errorFields.push(fieldName);
                }
            }

            if (errorFields.length > 0) {
                return next(new Error("Can not register an account with parameter: " + errorFields.toString()));
            }

            Member.validateDateFields(ctx, next);

            async.parallel([
                function (acp_one) {
                    if (!ctx.req.body.password) {
                        acp_one(new Error("Password is missing"));
                    } else {
                        acp_one(null);
                    }
                },
                function (acp_one) {
                    if (!ctx.req.body.email) {
                        acp_one(new Error("Email is missing"));
                    } else {
                        acp_one(null);
                    }
                }
            ], function (err) {
                if (err) {
                    next(err);
                } else {
                    next();
                }
            });
        });

        Member.beforeRemote('prototype.updateAttributes', function (ctx, member, next) {
            Member.getCurrentUser(ctx, function (err, userInfo) {
                if (err) {
                    return next(err);
                }
                let isNotAdmin = (userInfo.type.indexOf(MEMBER_TYPES.ADMIN) === -1);
                if (isNotAdmin) {
                    let errorFields = [];
                    let notAllowUpdateFields = ["password", "email", "type"];

                    async.each(notAllowUpdateFields, function (fieldName, nextField) {
                        if (ctx.req.body[fieldName]) {
                            errorFields.push(fieldName);
                        }
                        nextField();
                    }, function () {
                        if (errorFields !== '') {
                            next(new Error("Can not update field(s): '" + errorFields.join(", ") + "' in this method."));
                            return;
                        }
                    });
                }

                Member.ignoreUpdateFields(ctx);

                // Validate date fields.
                Member.validateDateFields(ctx, next);
                next();
            });
        });

        Member.ignoreUpdateFields = function (ctx) {
            let ignoreFields = ["emailVerified", "created", "modified"];
            ignoreFields.forEach(function (fieldName) {
                if (ctx.req.body[fieldName]) {
                    ctx.req.body[fieldName] = undefined;
                }
            });
        };

        Member.validateDateFields = function (ctx, next) {
            let dateFields = ["dateOfBirth"];
            dateFields.forEach(function (fieldName) {
                if (ctx.req.body[fieldName] && !validator.isDate(ctx.req.body[fieldName])) {
                    let error = new Error("Invalid dateOfBirth");
                    error.code = "INVALID_PARAMETER";
                    return next(error);
                }
            });
        };

        Member.afterRemote('create', function (ctx, member, next) {
            async.series([
                function (acs_one) {
                    if (ctx.req.query.skipVerifyEmail) {
                        return acs_one();
                    }

                    // send verification email
                    member.verify(function (err) {
                        if (err) {
                            acs_one(err);
                        } else {
                            acs_one(null);
                        }
                    });
                }
            ], function (err) {
                if (err) {
                    next(err);
                } else {
                    Member.findById(member.id, function (err, model) {
                        ctx.result = model;
                    });
                    next();
                }
            });
        });

        Member.chooseCategories = (data, options, next) => {
            const {currentMember} = options;
            if (!currentMember) {
                return Member.handlerError('Authorization Required', 401, next);
            }
            if (typeof data.categoryIds === 'undefined') {
                return Member.handlerError('Missing Parameters: categoryIds', 404, next);
            }
            const {categoryIds} = data;
            if (categoryIds && categoryIds.length) {
                const listCategoryLength = categoryIds.length;
                const {Category} = Member.app.models;
                Category.find({
                    where: {
                        id: {
                            inq: categoryIds
                        }
                    },
                }, (err, categories) => {
                    if (err) return next(err);
                    if (!categories) return Member.handlerError('Bad Request', 400, next);
                    if (categories.length !== listCategoryLength) {
                        return Member.handlerError('Bad Request', 400, next);
                    }
                    currentMember.updateAttributes({
                        categories: categories,
                        fbAccessToken: currentMember.fbAccessToken,
                        email: currentMember.email
                    }, (err, updatedMember) => {
                        if (err) return next(err);
                        return next(null, categories);
                    });
                })
            } else {
                return Member.handlerError('Invalid Parameters: categoryIds', 421, next);
            }
        };

        Member.updateProfile = (userId, data, options, next) => {
            const {currentMember} = options;
            if (!currentMember) {
                return Member.handlerError('Bad Request', 400, next);
            }
            const {avatar, fullName, bio, device, address, phoneNumber} = data;
            Member.findById(userId, (err, member) => {
                if (err || !member) {
                    return Member.handlerError('Member not found', 404, next);
                } else {
                    const id = currentMember.id.toString();
                    if (id === userId) {
                        member.updateAttributes({
                            avatar: avatar !== '' ? avatar : member.avatar,
                            fullName: fullName !== '' ? fullName : member.fullName,
                            bio: bio !== '' ? bio : member.bio,
                            device: device && Object.keys(device).length ? device : member.device,
                            address: address !== '' ? address : (member.address ? member.address : ""),
                            phoneNumber: phoneNumber !== '' ? phoneNumber : (member.phoneNumber ? member.phoneNumber : "")
                        }, next);
                    } else {
                        return Member.handlerError('Permission Denied', 401, next);
                    }
                }
            })
        };

        Member.becomeShipper = (userId, options, next) => {
            const {currentMember} = options;
            if (!currentMember) {
                return Member.handlerError('Permission Denied', 401, next);
            }
            if (currentMember.id.toString() === userId) {
                Member.findById(userId, (err, found) => {
                    if (err || !found) {
                        return Member.handlerError('Member not found', 404, next);
                    }
                    const {isShipper} = found;
                    if (isShipper) {
                        return Member.handlerError('You already are shipper', 400, next);
                    } else {
                        found.__data.isShipper = true;
                        found.save(next);
                    }
                })
            } else {
                return Member.handlerError('Permission Denied', 401, next);
            }
        };

        Member.me = (options, next) => {
            const {currentMember} = options;
            if (!currentMember) {
                return Member.handlerError('Authorization Required', 401, next);
            }
            return next(null, currentMember);
        }

        Member.afterRemote('logout', function (ctx, member, next) {
            next();
        });

        Member.validatesUniquenessOf('email', {message: 'This email is already used in our system. Please use another one.'});

        function validateEmail(cb_err) {
            let self = this;
            if (typeof self.email !== 'undefined') {
                if (typeof self.email !== 'string' || !validator.isEmail(self.email)) {
                    cb_err();
                }
            }
        }

        Member.validate('email', validateEmail);

        function validatePicture(err) {
            if (typeof this.picture !== 'undefined' && this.picture) {
                if (typeof this.picture !== 'object' || !("name" in this.picture) || !("container" in this.picture)) {
                    err();
                }
            }
        }

        Member.validate('picture', validatePicture, {message: 'Picture is invalid format'});

        function validateGender(err) {
            if (typeof this.gender !== 'undefined' && this.gender) {
                if (this.gender < 0 || this.gender > 2) {
                    err();
                }
            }
        }

        Member.validate('gender', validateGender, {message: 'Gender is not valid'});

        function validateDateOfBirth(err) {
            if (typeof this.dateOfBirth !== 'undefined' && this.dateOfBirth) {
                if (!validator.isDate(this.dateOfBirth)) {
                    err();
                }
            }
        }

        Member.validate('dateOfBirth', validateDateOfBirth, {message: 'Invalid Date Of Birth'});

        // phone
        function validatePhone(err) {
            if (typeof this.phone !== 'undefined' && this.phone) {
                if (!validator.isLength(this.phone, 0, 20)) {
                    err();
                }
            }
        }

        Member.validate('phone', validatePhone, {message: 'Phone is too long'});

        Member.remoteMethod(
            'chooseCategories',
            {
                accessType: 'WRITE',
                accepts: [
                    {arg: 'data', type: 'object', required: true, http: {source: 'body'}},
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Choose Favourites Categories',
                http: {verb: 'POST', path: '/categories/choose'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'updateProfile',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id', type: 'any',
                        description: 'User Id', required: true,
                        http: {source: 'path'}
                    },
                    {arg: 'data', type: 'object', required: true, http: {source: 'body'}},
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Choose Favourites Categories',
                http: {verb: 'PATCH', path: '/:id'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'becomeShipper',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id', type: 'any',
                        description: 'User Id', required: true,
                        http: {source: 'path'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Update user become to shipper',
                http: {verb: 'PATCH', path: '/:id/shipper'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'getAllDealByMemberId',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id', type: 'any',
                        description: 'User Id', required: true,
                        http: {source: 'path'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Get All Deals of Member',
                http: {verb: 'GET', path: '/:id/deals'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'getAllRequestByMemberId',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id', type: 'any',
                        description: 'User Id', required: true,
                        http: {source: 'path'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Get All Requests of Member',
                http: {verb: 'GET', path: '/:id/requests'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'getAllFeedBackByMemberId',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id', type: 'any',
                        description: 'User Id', required: true,
                        http: {source: 'path'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Get All FeedBack of Member',
                http: {verb: 'GET', path: '/:id/feedbacks'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'me',
            {
                accessType: 'WRITE',
                accepts: [
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Kiểm tra xem access token có hợp lệ hay không',
                http: {verb: 'GET', path: '/me'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'getPublicProfile',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id', type: 'any',
                        description: 'User Id', required: true,
                        http: {source: 'path'}
                    }
                ],
                description: 'Get Public Profile Member',
                http: {verb: 'GET', path: '/:id'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'countAllDeals',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id', type: 'any',
                        description: 'User Id', required: true,
                        http: {source: 'path'}
                    }
                ],
                description: 'Count all deals of member by memberID',
                http: {verb: 'GET', path: '/:id/deals/count'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'countAllRequests',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id', type: 'any',
                        description: 'User Id', required: true,
                        http: {source: 'path'}
                    }
                ],
                description: 'Count all deals of member by memberID',
                http: {verb: 'GET', path: '/:id/requests/count'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'countAllOrders',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id', type: 'any',
                        description: 'User Id', required: true,
                        http: {source: 'path'}
                    }
                ],
                description: 'Count all deals of member by memberID',
                http: {verb: 'GET', path: '/:id/orders/count'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'countAllFeedBacks',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id', type: 'any',
                        description: 'User Id', required: true,
                        http: {source: 'path'}
                    }
                ],
                description: 'Count all deals of member by memberID',
                http: {verb: 'GET', path: '/:id/feedbacks/count'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Member.remoteMethod(
            'getAllFeedbacks',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id', type: 'any',
                        description: 'User Id', required: true,
                        http: {source: 'path'}
                    }
                ],
                description: 'Count all deals of member by memberID',
                http: {verb: 'GET', path: '/:id/feedbacks/count'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );
    }; // End Member.setup.
    Member.setup();
};
