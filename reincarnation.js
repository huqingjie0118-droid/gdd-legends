/*
 * reincarnation.js — 转生系统模块
 * 设计依据：《游戏机制与系统设计.md》
 * 双模式：浏览器 <script> 挂载 window.Reinc；Node 下 module.exports（供测试）。
 * 玩家满级(Lv50)后可转生，最多 9 转，每次转生获得永久百分比加成。
 */
(function () {
  'use strict';

  // ── 常量 ──────────────────────────────────────────────────
  const REINCARNATION_REQ_LEVEL = 50;
  const MAX_REINCARNATION = 9;
  const REQ_KILLS = 1000;

  // 转生称号
  const TITLES = ['', '一转', '二转', '三转', '四转', '五转', '六转', '七转', '八转', '九转'];

  // ── 转生状态工厂 ──────────────────────────────────────────
  function makeReincarnation() {
    return { reincLevel: 0, totalKills: 0, totalGoldEarned: 0 };
  }

  // ── 转生条件判定 ──────────────────────────────────────────
  // 要求：level >= 50, reincLevel < 9, stats.totalKills >= 1000
  function canReincarnate(level, reincLevel, stats) {
    if (!Number.isFinite(level) || !Number.isFinite(reincLevel)) return false;
    if (level < REINCARNATION_REQ_LEVEL) return false;
    if (reincLevel >= MAX_REINCARNATION) return false;
    if (!stats || (stats.totalKills || 0) < REQ_KILLS) return false;
    return true;
  }

  // ── 转生加成 ──────────────────────────────────────────────
  // 每级：+5% atk/matk, +5% maxHp, +2% critRate, +50 gold per level
  function reincarnationBonuses(reincLevel) {
    if (!Number.isFinite(reincLevel) || reincLevel < 0 || reincLevel > MAX_REINCARNATION) {
      return { atkMult: 0, matkMult: 0, maxHpMult: 0, critRateBonus: 0, goldPerLevel: 0 };
    }
    return {
      atkMult: 0.05 * reincLevel,
      matkMult: 0.05 * reincLevel,
      maxHpMult: 0.05 * reincLevel,
      critRateBonus: 0.02 * reincLevel,
      goldPerLevel: 50 * reincLevel,
    };
  }

  // ── 执行转生 ──────────────────────────────────────────────
  // 修改 state 对象，将 level 重置为 1，reincLevel +1，返回加成对象
  // state 需包含 { level, reincLevel, ... }
  function performReincarnation(state) {
    if (!state) return null;
    state.reincLevel = (state.reincLevel || 0) + 1;
    state.level = 1;
    const bonuses = reincarnationBonuses(state.reincLevel);
    return { reincLevel: state.reincLevel, bonuses };
  }

  // ── 转生称号格式化 ──────────────────────────────────────────
  // 0→空字符串, 1→"一转", 2→"二转", ..., 9→"九转"
  function formatReincarnation(reincLevel) {
    if (!Number.isFinite(reincLevel) || reincLevel < 0 || reincLevel > MAX_REINCARNATION) return '';
    return TITLES[reincLevel];
  }

  // ── 导出 ──────────────────────────────────────────────────
  const Reinc = {
    REINCARNATION_REQ_LEVEL, MAX_REINCARNATION, REQ_KILLS, TITLES,
    makeReincarnation, canReincarnate, reincarnationBonuses, performReincarnation, formatReincarnation,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Reinc;
  if (typeof window !== 'undefined') window.Reinc = Reinc;
})();
