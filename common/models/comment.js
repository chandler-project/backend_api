module.exports = function (Comment) {
    Comment.observe('before save', (ctx, next) => {
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
    })

    Comment.observe('after save', (ctx, next) => {
        if (ctx.instance) {
            const dealId = ctx.instance.dealId.toString();
            Comment.app.models.Deal.findById(dealId, (err, deal) => {
                if (err) return next(err);
                if (deal) {
                    deal.updateAttributes({
                        '$inc': {
                            'noOfComments': 1
                        }
                    }, next);
                } else {
                    return next(new Error('Deal not found'));
                }
            })
        } else {
            next();
        }
    })
};
