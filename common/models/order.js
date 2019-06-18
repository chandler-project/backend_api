const async = require('async');
module.exports = (Order) => {
    Order.delivered = (id, options, next) => {
        const {currentMember} = options;
        const {Member} = Order.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }
        Order.findById(id, (err, order) => {
            if (err) return next(err);
            if (!order) return Member.handlerError('Order not found', 404, next);
            const {status, requester, shipper} = order;
            if (currentMember.id.toString() !== shipper.id.toString())
                return Member.handlerError('Permission Denied', 401, next);
            if (status.toLowerCase() === 'accepted') {
                // Update Order Delivered and send notification to requester
                order.__data.status = 'Delivered';
                Member.findById(requester.id, {fields: {device: true, id: true}}, (err, owner) => {
                    if (err) return next(err);
                    order.save((error, order) => {
                        if (error) return next(error);
                        Order.app.models.Notification.create({
                            title: `Đơn hàng ${order.id.toString()} đã được giao`,
                            data: {
                                memberId: owner.id,
                                sentence: `Đơn hàng của bạn đã được giao bởi ${shipper.fullName}`,
                            },
                            receiver: owner.id,
                            device: owner.device,
                        }, (error, notification) => {
                            return next(null, order);
                        });
                    })
                });
            } else {
                return Member.handlerError('This order is not paid', 400, next);
            }
        })
    };

    Order.confirmed = (id, options, next) => {
        const {currentMember} = options;
        const {Member} = Order.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }
        Order.findById(id, (err, order) => {
            if (err) return next(err);
            if (!order) return Member.handlerError('Order not found', 404, next);
            const {status, requester, shipper} = order;
            if (currentMember.id.toString() !== requester.id.toString())
                return Member.handlerError('Permission Denied', 401, next);
            if (status.toLowerCase() === 'delivered') {
                // Update Order Delivered and send notification to requester
                order.__data.status = 'Success';
                Member.findById(shipper.id, {fields: {device: true, id: true}}, (err, owner) => {
                    if (err) return next(err);
                    order.save((error, order) => {
                        if (error) return next(error);
                        Order.app.models.Notification.create({
                            title: `${requester.fullName} vừa xác nhận giao hàng thành công`,
                            data: {
                                memberId: owner.id,
                                sentence: `Khách hàng ${requester.fullName} vừa xác nhận đã nhận được hàng`,
                            },
                            receiver: owner.id,
                            device: owner.device,
                        }, (error, notification) => {
                            return next(null, order);
                        });
                    })
                });
            } else {
                return Member.handlerError('Đơn hàng này chưa được shipper xác nhận là đã giao hàng', 400, next);
            }
        })
    };

    Order.accepted = (id, options, next) => {
        const {currentMember} = options;
        const {Member, Deal, Request} = Order.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }
        Order.findById(id, (err, order) => {
            if (err) return next(err);
            if (!order) return Member.handlerError('Order not found', 404, next);
            const {shipper, requester, status} = order;
            if (shipper && typeof shipper.id !== 'undefined') {
                if (currentMember.id.toString() === shipper.id.toString()) {
                    if (status === 'paid') {
                        order.__data.status = 'accepted';
                        order.save(next);
                    } else {
                        return Member.handlerError('Can\'t accept ' + status + ' order', 400, next);
                    }
                }
            } else {
                return Member.handlerError('Permission Denied', 400, next);
            }
        })
    };

    Order.rejected = (id, reason, options, next) => {
        const {currentMember} = options;
        const {Member, Deal, Request} = Order.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }
        Order.findById(id, (err, order) => {
            if (err) return next(err);
            if (!order) return Member.handlerError('Order not found', 404, next);
            const {shipper, requester, status} = order;
            if (shipper && typeof shipper.id !== 'undefined') {
                if (currentMember.id.toString() === shipper.id.toString()) {
                    if (status === 'paid') {
                        order.__data.status = 'rejected';
                        order.__data.reason = reason;
                        order.save(next);
                    } else {
                        return Member.handlerError('Không thể từ chối đơn hàng', 400, next);
                    }
                }
            } else {
                return Member.handlerError('Bạn không phải là người giao hàng nên không thể từ chối đơn hàng', 400, next);
            }
        })
    };

    Order.denied = (id, reason, options, next) => {
        const {currentMember} = options;
        const {Member} = Order.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }
        Order.findById(id, (err, order) => {
            if (err) return next(err);
            if (!order) return Member.handlerError('Không tìm thấy đơn hàng', 404, next);
            const {status, requester, shipper} = order;
            if (currentMember.id.toString() !== requester.id.toString())
                return Member.handlerError('Permission Denied', 401, next);
            if (status.toLowerCase() === 'delivered') {
                // Update Order Delivered and send notification to requester
                order.__data.status = 'Failed';
                order.__data.reason = reason;
                Member.findById(shipper.id, {fields: {device: true, id: true}}, (err, owner) => {
                    if (err) return next(err);
                    order.save((error, order) => {
                        if (error) return next(error);
                        Order.app.models.Notification.create({
                            title: `${requester.fullName} vừa từ chối nhận hàng của bạn`,
                            data: {
                                memberId: owner.id,
                                sentence: `Khách hàng ${requester.fullName} vừa từ chối nhận hàng của bạn`,
                            },
                            receiver: owner.id,
                            device: owner.device,
                        }, (error, notification) => {
                            return next(null, order);
                        });
                    })
                });
            } else {
                return Member.handlerError('Bạn không thể từ chối nhận hàng vì bạn không phải là người yêu cầu', 400, next);
            }
        })
    };

    Order.makePayment = (id, options, next) => {
        const {currentMember} = options;
        const {Member} = Order.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }
        Order.findById(id, (err, order) => {
            if (err || !order) {
                return Member.handlerError('Order not found', 400, next);
            }
            const {requester, shipper} = order;
            if (shipper.id.toString() === currentMember.id.toString()) {
                return Member.handlerError('Shipper cannot make a payment', 400, next);
            }
            if (requester.id.toString() !== currentMember.id.toString()) {
                return Member.handlerError('Permission Denied', 401, next);
            }
            order.__data.status = 'Accepted';
            async.parallel([
                (cb) => {
                    Member.findById(shipper.id, cb);
                },
                (cb) => {
                    order.save(cb);
                }
            ], (err, rs) => {
                if (err) return next(err);
                const [owner, order] = rs;
                if (owner && order) {
                    Order.app.models.Notification.create({
                        title: `Đơn hàng ${order.id.toString()} đã được thanh toán`,
                        data: {
                            memberId: owner.id,
                            sentence: `${requester.fullName} đã thanh toán ${order.shippingPrice} cho đơn hàng của bạn`,
                        },
                        receiver: owner.id,
                        device: owner.device,
                    }, (error, notification) => {
                        return next(null, order);
                    });
                } else {
                    return next(null, order);
                }
            });
        })
    };

    Order.payForAllOrders = (data, options, next) => {
        const {currentMember} = options;
        const {Member} = Order.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }
        const {payment} = data;
        Order.find({
            where: {
                "requester.id": currentMember.id,
                status: 'pending'
            }
        }, (err, orders) => {
            if (err) return next(err);
            const orderIds = orders.map(order => order.id);
            Order.updateAll({
                id: {
                    inq: orderIds
                }
            }, {
                status: 'paid',
                address: currentMember.address ? currentMember.address : '',
                phoneNumber: currentMember.phoneNumber ? currentMember.phoneNumber : ''
            }, (err, instance, count) => {
                if (err) return next(err);
                Order.app.models.Payment.create(payment, (error, inst) => {
                    if (error) return next(error);
                    return next(null, instance)
                });
            });
        })
    };


    Order.countPendingOrders = (options, next) => {
        const {currentMember} = options;
        const {Member} = Order.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }
        Order.count({
            "requester.id": currentMember.id,
            status: 'pending',
        }, (err, count) => {
            if (err) return next(err);
            return next(null, {
                count: count
            });
        });
    };

    Order.getPendingOrders = (options, next) => {
        const {currentMember} = options;
        const {Member} = Order.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }
        Order.find({
            where: {
                "requester.id": currentMember.id,
                status: 'pending',
            }
        }, next);
    }

    Order.disclaimer = (orderId, options, next) => {
        const {currentMember} = options;
        const {Member, Request, Deal} = Order.app.models;
        if (!currentMember) {
            return Member.handlerError('Permission Denied', 401, next);
        }

        Order.findById(orderId, (err, order) => {
            if (err || !order)
                return Member.handlerError('Không tìm thấy đơn hàng', 400, next);
            const {dealId, requestId} = order;
            if (requestId && requestId !== '') {
                Request.findById(requestId, (err, request) => {
                    if (err) return next(err);
                    const {bidders} = request;
                    const newBidders = bidders.filter(bidder => bidder.id.toString() !== currentMember.id.toString());
                    request.updateAttributes({
                        bidders: newBidders
                    }, (err, newRequest) => {
                        if (err) return next(err);
                        order.destroy((err) => {
                            if (err) return next(err);
                            return next(null, "Order đã được hủy thành công");
                        })
                    })
                })
            } else if (dealId && dealId !== '') {
                Deal.findById(dealId, (err, deal) => {
                    if (err) return next(err);
                    const {requesters} = deal;
                    const newRequesters = requesters.filter(request => request.id.toString() !== currentMember.id.toString());
                    deal.updateAttributes({
                        requesters: newRequesters
                    }, (err, newDeal) => {
                        if (err) return next(err);
                        order.destroy((err) => {
                            if (err) return next(err);
                            return next(null, "Order đã được hủy thành công");
                        })
                    })
                })
            }
        })
    }

    Order.setup = () => {
        Order.remoteMethod(
            'makePayment',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id',
                        type: 'string',
                        description: 'Order ID',
                        required: true,
                        http: {source: 'path'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Requester will make a payment for order',
                http: {verb: 'PATCH', path: '/:id/pay'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Order.remoteMethod(
            'payForAllOrders',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'data',
                        type: 'object',
                        description: 'Payment Object',
                        required: true,
                        http: {source: 'body'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Requester will make a payment for all orders',
                http: {verb: 'PATCH', path: '/pay'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Order.remoteMethod(
            'delivered',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id',
                        type: 'string',
                        description: 'Order ID',
                        required: true,
                        http: {source: 'path'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Shipper is delivered order',
                http: {verb: 'PATCH', path: '/:id/delivered'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Order.remoteMethod(
            'confirmed',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id',
                        type: 'string',
                        description: 'Order ID',
                        required: true,
                        http: {source: 'path'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Requester is confirm on delivered order',
                http: {verb: 'PATCH', path: '/:id/confirmed'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Order.remoteMethod(
            'accepted',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id',
                        type: 'string',
                        description: 'Order ID',
                        required: true,
                        http: {source: 'path'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Người giao hàng xác nhận đơn hàng để giao',
                http: {verb: 'PATCH', path: '/:id/accepted'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Order.remoteMethod(
            'rejected',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id',
                        type: 'string',
                        description: 'Order ID',
                        required: true,
                        http: {source: 'path'}
                    },
                    {
                        arg: 'reason',
                        type: 'string',
                        description: 'Lý do từ chối',
                        required: true,
                        http: {source: 'body'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Người giao hàng có thể từ chối đơn hàng với 1 lý do nào đó',
                http: {verb: 'PATCH', path: '/:id/rejected'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Order.remoteMethod(
            'disclaimer',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id',
                        type: 'string',
                        description: 'Order ID',
                        required: true,
                        http: {source: 'path'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Người giao hàng có thể từ chối đơn hàng với 1 lý do nào đó',
                http: {verb: 'PATCH', path: '/:id/disclaimer'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Order.remoteMethod(
            'denied',
            {
                accessType: 'WRITE',
                accepts: [
                    {
                        arg: 'id',
                        type: 'string',
                        description: 'Order ID',
                        required: true,
                        http: {source: 'path'}
                    },
                    {
                        arg: 'reason',
                        type: 'string',
                        description: 'Lý do từ chối',
                        required: true,
                        http: {source: 'body'}
                    },
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Người giao hàng có thể từ chối đơn hàng với 1 lý do nào đó',
                http: {verb: 'PATCH', path: '/:id/denied'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Order.remoteMethod(
            'countPendingOrders',
            {
                accessType: 'WRITE',
                accepts: [
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Người giao hàng có thể từ chối đơn hàng với 1 lý do nào đó',
                http: {verb: 'GET', path: '/pendings/count'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );

        Order.remoteMethod(
            'getPendingOrders',
            {
                accessType: 'WRITE',
                accepts: [
                    {arg: 'options', type: 'object', http: 'optionsFromRequest'},
                ],
                description: 'Người dùng có thể lấy ra được tất cả các đơn hàng đang có trạng thái chờ thnah toán',
                http: {verb: 'GET', path: '/pendings'},
                returns: {arg: 'data', type: 'object', root: true},
            }
        );
    };

    Order.setup();
};
