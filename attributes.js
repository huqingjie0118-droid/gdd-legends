/*
 * attributes.js — 属性分配系统模块
 * 设计依据：《游戏机制与系统设计.md》
 * 双模式：浏览器 <script> 挂载 window.Attrib；Node 下 module.exports（供测试）。
 * 5 属性：STR(1pt=2atk), INT(1pt=2matk), AGI(1pt=1critRate%), VIT(1pt=10hp+1def), SPI(1pt=10mp+1mdef)
 * 属性上限：50，每升1级获得5属性点。
 */
(function () {
  'use strict';

  // ── 常量 ──────────────────────────────────────────────────
  const ATTRIB_BONUSES = {
    str: { atk: 2 },
    int: { matk: 2 },
    agi: { critRate: 0.01 }, // 1% 暴击率 per point
    vit: { maxHp: 10, def: 1 },
    spi: { maxMp: 10, mdef: 1 },
  };

  const MAX_PER_STAT = 50;
  const POINTS_PER_LEVEL = 5;
  const RESET_BASE_COST = 1000;
  const RESET_GROWTH = 1.5;

  // 有效属性键列表（用于校验）
  const VALID_KEYS = ['str', 'int', 'agi', 'vit', 'spi'];

  // ── 工厂 ──────────────────────────────────────────────────
  function makeAttribs() {
    return { str: 0, int: 0, agi: 0, vit: 0, spi: 0, points: 0 };
  }

  // ── 计算属性加成 ──────────────────────────────────────────
  // 给定 attribs 对象和 profession（仅用于预留职业差异化，当前未使用），
  // 返回纯数值加成 { atk, matk, def, mdef, maxHp, maxMp, critRate }
  function calcAttribBonuses(attribs, prof) {
    if (!attribs) return { atk: 0, matk: 0, def: 0, mdef: 0, maxHp: 0, maxMp: 0, critRate: 0 };

    const s = attribs.str || 0;
    const i = attribs.int || 0;
    const a = attribs.agi || 0;
    const v = attribs.vit || 0;
    const p = attribs.spi || 0;

    return {
      atk: s * ATTRIB_BONUSES.str.atk,
      matk: i * ATTRIB_BONUSES.int.matk,
      def: v * ATTRIB_BONUSES.vit.def,
      mdef: p * ATTRIB_BONUSES.spi.mdef,
      maxHp: v * ATTRIB_BONUSES.vit.maxHp,
      maxMp: p * ATTRIB_BONUSES.spi.maxMp,
      critRate: a * ATTRIB_BONUSES.agi.critRate,
    };
  }

  // ── 分配判定 ──────────────────────────────────────────────
  function canAllocate(attribs, key) {
    if (!attribs) return false;
    if (!key || !VALID_KEYS.includes(key)) return false;
    if (attribs.points <= 0) return false;
    if (attribs[key] >= MAX_PER_STAT) return false;
    return true;
  }

  // ── 分配 1 点属性 ─────────────────────────────────────────
  // 成功返回 true，失败返回 false
  function allocate(attribs, key) {
    if (!canAllocate(attribs, key)) return false;
    attribs[key] += 1;
    attribs.points -= 1;
    return true;
  }

  // ── 重置属性（返还点数）─────────────────────────────────
  // 将所有属性归零，返还已分配点数到 points 中。
  // 返回这次操作释放了多少点数。
  function resetAttribs(attribs) {
    if (!attribs) return 0;
    const total = (attribs.str || 0) + (attribs.int || 0) + (attribs.agi || 0) + (attribs.vit || 0) + (attribs.spi || 0);
    attribs.str = 0;
    attribs.int = 0;
    attribs.agi = 0;
    attribs.vit = 0;
    attribs.spi = 0;
    attribs.points += total;
    return total;
  }

  // ── 重置费用（指数增长）─────────────────────────────────
  // resetCost = 1000 * 1.5^resetCount，随重置次数递增
  function resetCost(resetCount) {
    if (!Number.isFinite(resetCount)) throw new TypeError('resetCount 须为有限数字');
    if (resetCount < 0) throw new RangeError('resetCount 须 >= 0');
    return Math.round(RESET_BASE_COST * Math.pow(RESET_GROWTH, resetCount));
  }

  // ── 导出 ──────────────────────────────────────────────────
  const Attrib = {
    ATTRIB_BONUSES, MAX_PER_STAT, POINTS_PER_LEVEL, RESET_BASE_COST, RESET_GROWTH, VALID_KEYS,
    makeAttribs, calcAttribBonuses, canAllocate, allocate, resetAttribs, resetCost,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Attrib;
  if (typeof window !== 'undefined') window.Attrib = Attrib;
})();
