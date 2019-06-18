'use strict';
module.exports = function(app) {
  let Role = app.models.Role;
  let Member = app.models.Member;
  const MEMBER_TYPES = {
    PMP: 0,
    ADMIN: 1,
    RETAILER: 2,
    STAFF: 3,
  };

  Role.registerResolver('admin', function(role, context, next) {
    let accessToken = context.accessToken;
    if (accessToken && accessToken.userId) {
      Member.findById(
        accessToken.userId,
        {fields: ['type']},
        (err, userInfo) => {
          if (err || !userInfo) {
            next(null, false);
          } else {
            if (userInfo.type.indexOf(MEMBER_TYPES.ADMIN) !== -1) {
              next(null, true);
            } else {
              next(null, false);
            }
          }
        });
    } else {
      next(null, false);
    }
  });

  Role.registerResolver('PMP', function(role, context, next) {
    let accessToken = context.accessToken;
    if (accessToken && accessToken.userId) {
      Member.findById(
        accessToken.userId,
        {fields: ['type']},
        (err, userInfo) => {
          if (err || !userInfo) {
            next(null, false);
          } else {
            if (userInfo.type.indexOf(MEMBER_TYPES.PMP) !== -1 && userInfo.name === 'PMP') {
              next(null, true);
            } else {
              next(null, false);
            }
          }
        });
    } else {
      next(null, false);
    }
  });

  Role.registerResolver('retailer', function(role, context, next) {
    let accessToken = context.accessToken;
    if (accessToken && accessToken.userId) {
      Member.findById(
        accessToken.userId,
        {fields: ['type']},
        (err, userInfo) => {
          if (err || !userInfo) {
            next(null, false);
          } else {
            if (userInfo.type.indexOf(MEMBER_TYPES.RETAILER) !== -1) {
              next(null, true);
            } else {
              next(null, false);
            }
          }
        });
    } else {
      next(null, false);
    }
  });

  Role.registerResolver('staff', function(role, context, next) {
    let accessToken = context.accessToken;
    if (accessToken && accessToken.userId) {
      Member.findById(
        accessToken.userId,
        {fields: ['type']},
        (err, userInfo) => {
          if (err || !userInfo) {
            next(null, false);
          } else {
            if (userInfo.type.indexOf(MEMBER_TYPES.STAFF) !== -1 ||
              userInfo.type.indexOf(MEMBER_TYPES.RETAILER) !== -1) {
              next(null, true);
            } else {
              next(null, false);
            }
          }
        });
    } else {
      next(null, false);
    }
  });
};
