/**
 * core_system.js — 四象核心系统
 * 双模式：Node 测试（module.exports）/ 浏览器（window.CoreSystem）
 *
 * 设计来源：《战斗系统深化设计.md》四象之力体系
 * 核心思路：青龙/白虎/朱雀/玄武四种核心，提供属性加成的套装联动效果，
 *           打通「核心选择 → 装备构筑 → 套装收益」的流派构建。
 */
(function (root) {
  'use strict';

  var CORES = {
    azure:     { name: '青龙', element: 'spirit', color: '#3cf', desc: '青龙之力·元素增伤' },
    white:     { name: '白虎', element: 'phys',   color: '#eee', desc: '白虎之力·物理暴击' },
    vermilion: { name: '朱雀', element: 'fire',   color: '#f53', desc: '朱雀之力·火焰灼烧' },
    black:     { name: '玄武', element: 'ice',    color: '#68f', desc: '玄武之力·寒冰守护' }
  };

  var CORE_RANKS = { min: 1, max: 10 };
  var CORE_SLOTS = 4;

  /**
   * 创建核心
   * @param {string} type - 'azure'|'white'|'vermilion'|'black'
   * @param {number} rank - 1-10
   * @returns {object} 核心对象
   */
  function makeCore(type, rank) {
    if (!CORES[type]) return null;
    rank = rank || 1;
    if (rank < CORE_RANKS.min) rank = CORE_RANKS.min;
    if (rank > CORE_RANKS.max) rank = CORE_RANKS.max;

    var def = CORES[type];
    var bonus = computeBonus(type, rank);
    return {
      type: type,
      name: def.name,
      rank: rank,
      element: def.element,
      color: def.color,
      desc: def.desc,
      bonus: bonus
    };
  }

  /**
   * 计算核心属性
   * @param {object} core
   * @returns {object} 属性对象
   */
  function coreBonuses(core) {
    if (!core || !core.type) return {};
    return core.bonus || computeBonus(core.type, core.rank || 1);
  }

  function computeBonus(type, rank) {
    var bonus = {};
    switch (type) {
      case 'azure':
        bonus.matk = rank * 3;
        bonus.spiritDmg = +(rank * 0.02).toFixed(2);
        break;
      case 'white':
        bonus.atk = rank * 3;
        bonus.critRate = +(rank * 0.015).toFixed(3);
        break;
      case 'vermilion':
        bonus.fireDmg = +(rank * 0.03).toFixed(2);
        bonus.burnDmg = rank * 2;
        break;
      case 'black':
        bonus.def = rank * 2;
        bonus.maxHp = rank * 20;
        bonus.iceResist = +(rank * 0.02).toFixed(2);
        break;
    }
    return bonus;
  }

  /**
   * 装备核心到指定槽位（每类核心独占一个槽位）
   * @param {object} loadout
   * @param {object} core
   * @param {number} slotIndex - 0-3
   * @returns {object} 更新后的配装
   */
  function equipCore(loadout, core, slotIndex) {
    if (!loadout || !core) return null;
    if (slotIndex < 0 || slotIndex >= CORE_SLOTS) return null;
    if (!loadout.cores) loadout.cores = [];
    // Ensure array is large enough
    while (loadout.cores.length < CORE_SLOTS) {
      loadout.cores.push(null);
    }
    // Check if this core type is already equipped in another slot
    for (var i = 0; i < loadout.cores.length; i++) {
      if (i !== slotIndex && loadout.cores[i] && loadout.cores[i].type === core.type) {
        return null; // Same type already equipped
      }
    }
    loadout.cores[slotIndex] = makeCore(core.type, core.rank);
    return loadout;
  }

  /**
   * 从槽位移除核心
   * @param {object} loadout
   * @param {number} slotIndex
   * @returns {object} 更新后的配装
   */
  function removeCore(loadout, slotIndex) {
    if (!loadout || !loadout.cores) return null;
    if (slotIndex < 0 || slotIndex >= loadout.cores.length) return null;
    loadout.cores[slotIndex] = null;
    return loadout;
  }

  /**
   * 计算所有已装备核心的总属性加成
   * @param {object} loadout
   * @returns {object} 累加后的属性对象
   */
  function calcTotalBonuses(loadout) {
    var total = {};
    if (!loadout || !loadout.cores) return total;

    for (var i = 0; i < loadout.cores.length; i++) {
      var core = loadout.cores[i];
      if (!core) continue;
      var bonus = coreBonuses(core);
      for (var key in bonus) {
        if (bonus.hasOwnProperty(key)) {
          if (!total[key]) total[key] = 0;
          total[key] = +(total[key] + bonus[key]).toFixed(3);
        }
      }
    }
    return total;
  }

  /**
   * 计算核心升级消耗
   * @param {object} core
   * @returns {{gold:number, coreFragments:number}}
   */
  function coreUpgradeCost(core) {
    if (!core) return { gold: 0, coreFragments: 0 };
    var rank = core.rank || 1;
    if (rank >= CORE_RANKS.max) return { gold: 0, coreFragments: 0 };
    return {
      gold: Math.floor(500 * Math.pow(rank, 1.8)),
      coreFragments: rank * 2
    };
  }

  /**
   * 升级核心（提升1级，最高10级）
   * @param {object} core
   * @returns {object} 更新后的核心
   */
  function upgradeCore(core) {
    if (!core) return null;
    if (core.rank >= CORE_RANKS.max) return core;
    core.rank += 1;
    core.bonus = computeBonus(core.type, core.rank);
    return core;
  }

  // ==================== 套装加成 ====================
  var SET_BONUSES = {
    2: {
      desc: '四象初醒：全攻击 +5%',
      bonuses: { allAtk: 0.05 }
    },
    3: {
      desc: '四象共鸣：全攻击 +10%，暴击率 +3%',
      bonuses: { allAtk: 0.10, critRate: 0.03 }
    },
    4: {
      desc: '四象归一：全攻击 +20%，暴击率 +5%，伤害减免 +5%',
      bonuses: { allAtk: 0.20, critRate: 0.05, dmgReduce: 0.05 }
    }
  };

  /**
   * 检查配装的套装加成等级
   * @param {object} loadout
   * @returns {{level:number, desc:string, bonuses:object}}
   */
  function checkSetBonus(loadout) {
    if (!loadout || !loadout.cores) return { level: 0, desc: '无套装效果', bonuses: {} };

    var equippedTypes = {};
    var count = 0;
    for (var i = 0; i < loadout.cores.length; i++) {
      var core = loadout.cores[i];
      if (core && core.type && CORES[core.type]) {
        if (!equippedTypes[core.type]) {
          equippedTypes[core.type] = true;
          count++;
        }
      }
    }

    // Determine the highest set bonus level
    var level = 0;
    if (count >= 4) level = 4;
    else if (count >= 3) level = 3;
    else if (count >= 2) level = 2;

    if (level === 0) {
      return { level: 0, desc: '无套装效果', bonuses: {} };
    }

    var bonusDef = SET_BONUSES[level];
    return {
      level: level,
      desc: bonusDef.desc,
      bonuses: bonusDef.bonuses
    };
  }

  // ==================== 导出 ====================
  var CoreSystem = {
    CORES: CORES,
    CORE_RANKS: CORE_RANKS,
    CORE_SLOTS: CORE_SLOTS,
    SET_BONUSES: SET_BONUSES,
    makeCore: makeCore,
    coreBonuses: coreBonuses,
    equipCore: equipCore,
    removeCore: removeCore,
    calcTotalBonuses: calcTotalBonuses,
    coreUpgradeCost: coreUpgradeCost,
    upgradeCore: upgradeCore,
    checkSetBonus: checkSetBonus
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoreSystem;
  } else {
    root.CoreSystem = CoreSystem;
  }
})(this);
