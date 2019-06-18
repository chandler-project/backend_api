module.exports = (FeedBack) => {
  FeedBack.observe('before save', (ctx, next) => {
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
};
