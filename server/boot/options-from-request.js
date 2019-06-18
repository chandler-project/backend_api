'use strict';
module.exports = (app) => {
    app.remotes().phases
        .addBefore('invoke', 'options-from-request')
        .use((ctx, next) => {
            if (!ctx.args.options || !ctx.args.options.accessToken) return next();
            const Member = app.models.Member;
            Member.findById(ctx.args.options.accessToken.userId, {
                fields: {
                    id: true,
                    avatar: true,
                    points: true,
                    fullName: true,
                    categories: true,
                    fbAccessToken: true,
                    isFirstCreateDeal: true,
                    isFirstCreateRequest: true,
                    phoneNumber: true,
                    address: true,
                    bio: true,
                    isShipper: true
                }
            }, (err, member) => {
                if (err) return next(err);
                ctx.args.options.currentMember = member;
                next();
            });
        });
};
