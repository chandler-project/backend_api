'use strict';
module.exports = () => {
  return (err, req, res, next) => {
    next(err);
  };
};
