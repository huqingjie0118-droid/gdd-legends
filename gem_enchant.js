/**
 * gem_enchant.js — 镶嵌附魔系统
 * 双模式：Node 测试（module.exports）/ 浏览器（window.GemEnchant）
 *
 * 设计来源：《游戏机制与系统设计.md》装备强化体系
 * 核心思路：宝石镶嵌提供属性加成，附魔系统提供随机词缀增强，
 *           打通「装备 → 宝石 → 附魔」的养成闭环。
 */
(function (root) {
  'use strict';

  // ==================== 宝石定义 ====================
  var GEM_TYPES = {
    ruby:     { name: '红宝石', stat: 'atk',      base: 5,   color: '#f33' },
    sapphire: { name: '蓝宝石', stat: 'matk',     base: 5,   color: '#33f' },
    topaz:    { name: '黄玉',   stat: 'critRate', base: 0.02, color: '#ff3' },
    emerald:  { name: '翡翠',   stat: 'def',      base: 4,   color: '#3f3' },
    amethyst: { name: '紫晶',   stat: 'maxHp',    base: 30,  color: '#c3f' }
  };

  var QUALITY_MULT = {
    common: 1,
    rare:  2,
    epic:  4
  };

  // ==================== 槽位系统 ====================
  var MAX_SOCKETS = 3;
  var SOCKET_COST = [2000, 5000, 15000];

  /**
   * 创建宝石
   * @param {string} type  - 宝石类型 key
   * @param {string} quality - 'common'|'rare'|'epic'
   * @returns {object} 宝石对象
   */
  function makeGem(type, quality) {
    if (!GEM_TYPES[type]) return null;
    quality = quality || 'common';
    if (!QUALITY_MULT[quality]) return null;

    var def = GEM_TYPES[type];
    var mult = QUALITY_MULT[quality];
    return {
      type: type,
      name: def.name,
      quality: quality,
      stat: def.stat,
      base: def.base,
      value: +(def.base * mult).toFixed(2),
      color: def.color,
      desc: def.name + '(' + quality + ') +' + (def.base * mult) + ' ' + def.stat
    };
  }

  /**
   * 获取宝石属性
   * @param {object} gem
   * @returns {{stat:string, value:number}}
   */
  function gemStat(gem) {
    if (!gem || !gem.stat) return null;
    return { stat: gem.stat, value: gem.value };
  }

  /**
   * 判断是否能增加槽位
   * @param {object} equip
   * @param {number} socketCount
   * @returns {boolean}
   */
  function canAddSocket(equip, socketCount) {
    if (!equip) return false;
    if (typeof socketCount !== 'number') socketCount = (equip.sockets && equip.sockets.length) || 0;
    return socketCount < MAX_SOCKETS;
  }

  /**
   * 增加一个槽位
   * @param {object} equip
   * @returns {object} 更新后的装备
   */
  function addSocket(equip) {
    if (!equip) return null;
    if (!equip.sockets) equip.sockets = [];
    if (equip.sockets.length >= MAX_SOCKETS) return equip;
    equip.sockets.push(null);
    return equip;
  }

  /**
   * 镶嵌宝石到指定槽位
   * @param {object} equip
   * @param {object} gem
   * @param {number} slotIndex
   * @returns {object} 更新后的装备
   */
  function socketGem(equip, gem, slotIndex) {
    if (!equip || !gem) return null;
    if (!equip.sockets) equip.sockets = [];
    if (slotIndex < 0 || slotIndex >= MAX_SOCKETS) return null;
    // Grow array if needed
    while (equip.sockets.length <= slotIndex) {
      equip.sockets.push(null);
    }
    equip.sockets[slotIndex] = gem;
    return equip;
  }

  /**
   * 从槽位移除宝石
   * @param {object} equip
   * @param {number} slotIndex
   * @returns {object} 被移除的宝石或 null
   */
  function removeGem(equip, slotIndex) {
    if (!equip || !equip.sockets) return null;
    if (slotIndex < 0 || slotIndex >= equip.sockets.length) return null;
    var gem = equip.sockets[slotIndex];
    equip.sockets[slotIndex] = null;
    return gem;
  }

  /**
   * 计算装备上所有宝石的加成总和
   * @param {object} equip
   * @returns {object} {stat: value, ...}
   */
  function calcGemBonuses(equip) {
    var bonuses = {};
    if (!equip || !equip.sockets) return bonuses;

    for (var i = 0; i < equip.sockets.length; i++) {
      var gem = equip.sockets[i];
      if (!gem) continue;
      var s = gemStat(gem);
      if (!s) continue;
      if (!bonuses[s.stat]) bonuses[s.stat] = 0;
      bonuses[s.stat] = +(bonuses[s.stat] + s.value).toFixed(2);
    }
    return bonuses;
  }

  // ==================== 附魔系统 ====================
  var ENCHANT_TYPES = ['atk', 'matk', 'def', 'maxHp', 'critRate', 'critDmg', 'lifesteal'];
  var MAX_ENCHANTS = 3;

  /**
   * 生成随机附魔
   * @returns {{type:string, value:number}}
   */
  function randomEnchant() {
    var type = ENCHANT_TYPES[Math.floor(Math.random() * ENCHANT_TYPES.length)];
    var value = +(0.05 + Math.random() * 0.10).toFixed(4);
    return { type: type, value: value };
  }

  /**
   * 对装备应用一个随机附魔（最多3个）
   * @param {object} equip
   * @returns {object} 更新后的装备
   */
  function applyEnchant(equip) {
    if (!equip) return null;
    if (!equip.enchants) equip.enchants = [];
    if (equip.enchants.length >= MAX_ENCHANTS) return equip;
    var ench = randomEnchant();
    equip.enchants.push(ench);
    return equip;
  }

  /**
   * 计算附魔消耗
   * @param {object} equip
   * @returns {number} 金币消耗
   */
  function enchantCost(equip) {
    if (!equip) return 0;
    var count = (equip.enchants && equip.enchants.length) || 0;
    return Math.floor(2000 + 1000 * Math.pow(count, 1.5));
  }

  // ==================== 导出 ====================
  var GemEnchant = {
    GEM_TYPES: GEM_TYPES,
    QUALITY_MULT: QUALITY_MULT,
    MAX_SOCKETS: MAX_SOCKETS,
    SOCKET_COST: SOCKET_COST,
    ENCHANT_TYPES: ENCHANT_TYPES,
    MAX_ENCHANTS: MAX_ENCHANTS,
    makeGem: makeGem,
    gemStat: gemStat,
    canAddSocket: canAddSocket,
    addSocket: addSocket,
    socketGem: socketGem,
    removeGem: removeGem,
    calcGemBonuses: calcGemBonuses,
    randomEnchant: randomEnchant,
    applyEnchant: applyEnchant,
    enchantCost: enchantCost
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GemEnchant;
  } else {
    root.GemEnchant = GemEnchant;
  }
})(this);
