/*
 * gameEconomy.js — 经济模块与游戏逻辑之间的桥接层
 * 设计依据：《游戏经济系统设计.md》(GDD v1) + economy.js
 * 双模式：浏览器 <script> 挂载 window.GameEconomy；Node 下 module.exports（供测试）。
 *
 * 职责：
 *   1. 把游戏内真实的金币产生点（怪物掉落 / 宝箱）接到 Economy 的缩放公式，
 *      使「赚」随等级 / 地图 / 碾压衰减 / 精英 Boss 档位动态变化。
 *   2. 提供装备强化的「消耗侧」纯逻辑（canEnhance / applyEnhance），
 *      让 Economy.enhCost 真正成为金币黑洞，闭环「赚→花→更强」。
 * 该层不依赖 index.html，可被 test_gameEconomy.js 直接加载验证。
 */
(function (root, factory) {
  const Economy = (typeof require !== 'undefined')
    ? require('./economy.js')
    : (root.Economy || (typeof window !== 'undefined' ? window.Economy : undefined));
  const api = factory(Economy);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.GameEconomy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Economy) {
  'use strict';

  if (!Economy) throw new Error('gameEconomy.js 依赖 Economy 模块（请先加载 economy.js）');

  // 每张地图的内容等级（对齐六幕等级门槛），用于碾压衰减判定
  // 幕0/1 比奇城郊≈L1~5；幕2 僵尸洞窟≈L6~10；幕3 烈焰火山≈L11~15；
  // 幕4 冰封雪原≈L16~20；幕5 魔龙深渊≈L21~25
  const MAP_CONTENT_LEVEL = [1, 6, 11, 16, 21, 25];

  const REWARD_SCALE = Economy.C.REWARD_SCALE; // 7
  const ENH_CAP = Economy.C.ENH_CAP;           // 15
  const ENH_PER_LEVEL = 0.08;                  // 每级 +8% 基础攻防（经济文档「战力泵」）

  // ── 1. 怪物金币（获取侧）────────────────────────────────────
  // defGold：怪物设计原始金币值（如史莱姆 3）；此处乘 REWARD_SCALE 作为 L1 基线，
  // 再由 Economy.monsterGold 叠加 等级系数 / 地图系数 / 精英 / 碾压衰减。
  function monsterGold(defGold, opts) {
    opts = opts || {};
    const base = (defGold == null ? 8 : defGold) * REWARD_SCALE;
    const mapIndex = opts.mapIndex || 0;
    return Economy.monsterGold({
      base,
      level: opts.level,
      mapIndex,
      isElite: opts.isElite,
      isBoss: opts.isBoss,
      contentLevel: (opts.contentLevel != null) ? opts.contentLevel : (MAP_CONTENT_LEVEL[mapIndex] || 1),
      playerLevel: opts.playerLevel,
    });
  }

  // ── 2. 宝箱金币（获取侧）────────────────────────────────────
  // rngGold：原始随机基数（如 30 + 0~119）；乘 REWARD_SCALE 与等级系数。
  function chestGold(rngGold, opts) {
    opts = opts || {};
    const lvl = opts.level || 1;
    const scale = Economy.levelFactor(lvl);
    return Math.max(1, Math.round((rngGold == null ? 30 : rngGold) * REWARD_SCALE * scale));
  }

  // ── 3. 强化费用（消耗侧，委托 Economy）──────────────────────
  function enhCost(level, opts) { return Economy.enhCost(level, opts); }
  function enhCumulative(level, opts) { return Economy.enhCumulative(level, opts); }

  // ── 4. 强化纯逻辑（消耗侧核心）──────────────────────────────
  // 能否强化：未达上限 + 金币足够
  function canEnhance(eq, gold) {
    if (!eq) return { ok: false, reason: 'no-equip' };
    const lvl = eq.enhanceLevel || 0;
    if (lvl >= ENH_CAP) return { ok: false, reason: 'max-level' };
    const cost = enhCost(lvl, { equipLevel: eq.equipLevel || 0 });
    if (!Number.isFinite(gold) || gold < cost) {
      return { ok: false, reason: 'insufficient-gold', cost };
    }
    return { ok: true, cost, nextLevel: lvl + 1 };
  }

  // 执行强化（纯函数，返回副本，不修改入参）。
  // 直接永久抬升 baseAtk / baseDef，被 calcPlayerStats 自然读取，无需改算分逻辑。
  function applyEnhance(eq, gold) {
    const check = canEnhance(eq, gold);
    if (!check.ok) return { ok: false, reason: check.reason, cost: check.cost };
    const next = JSON.parse(JSON.stringify(eq));
    const mult = 1 + ENH_PER_LEVEL;
    next.baseAtk = Math.round((next.baseAtk || 0) * mult);
    next.baseDef = Math.round((next.baseDef || 0) * mult);
    next.enhanceLevel = (next.enhanceLevel || 0) + 1;
    return { ok: true, eq: next, cost: check.cost, level: next.enhanceLevel };
  }

  // ── 5. 耐久与金币沉淀（消耗侧补充，防通胀）──────────────
  // 委托 Economy 的纯函数，保持本层不依赖绘制。
  function duraScale(dura) { return Economy.duraScale(dura); }
  function repairCost(eq, opts) { return Economy.repairCost(eq, opts); }
  function teleportCost(fromIdx, toIdx, opts) { return Economy.teleportCost(fromIdx, toIdx, opts); }
  function reviveCost(level, opts) { return Economy.reviveCost(level, opts); }
  // 磨损应用（纯函数，返回新装备副本，dura 不低于 0）；供 index.html 战斗钩子调用
  function applyDuraLoss(eq, amount) {
    if (!eq) return eq;
    const next = JSON.parse(JSON.stringify(eq));
    next.dura = Math.max(0, (next.dura != null ? next.dura : (next.duraMax || Economy.DURABILITY_MAX)) - (amount || 0));
    return next;
  }

  return {
    REWARD_SCALE, MAP_CONTENT_LEVEL, ENH_CAP, ENH_PER_LEVEL,
    monsterGold, chestGold, enhCost, enhCumulative,
    canEnhance, applyEnhance,
    duraScale, repairCost, teleportCost, reviveCost, applyDuraLoss,
  };
});
