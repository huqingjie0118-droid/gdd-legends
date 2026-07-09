/**
 * refine.js — 洗练系统
 * 双模式：Node 测试（module.exports）/ 浏览器（window.Refine）
 *
 * 设计来源：《数值平衡调整说明.md》词缀构筑体系
 * 核心思路：6 大属性分类的随机重铸，支持锁定词缀，
 *           打通「装备品质 → 洗练 → 词缀锁定」的构筑闭环。
 */
(function (root) {
  'use strict';

  var REFINE_CATEGORIES = ['atk', 'def', 'hp', 'crit', 'spd', 'special'];

  var REFINE_POOL = {
    atk: [
      { stat: 'atk',      min: 2,  max: 15, pct: false },
      { stat: 'matk',     min: 2,  max: 15, pct: false },
      { stat: 'armorPen', min: 0.02, max: 0.08, pct: true }
    ],
    def: [
      { stat: 'def',       min: 2,   max: 10, pct: false },
      { stat: 'mdef',      min: 2,   max: 10, pct: false },
      { stat: 'dmgReduce', min: 0.01, max: 0.05, pct: true }
    ],
    hp: [
      { stat: 'maxHp',    min: 20,  max: 100, pct: false },
      { stat: 'lifesteal', min: 0.01, max: 0.05, pct: true },
      { stat: 'regen',    min: 1,   max: 5,   pct: false }
    ],
    crit: [
      { stat: 'critRate', min: 0.01, max: 0.05, pct: true },
      { stat: 'critDmg',  min: 0.02, max: 0.10, pct: true }
    ],
    spd: [
      { stat: 'moveSpeed',  min: 0.02, max: 0.10, pct: true },
      { stat: 'skillRange', min: 0.02, max: 0.08, pct: true },
      { stat: 'cdr',        min: 0.01, max: 0.04, pct: true }
    ],
    special: [
      { stat: 'thorns',   min: 0.03, max: 0.12, pct: true },
      { stat: 'luck',     min: 1,    max: 3,    pct: false },
      { stat: 'burnDmg',  min: 5,    max: 20,   pct: false }
    ]
  };

  var QUALITY_COST = {
    common:    500,
    good:      1000,
    rare:      2000,
    epic:      4000,
    legendary: 8000,
    mythic:    16000
  };

  var LOCK_COST_PER_AFFIX = 2000;

  /**
   * 计算洗练消耗
   * @param {string} equipQuality
   * @param {number} lockCount
   * @returns {number} 金币消耗
   */
  function refineCost(equipQuality, lockCount) {
    lockCount = lockCount || 0;
    var base = QUALITY_COST[equipQuality];
    if (!base) return 0;
    return base + lockCount * LOCK_COST_PER_AFFIX;
  }

  /**
   * 从指定分类中随机生成一条词缀
   * @param {string} category
   * @param {string} quality
   * @returns {{stat:string, value:number, pct:boolean, category:string}}
   */
  function rollRefine(category, quality) {
    if (!REFINE_POOL[category]) return null;
    var pool = REFINE_POOL[category];
    var affixDef = pool[Math.floor(Math.random() * pool.length)];
    var value;
    if (affixDef.pct) {
      value = +(affixDef.min + Math.random() * (affixDef.max - affixDef.min)).toFixed(4);
    } else {
      value = Math.floor(affixDef.min + Math.random() * (affixDef.max - affixDef.min + 1));
    }
    // quality bonus: higher quality gives a multiplier on the value
    var qualityMult = 1;
    if (quality === 'rare') qualityMult = 1.2;
    else if (quality === 'epic') qualityMult = 1.5;
    else if (quality === 'legendary') qualityMult = 1.8;
    else if (quality === 'mythic') qualityMult = 2.2;

    return {
      stat: affixDef.stat,
      value: +(value * qualityMult).toFixed(affixDef.pct ? 4 : 0),
      pct: affixDef.pct,
      category: category,
      desc: affixDef.stat + ' +' + (affixDef.pct ? (value * qualityMult * 100).toFixed(1) + '%' : value * qualityMult)
    };
  }

  /**
   * 判断装备能否洗练
   * @param {object} equip
   * @returns {boolean}
   */
  function canRefine(equip) {
    if (!equip) return false;
    if (!equip.affixes || equip.affixes.length === 0) return false;
    return true;
  }

  /**
   * 锁定一条词缀（洗练时不会被重铸）
   * @param {object} equip
   * @param {number} affixIndex
   * @param {number} cost
   * @returns {object} 更新后的装备
   */
  function lockAffix(equip, affixIndex, cost) {
    if (!equip) return null;
    if (!equip.affixes) return equip;
    if (affixIndex < 0 || affixIndex >= equip.affixes.length) return equip;
    if (!equip.lockedAffixes) equip.lockedAffixes = [];
    if (equip.lockedAffixes.indexOf(affixIndex) === -1) {
      equip.lockedAffixes.push(affixIndex);
    }
    return equip;
  }

  /**
   * 解锁一条词缀
   * @param {object} equip
   * @param {number} affixIndex
   * @returns {object} 更新后的装备
   */
  function unlockAffix(equip, affixIndex) {
    if (!equip) return null;
    if (!equip.lockedAffixes) return equip;
    var idx = equip.lockedAffixes.indexOf(affixIndex);
    if (idx !== -1) {
      equip.lockedAffixes.splice(idx, 1);
    }
    return equip;
  }

  // ==================== 导出 ====================
  var Refine = {
    REFINE_CATEGORIES: REFINE_CATEGORIES,
    REFINE_POOL: REFINE_POOL,
    QUALITY_COST: QUALITY_COST,
    LOCK_COST_PER_AFFIX: LOCK_COST_PER_AFFIX,
    refineCost: refineCost,
    rollRefine: rollRefine,
    canRefine: canRefine,
    lockAffix: lockAffix,
    unlockAffix: unlockAffix
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Refine;
  } else {
    root.Refine = Refine;
  }
})(this);
