'use strict';
const async = require('async');
const loopback = require('loopback');
const serialize = require('loopback-jsonapi-model-serializer');
const ObjectID = require('mongodb').ObjectID;

module.exports = function (server) {
    let remotes = server.remotes();

    function formatResponse(data) {
        let finalResult = {
            'data': null, 'error': null,
        };
        if (typeof data !== 'undefined' && data) {
            if (typeof data.error !== 'undefined') {
                finalResult.error = data.error;
                finalResult.error.details = finalResult.error.details || null;
            } else {
                finalResult.data = data;
            }
        }

        return finalResult;
    }

    function preprocessBeforeRemote(ctx, userInfo) {
        let modelName = ctx.method.stringName;
        if (modelName && typeof modelName !== 'undefined' && modelName !== '') {
            modelName = modelName.split('.')[0];
            if (modelName !== 'Product') {
                if (typeof ctx.method.name !== 'undefined' && (ctx.method.name === 'find' ||
                        ctx.method.name === 'count')) {
                    let filterLimit = 30;
                    let filter = ctx.args.filter;
                    if (typeof filter !== 'undefined') {
                        if (typeof filter.limit !== 'undefined') {
                            let limit = filter.limit;
                            if (limit > filterLimit) {
                                filter.limit = filterLimit;
                            }
                        } else {
                            filter['limit'] = filterLimit;
                        }
                        ctx.args.filter = filter;
                    } else {
                        ctx.args.filter = {'limit': filterLimit};
                    }

                    // Only apply default condition for these Model.
                    let modelList = ['Deal', 'Request', 'Order'];
                    let conditions = (ctx.args.filter ? ctx.args.filter['where'] : null) || ctx.args.where || {};
                    if (modelList.indexOf(modelName) === -1) {
                        return;
                    }
                    if (userInfo) {
                        if (modelName === 'Deal') {
                            conditions["shipper.id"] = userInfo.id.toString();
                        } else if (modelName === 'Request') {
                            conditions["owner.id"] = userInfo.id.toString();
                        } else if (modelName === 'Order') {
                            conditions.or = [
                                {
                                    "requester.id": userInfo.id
                                },
                                {
                                    "shipper.id": userInfo.id
                                }
                            ]
                        }
                    }
                    if (ctx.method.name === 'find') {
                        ctx.args.filter['where'] = conditions;
                    } else {
                        ctx.args.where = conditions;
                    }
                }
            }
        }
    }

    remotes.before('**', function (ctx, next) {
        let nowUTC = new Date();
        let debugLog = server.get('debugLog');
        if (debugLog) {
            console.log('=====> START REQUEST', nowUTC);
            console.log('request: ' + ctx.req.method, ctx.req.originalUrl);
            console.log('request: Query string', ctx.req.query);
            console.log('request: Body', ctx.req.body);
            console.log('accessToken', ctx.req.accessToken);
        }

        if (!ctx.args.options || !ctx.args.options.accessToken) return next();
        const Member = server.models.Member;
        Member.findById(ctx.args.options.accessToken.userId, {
            fields: {
                id: true,
                avatar: true,
                points: true,
                fullName: true,
                isFirstCreateDeal: true,
                isFirstCreateRequest: true,
                categories: true,
                address: true,
                phoneNumber: true,
                bio: true,
                isShipper: true
            }
        }, (err, member) => {
            if (err) return next(err);
            ctx.args.options.currentMember = member;
            preprocessBeforeRemote(ctx, member);
            next();
        });
    });

    remotes.after('**', function (ctx, next) {
        ctx.result = formatResponse(ctx.result);
        let debugLog = server.get('debugLog');
        if (debugLog) {
            let nowUTC = new Date();
            console.log('Response', ctx.result);
            console.log('END REQUEST', nowUTC);
        }
        next();
    });
};
