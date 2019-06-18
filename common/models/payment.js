module.exports = (Payment) => {
    Payment.observe('after save', (ctx, next) => {
        if (ctx.instance) {
            const orderId = ctx.instance.orderId;
            if (orderId) {
                let updateCtx = {status: 'paid'};
                const currentMember = ctx.options.currentMember;
                if (currentMember) {
                    if (currentMember.address) {
                        updateCtx.address = currentMember.address;
                    }

                    if (currentMember.phoneNumber) {
                        updateCtx.phoneNumber = currentMember.phoneNumber;
                    }
                }
                Payment.app.models.Order.update({
                    id: orderId
                }, updateCtx, (err, instance) => {
                    if (err) return next(err);
                    next();
                })
            } else {
                next();
            }
        } else {
            next();
        }
    })
};
