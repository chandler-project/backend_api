'use strict';

module.exports = function (Category) {
  Category.setup = () => {
    Category.disableRemoteMethodByName('prototype.__delete__deals');
    Category.disableRemoteMethodByName('prototype.__destroyById__deals');
    Category.disableRemoteMethodByName('prototype.__findById__deals');
    Category.disableRemoteMethodByName('prototype.__updateById__deals');
    Category.disableRemoteMethodByName('prototype.__count__deals');
    Category.disableRemoteMethodByName('prototype.__delete__requests');
    Category.disableRemoteMethodByName('prototype.__destroyById__requests');
    Category.disableRemoteMethodByName('prototype.__findById__requests');
    Category.disableRemoteMethodByName('prototype.__updateById__requests');
    Category.disableRemoteMethodByName('prototype.__count__requests');
    Category.disableRemoteMethodByName('replaceOrCreate');
    Category.disableRemoteMethodByName('patchOrCreate');
    Category.disableRemoteMethodByName('exists');
    Category.disableRemoteMethodByName('replaceById');
    Category.disableRemoteMethodByName('upsertWithWhere');
    Category.disableRemoteMethodByName('updateAll');
    Category.disableRemoteMethodByName('findOne');
    Category.disableRemoteMethodByName('createChangeStream');
  };

  Category.setup();
};
