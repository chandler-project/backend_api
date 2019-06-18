'use strict';
const async = require('async');
const _ = require('underscore');

const ObjectID = require('mongodb').ObjectID;
module.exports = function (Request) {
    Request.observe('before save', (ctx, next) => {
        if (ctx.isNewInstance) {
            if (!ctx.options.currentMember) {
                let error = new Error('Authorization Required');
                error.code = "AUTHORIZATION_REQUIRED";
                error.statusCode = 401;
                return next(error);
            } else {
                ctx.instance.owner = ctx.options.currentMember;
            }
        }
        next();
    });

    Request.observe('after save', (ctx, next) => {
        if (!ctx.options.currentMember) {
            next();
        } else {
            const currentMember = ctx.options.currentMember;
            if (currentMember.isFirstCreateRequest === false) {
                currentMember.updateAttributes({
                    'isFirstCreateRequest': true,
                }, function (err, instance) {
                    currentMember.updateAttributes({
                        '$inc': {
                            points: 20
                        },
                    }, next);
                });
            } else {
                next();
            }
        }
    });

    Request.bid = (requestId, id, data, next) => {
        const {price, sentence, spend} = data;
        if (!price || !sentence || !spend) {
            return next(new Error('Data is invalid'));
        }
        async.parallel([
            (cb) => {
                Request.findById(requestId, cb);
            },
            (cb) => {
                Request.app.models.Member.findById(id, {
                    fields: {
                        id: true,
                        avatar: true,
                        fullName: true,
                        points: true,
                        address: true,
                        phoneNumber: true
                    }
                }, cb);
            }
        ], (err, rs) => {
            if (err) {
                return next(err);
            } else {
                const [rq, member] = rs;
                if (!rq)
                    return next(new Error('Yêu cầu không tồn tại'));
                const {owner, bidders} = rq;
                if (owner && owner === id) {
                    return next(new Error('Bạn không thể tự đặt giá chính sản phẩm của bạn'));
                } else {
                    if (bidders.findIndex(bidder => bidder.id === id) > -1) {
                        return next(new Error('Bạn đã đặt giá cho sản phẩm này'));
                    } else {
                        const newBidder = {
                            id: member.id,
                            avatar: member.avatar,
                            fullName: member.fullName,
                            points: member.points,
                            price: price,
                            sentence: sentence,
                            spend: spend,
                            timestamp: new Date()
                        };
                        rq.updateAttributes({
                            '$push': {
                                bidders: newBidder
                            }
                        }, (err, result) => {
                            if (err) return next(err);
                            delete result.$push;
                            result.bidders.push(newBidder);
                            return next(null, result);
                        });
                    }
                }
            }
        })
    };

    Request.chooseShipper = (id, shipperId, options, next) => {
        const {currentMember} = options;
        const {Member} = Request.app.models;
        if (!currentMember)
            return Member.handlerError('Permission Denied', 401, next);
        async.parallel([
            (cb) => {
                Request.findById(id, cb);
            },
            (cb) => {
                Member.findById(shipperId, cb);
            }
        ], (err, rs) => {
            if (err) return next(err);
            const [request, shipper] = rs;
            if (!request) return Member.handlerError('Request not found', 404, next);
            if (!shipper) return Member.handlerError('Shipper not found', 404, next);
            const {bidders, status} = request;
            if (status && status.toLowerCase() === 'ordered') {
                return Member.handlerError('This request is already ordered', 400, next);
            }
            if (bidders && bidders.length) {
                let bidder = bidders.filter(bidder => {
                    return bidder.id.toString() === shipperId;
                });
                if (bidder && bidder.length) {
                    bidder = bidder[0];
                    Request.app.models.Order.create({
                        requester: currentMember,
                        shipper: shipper,
                        title: request.productName,
                        productPrice: request.price,
                        shippingPrice: bidder.price,
                        deliveryTime: bidder.timestamp,
                        item: {
                            name: request.productName,
                            amount: request.amount
                        },
                        requestId: id
                    }, (error, order) => {
                        if (error || !order) return next(new Error('Can\'t create order'));
                        request.__data.status = 'Ordered';
                        request.__data.choosen = bidder;
                        request.save(next);
                    })
                } else {
                    return Member.handlerError('This shipper does not bid for this request', 400, next);
                }
            } else {
                return Member.handlerError('This shipper does not bid for this request', 400, next);
            }
        })
    }

    Request.newFeeds = (options, next) => {
        let conditions = {"include": "category", "limit": 30, "order": "modified DESC"};
        Request.find(conditions, next);
    };

    Request.setup = () => {
        Request.remoteMethod(
            'bid',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'requestId',
                        type: 'string',
                        description: 'Request Id',
                        required: true,
                        http: {source: 'path'}
                    },
                    {
                        arg: 'id', type: 'any',
                        http: ctx => ctx.req.accessToken && ctx.req.accessToken.userId,
                    },
                    {
                        arg: 'data', type: 'object', root: true,
                        description: '{price: "", sentence: "", spend: ""}', required: true,
                        http: {source: 'body'}
                    },
                ],
                description: 'Shipper can bid a request',
                http: {verb: 'PATCH', path: '/:requestId/bid'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Request.remoteMethod(
            'newFeeds',
            {
                accessType: 'WRITE',
                accepts: [
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Get New Feeds',
                http: {verb: 'GET', path: '/new-feeds'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Request.remoteMethod(
            'chooseShipper',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'requestId',
                        type: 'string',
                        description: 'Request Id',
                        required: true,
                        http: {source: 'path'}
                    },
                    {
                        arg: 'shipperId',
                        type: 'string',
                        description: 'Shipper Id',
                        required: true,
                        http: {source: 'path'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Get New Feeds',
                http: {verb: 'PATCH', path: '/:requestId/:shipperId/choose'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );
    };

    Request.setup();
};
