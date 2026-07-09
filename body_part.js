(function() {
  'use strict';

  var BODY_PARTS = ['head','arms','torso','legs','wings'];

  var PART_MULTIPLIERS = {
    head: 0.25,
    arms: 0.20,
    torso: 0.35,
    legs: 0.15,
    wings: 0.10
  };

  var PART_REWARDS = {
    head: 'rare_drop',
    arms: 'dmg_reduce_debuff',
    torso: 'stun',
    legs: 'slow',
    wings: 'aoe_effect'
  };

  var PART_NAMES = {
    head: '头部',
    arms: '双臂',
    torso: '躯干',
    legs: '双腿',
    wings: '翅膀'
  };

  function makeParts(bossMaxHp) {
    if (typeof bossMaxHp !== 'number' || bossMaxHp <= 0) {
      bossMaxHp = 1000;
    }
    var parts = {};
    BODY_PARTS.forEach(function(name) {
      var hp = Math.round(bossMaxHp * PART_MULTIPLIERS[name]);
      parts[name] = {
        hp: hp,
        maxHp: hp,
        destroyed: false,
        rewardClaimed: false
      };
    });
    return parts;
  }

  function hitPart(parts, partName, damage) {
    if (!parts || !parts[partName]) {
      return { destroyed: false, reward: null };
    }
    var part = parts[partName];
    if (part.destroyed) {
      return { destroyed: false, reward: null };
    }
    part.hp = Math.max(0, part.hp - damage);
    if (part.hp <= 0) {
      part.destroyed = true;
      var reward = destroyReward(partName);
      return { destroyed: true, reward: reward };
    }
    return { destroyed: false, reward: null };
  }

  function destroyReward(partName) {
    var rewardMap = {
      head: '稀有掉落物品',
      arms: '减少敌人物伤50%',
      torso: 'BOSS眩晕3秒',
      legs: 'BOSS减速50%持续5秒',
      wings: '范围AOE伤害200点'
    };
    return rewardMap[partName] || '未知奖励';
  }

  function getDestroyedCount(parts) {
    if (!parts) return 0;
    var count = 0;
    BODY_PARTS.forEach(function(name) {
      if (parts[name] && parts[name].destroyed) {
        count++;
      }
    });
    return count;
  }

  function allDestroyed(parts) {
    return getDestroyedCount(parts) === BODY_PARTS.length;
  }

  function partColor(partName, parts) {
    if (!parts || !parts[partName]) return '#888';
    var part = parts[partName];
    if (part.destroyed) return '#f44336';
    if (part.hp <= part.maxHp * 0.25) return '#ffeb3b';
    return '#4caf50';
  }

  var exports = {
    BODY_PARTS: BODY_PARTS,
    PART_MULTIPLIERS: PART_MULTIPLIERS,
    PART_REWARDS: PART_REWARDS,
    PART_NAMES: PART_NAMES,
    makeParts: makeParts,
    hitPart: hitPart,
    destroyReward: destroyReward,
    getDestroyedCount: getDestroyedCount,
    allDestroyed: allDestroyed,
    partColor: partColor
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }
  if (typeof window !== 'undefined') {
    window.bodyPart = exports;
    window.BodyPart = exports;
  }
})();
