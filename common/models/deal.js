'use strict';
const async = require('async');
const ObjectID = require('mongodb').ObjectID;
module.exports = function (Deal) {
    Deal.observe('before save', (ctx, next) => {
        if (ctx.isNewInstance) {
            if (!ctx.options.currentMember) {
                let error = new Error('Authorization Required');
                error.code = "AUTHORIZATION_REQUIRED";
                error.statusCode = 401;
                return next(error);
            } else {
                ctx.instance.shipper = ctx.options.currentMember;
                ctx.instance.memberId = ctx.options.currentMember.id;
            }
        }
        next();
    });

    Deal.observe('after save', (ctx, next) => {
        if (!ctx.options.currentMember) {
            next();
        } else {
            const currentMember = ctx.options.currentMember;
            if (currentMember.isFirstCreateDeal === false) {
                currentMember.updateAttributes({
                    'isFirstCreateDeal': true,
                }, function (err, instance) {
                    currentMember.updateAttributes({
                        '$inc': {
                            points: 100
                        },
                    }, next);
                });
            } else {
                next();
            }
        }
    });

    Deal.request = (dealId, amount, id, next) => {
        const {Member} = Deal.app.models;
        async.parallel([
            (cb) => {
                Member.findById(id, {
                    fields: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        fullName: true,
                        address: true,
                        phoneNumber: true
                    }
                }, cb);
            },
            (cb) => {
                Deal.findById(dealId, cb);
            }
        ], (errors, rs) => {
            if (errors) return next(errors);
            const [requester, deal] = rs;
            if (!deal) {
                return next(new Error('Deal not found'));
            }
            const {shipper, requesters} = deal;
            if (shipper.id.toString() === id) {
                return next(new Error('You can\'t request your deal'));
            } else {
                if (requesters.findIndex(request => request.id.toString() === id.toString()) > -1) {
                    return next(new Error('You already request for this deal'));
                } else {
                    requester.__data.timestamp = new Date();
                    const newRequest = requester.__data;
                    deal.updateAttributes({
                        '$push': {
                            'requesters': newRequest
                        }
                    }, (err, newDeal) => {
                        if (err) return next(err);
                        Deal.app.models.Order.create({
                            requester: requester,
                            shipper: shipper,
                            title: deal.productName,
                            productPrice: deal.price,
                            shippingPrice: deal.shippingPrice,
                            deliveryTime: deal.shippingTime,
                            item: {
                                name: deal.productName,
                                amount: amount
                            },
                            dealId: dealId
                        }, (error, order) => {
                            if (error || !order) return next(new Error('Can\'t create order'));
                            delete newDeal.$push;
                            newDeal.requesters.push(newRequest);
                            return next(null, newDeal);
                        })
                    })
                }
            }
        });
    };

    Deal.upvote = (dealId, options, next) => {
        const {currentMember} = options;
        const {Member} = Deal.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }
        Deal.findById(dealId, (err, deal) => {
            if (err || !deal) {
                return Member.handlerError('Deal not found', 400, next);
            }
            const {upVoters, downVoters} = deal;
            let DealCollection = Deal.getDataSource().connector.collection(Deal.modelName);
            if (upVoters.indexOf(currentMember.id.toString()) > -1) {
                DealCollection.update({"_id": ObjectID(dealId)}, {
                    '$pull': {
                        'upVoters': currentMember.id.toString()
                    },
                    '$inc': {
                        'upvote': -1
                    }
                }, (e, rs) => {
                    if (e) return next(e);
                    return Deal.findById(dealId, next);
                })
            } else {
                let conditions = {};
                let newVoters = (upVoters && upVoters.length) ? upVoters : [];
                newVoters.push(currentMember.id.toString());
                if (downVoters.indexOf(currentMember.id.toString()) > -1) {
                    conditions = {
                        '$inc': {
                            'upvote': 1,
                            'downvote': -1
                        },
                        '$pull': {
                            'downVoters': currentMember.id.toString()
                        },
                        '$push': {
                            'upVoters': currentMember.id.toString()
                        },
                    };
                } else {
                    conditions = {
                        '$push': {
                            'upVoters': currentMember.id.toString()
                        },
                        '$inc': {
                            'upvote': 1
                        }
                    }
                }

                DealCollection.update({"_id": ObjectID(dealId)}, conditions, (e, rs) => {
                    if (e) return next(e);
                    return Deal.findById(dealId, next);
                })
            }

        })
    };

    Deal.downvote = (dealId, options, next) => {
        const {currentMember} = options;
        const {Member} = Deal.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }
        Deal.findById(dealId, (err, deal) => {
            if (err || !deal) {
                return Member.handlerError('Deal not found', 400, next);
            }
            const {downVoters, upVoters} = deal;
            let DealCollection = Deal.getDataSource().connector.collection(Deal.modelName);
            if (downVoters.indexOf(currentMember.id.toString()) > -1) {
                DealCollection.update({"_id": ObjectID(dealId)}, {
                    '$pull': {
                        'downVoters': currentMember.id.toString()
                    },
                    '$inc': {
                        'downvote': -1
                    }
                }, (e, rs) => {
                    if (e) return next(e);
                    return Deal.findById(dealId, next);
                })
            } else {
                let conditions = {};
                if (upVoters.indexOf(currentMember.id.toString()) > -1) {
                    conditions = {
                        '$inc': {
                            'downvote': 1,
                            'upvote': -1
                        },
                        '$push': {
                            'downVoters': currentMember.id.toString()
                        },
                        '$pull': {
                            'upVoters': currentMember.id.toString()
                        },
                    };
                } else {
                    conditions = {
                        '$push': {
                            'downVoters': currentMember.id.toString()
                        },
                        '$inc': {
                            'downvote': 1
                        }
                    }
                }
                DealCollection.update({"_id": ObjectID(dealId)}, conditions, (e, rs) => {
                    if (e) return next(e);
                    return Deal.findById(dealId, next);
                })
            }
        })
    };

    Deal.trending = (next) => {
        var DealCollection = Deal.getDataSource().connector.collection(Deal.modelName);
        DealCollection.aggregate([
            {
                $project: {
                    "requesters": 1,
                    "noOfComments": 1,
                    "upvote": 1,
                    "downvote": 1,
                    "shipper": 1,
                    "productPics": 1,
                    "productDesc": 1,
                    "shippingTime": 1,
                    "shippingPrice": 1,
                    "productName": 1,
                    "reference": 1,
                    "price": 1,
                    "categoryId": 1,
                    "noOfRequesters": {$size: "$requesters"},
                    "count": {
                        $sum: [
                            {$size: "$requesters"},
                            {$max: "$upvote"},
                            {$max: "$noOfComments"}
                        ]
                    }
                }
            },
            {$sort: {count: -1}},
            {$limit: 10}
        ], (err, deals) => {
            if (err) {
                return next(err);
            }
            const categories = deals.map(deal => deal.categoryId);
            Deal.app.models.Category.find({
                id: {
                    inq: categories
                }
            }, (err, listCat) => {
                if (err) return next(err);
                if (listCat && listCat.length) {
                    let newDeals = deals.map(deal => {
                        let category = listCat.filter(category => category.id.toString() == deal.categoryId);
                        if (category && category.length) {
                            deal.category = category[0];
                        }
                        return deal;
                    });
                    next(null, newDeals);
                } else {
                    next(null, deals);
                }
            });

        });
    };

    Deal.relateProducts = (id, next) => {
        const {Member} = Deal.app.models;
        Deal.findById(id, (err, deal) => {
            if (err || !deal) return Member.handlerError('Deal not found', 400, next);
            const {categoryId} = deal;
            Deal.find({
                where: {
                    categoryId: categoryId,
                    id: {
                        neq: id
                    }
                },
                limit: 4,
                order: 'modified DESC'
            }, next);
        });
    };

    Deal.newFeeds = (options, next) => {
        const {currentMember} = options;
        let conditions = {"include": "category", "order": "modified DESC"};
        if (currentMember && typeof currentMember.categories !== 'undefined') {
            let categories = currentMember.categories;
            if (categories && categories.length) {
                let listCat = categories.map(category => category.id.toString());
                conditions.where = {
                    categoryId: {
                        inq: listCat
                    }
                }
            }
        }
        Deal.find(conditions, next);
    };

    Deal.setup = () => {
        Deal.remoteMethod(
            'request',
            {
                accessType: 'WRITE',
                accepts: [
                    {arg: 'dealId', type: 'string', description: 'Deal Id', required: true, http: {source: 'path'}},
                    {
                        arg: 'amount',
                        type: 'number',
                        description: 'Order Amount',
                        required: true,
                        http: {source: 'query'}
                    },
                    {
                        arg: 'id', type: 'any',
                        http: ctx => ctx.req.accessToken && ctx.req.accessToken.userId,
                    },
                ],
                description: 'User can request from a deal',
                http: {verb: 'PATCH', path: '/:dealId/request'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Deal.remoteMethod(
            'upvote',
            {
                accessType: 'WRITE',
                accepts: [
                    {arg: 'dealId', type: 'string', description: 'Deal Id', required: true, http: {source: 'path'}},
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'User can request from a deal',
                http: {verb: 'PATCH', path: '/:dealId/upvote'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Deal.remoteMethod(
            'downvote',
            {
                accessType: 'WRITE',
                accepts: [
                    {arg: 'dealId', type: 'string', description: 'Deal Id', required: true, http: {source: 'path'}},
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'User can request from a deal',
                http: {verb: 'PATCH', path: '/:dealId/downvote'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Deal.remoteMethod(
            'trending',
            {
                accessType: 'WRITE',
                accepts: [],
                description: 'Get trending deals',
                http: {verb: 'GET', path: '/trending'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Deal.remoteMethod(
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

        Deal.remoteMethod(
            'relateProducts',
            {
                accessType: 'WRITE',
                accepts: [
                    {arg: 'id', type: 'string', description: 'Deal Id', required: true, http: {source: 'path'}},
                ],
                description: 'Get Relate Products',
                http: {verb: 'GET', path: '/:id/relate'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );
    };

    Deal.setup();
};
