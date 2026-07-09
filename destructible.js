(function() {
  'use strict';

  var DEST_TYPES = ['crate','vase','mushroom','ore','herb'];

  var DEST_PROPS = {
    crate:   { hp: 30, drop: { gold: [5, 15] } },
    vase:    { hp: 20, drop: { gold: [3, 10] } },
    mushroom:{ hp: 10, drop: { item: 'herb', heal: 20 } },
    ore:     { hp: 60, drop: { gold: [10, 30], item: 'stone' } },
    herb:    { hp: 15, drop: { item: 'material', heal: 10 } }
  };

  var RESPAWN_TIME = 30;

  var DEST_NAMES = {
    crate: '木箱',
    vase: '花瓶',
    mushroom: '蘑菇',
    ore: '矿石',
    herb: '药草'
  };

  var _nextId = 1;

  function makeDestructible(type, x, y) {
    if (DEST_TYPES.indexOf(type) === -1) {
      type = 'crate';
    }
    var props = DEST_PROPS[type];
    return {
      id: _nextId++,
      type: type,
      x: x || 0,
      y: y || 0,
      hp: props.hp,
      maxHp: props.hp,
      state: 'alive',
      respawnTimer: 0
    };
  }

  function hitDestructible(obj, damage) {
    if (!obj || obj.state === 'destroyed') {
      return { destroyed: false, drops: null };
    }
    obj.hp = Math.max(0, obj.hp - damage);
    if (obj.hp <= 0) {
      obj.state = 'destroyed';
      obj.respawnTimer = RESPAWN_TIME;
      return { destroyed: true, drops: getDrop(obj) };
    }
    return { destroyed: false, drops: null };
  }

  function tickRespawn(obj, dt) {
    if (!obj || obj.state !== 'destroyed') return false;
    obj.respawnTimer -= dt;
    if (obj.respawnTimer <= 0) {
      var props = DEST_PROPS[obj.type];
      obj.hp = props.hp;
      obj.maxHp = props.hp;
      obj.state = 'alive';
      obj.respawnTimer = 0;
      return true;
    }
    return false;
  }

  function getDrop(obj) {
    if (!obj || !DEST_PROPS[obj.type]) return null;
    var props = DEST_PROPS[obj.type];
    var drop = {};
    if (props.drop.gold) {
      var min = props.drop.gold[0];
      var max = props.drop.gold[1];
      drop.gold = Math.floor(Math.random() * (max - min + 1)) + min;
    }
    if (props.drop.item) {
      drop.item = props.drop.item;
    }
    if (props.drop.heal) {
      drop.heal = props.drop.heal;
    }
    return Object.keys(drop).length > 0 ? drop : null;
  }

  function physicsFeedback(obj) {
    return {
      shake: 3,
      particles: ['debris'],
      sound: 'smash'
    };
  }

  var exports = {
    DEST_TYPES: DEST_TYPES,
    DEST_PROPS: DEST_PROPS,
    RESPAWN_TIME: RESPAWN_TIME,
    DEST_NAMES: DEST_NAMES,
    makeDestructible: makeDestructible,
    hitDestructible: hitDestructible,
    tickRespawn: tickRespawn,
    getDrop: getDrop,
    physicsFeedback: physicsFeedback
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }
  if (typeof window !== 'undefined') {
    window.destructible = exports;
    window.Destructible = exports;
  }
})();
