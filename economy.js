/*
 * economy.js — 游戏经济系统模块
 * 设计依据：《游戏经济系统设计.md》(GDD v1)
 * 双模式：浏览器 <script> 挂载 window.Economy；Node 下 module.exports（供测试）。
 * 所有金币数值为「已含 REWARD_SCALE=7」的展示值，与怪物掉落口径一致。
 * 常量取自 BAL（index.html），此处独立复制以保证本模块不依赖加载顺序。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Economy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── 常量（对齐 BAL）─────────────────────────────────────────────
  const C = {
    MON_LEVEL_SCALE: 0.045,
    MON_LEVEL_FLOOR: 0.75,
    MON_LEVEL_CAP: 2.2,
    MAP_DIFF_STEP: 0.05,
    ELITE_GOLD: 2.0,
    REWARD_SCALE: 7,
    GOLD_BASE: 56,            // 普通怪 @L1 展示值 (=8×7)
    BASE_GOLD: [40, 80, 160, 320, 640], // 任务 D1..D5 @L1
    GOLD_GROWTH: 1.18,
    BASE_ENH: 200,           // 强化基底
    ENH_RATE: 1.25,
    ENH_CAP: 15,
    EQUIP_LEVEL_SCALE: 0.07,
    BASE_REF: 500,            // 重铸基底
    REF_RATE: 1.15,
    AH_TAX: 0.05,            // 拍卖行手续费
    CRUSH_DIFF: 5,           // 碾压等级差阈值
    CRUSH_GOLD: 0.6,         // 碾压金币衰减
    PITY_EPIC: 20,           // 软保底：连续未出 >= 史诗
    PITY_LEGEND: 50,         // 软保底：连续未出传说
    PITY_HARD: 100,           // 硬保底：每 N 次必出传说
  };

  // 幸运箱品质权重（对齐 QUALITY.dropWeight）
  const LUCKY_WEIGHTS = {
    common: 600, good: 250, rare: 100, epic: 38, legendary: 10, mythic: 2,
  };
  const TIER_ORDER = ['common', 'good', 'rare', 'epic', 'legendary', 'mythic'];
  const DIFFICULTY = ['D1', 'D2', 'D3', 'D4', 'D5']; // 任务难度档（≠ 品质档）

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = Math.round;

  // ── 1. 怪物金币（§2.1）──────────────────────────────────────
  function levelFactor(level) {
    if (!Number.isFinite(level)) throw new TypeError('level 必须为有限数字');
    return clamp(1 + C.MON_LEVEL_SCALE * (level - 1), C.MON_LEVEL_FLOOR, C.MON_LEVEL_CAP);
  }
  function mapFactor(mapIndex) {
    if (!Number.isFinite(mapIndex) || mapIndex < 0) throw new RangeError('mapIndex 必须 >= 0');
    return 1 + C.MAP_DIFF_STEP * mapIndex;
  }
  // 普通/精英怪物金币；contentLevel 用于碾压衰减判定
  function monsterGold(opts) {
    opts = opts || {};
    const base = opts.base == null ? C.GOLD_BASE : opts.base;
    const level = opts.level == null ? 1 : opts.level;
    const mapIndex = opts.mapIndex == null ? 0 : opts.mapIndex;
    const isElite = !!opts.isElite;
    const contentLevel = opts.contentLevel == null ? level : opts.contentLevel;
    const playerLevel = opts.playerLevel == null ? level : opts.playerLevel;

    let gold = base * levelFactor(level) * mapFactor(mapIndex) * (isElite ? C.ELITE_GOLD : 1);
    // 碾压衰减（等级差 >= CRUSH_DIFF）
    if (playerLevel - contentLevel >= C.CRUSH_DIFF) gold *= C.CRUSH_GOLD;
    return round(gold);
  }

  // ── 2. 任务金币（§2.2，复用任务文档公式）──────────────────
  function questGold(base, difficulty, playerLevel) {
    const idx = typeof difficulty === 'number' ? difficulty : DIFFICULTY.indexOf(difficulty);
    if (idx < 0 || idx > 4) throw new RangeError('difficulty 须为 D1..D5 (0..4 或字符串)');
    if (!Number.isFinite(playerLevel) || playerLevel < 1) throw new RangeError('playerLevel 须 >= 1');
    const b = (base == null ? C.BASE_GOLD[idx] : base);
    return round(b * Math.pow(C.GOLD_GROWTH, playerLevel - 1));
  }

  // ── 3. 强化费用（§3.1，指数水泵）──────────────────────────
  function enhCost(n, opts) {
    opts = opts || {};
    const base = opts.base == null ? C.BASE_ENH : opts.base;
    const equipLevel = opts.equipLevel == null ? 0 : opts.equipLevel;
    const lvl = clamp(Math.floor(n), 0, C.ENH_CAP); // n<0 → 0；n>15 → 15
    return round(base * Math.pow(C.ENH_RATE, lvl) * (1 + C.EQUIP_LEVEL_SCALE * equipLevel));
  }
  // 累计 +0..n 总花费
  function enhCumulative(n, opts) {
    const lvl = clamp(Math.floor(n), 0, C.ENH_CAP);
    let sum = 0;
    for (let i = 1; i <= lvl; i++) sum += enhCost(i, opts);
    return sum;
  }

  // ── 4. 重铸费用（§3.1，可变比率）──────────────────────────
  function reforgeCost(times, opts) {
    opts = opts || {};
    const base = opts.base == null ? C.BASE_REF : opts.base;
    const t = clamp(Math.floor(times), 0, 1e6);
    return round(base * Math.pow(C.REF_RATE, t));
  }

  // ── 5. 动态物价缩放（§5.2，随钱潮涨）──────────────────────
  function priceMult(serverAvgLevel) {
    if (!Number.isFinite(serverAvgLevel)) throw new TypeError('serverAvgLevel 必须为有限数字');
    return clamp(1 + 0.03 * (serverAvgLevel - 10), 1.0, 3.0);
  }

  // ── 6. 拍卖行手续费（§2.3）───────────────────────────────
  function ahFee(amount) {
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError('amount 须 >= 0');
    return round(amount * C.AH_TAX);
  }

  // ── 7. 幸运箱 roll（§5.1，pity 保底）────────────────────
  // state: { sinceEpic, sinceLegend, total }
  function luckyBoxRoll(state) {
    state = state || { sinceEpic: 0, sinceLegend: 0, total: 0 };
    state.total = (state.total | 0) + 1;

    // 硬保底：每 PITY_HARD 次必出传说
    if (state.total % C.PITY_HARD === 0) {
      state.sinceEpic = 0; state.sinceLegend = 0;
      return { quality: 'legendary', state: clone(state) };
    }

    // 软保底加权
    const w = Object.assign({}, LUCKY_WEIGHTS);
    if (state.sinceEpic >= C.PITY_EPIC) w.epic *= 3;
    if (state.sinceLegend >= C.PITY_LEGEND) w.legendary *= 5;

    const total = TIER_ORDER.reduce((s, k) => s + w[k], 0);
    let r = Math.random() * total;
    let picked = 'common';
    for (const k of TIER_ORDER) { r -= w[k]; if (r <= 0) { picked = k; break; } }

    // 更新保底计数
    if (TIER_ORDER.indexOf(picked) >= TIER_ORDER.indexOf('epic')) {
      state.sinceEpic = 0;
    } else state.sinceEpic++;
    if (picked === 'legendary' || picked === 'mythic') {
      state.sinceLegend = 0;
    } else state.sinceLegend++;

    return { quality: picked, state: clone(state) };
  }

  // ── 8. 净金币监测（§5.1，防通胀告警）────────────────────
  // 每个活跃玩家一个实例；record(day, earned, spent)；checkInflation()
  function NetGoldMonitor(opts) {
    opts = opts || {};
    const threshold = opts.threshold == null ? 5000 : opts.threshold; // 人均日净增阈值
    const windowDays = opts.windowDays == null ? 7 : opts.windowDays;
    const history = []; // [{day, net}]

    function record(day, earned, spent) {
      if (!Number.isFinite(earned) || !Number.isFinite(spent)) throw new TypeError('earned/spent 须为有限数字');
      if (earned < 0 || spent < 0) throw new RangeError('earned/spent 须 >= 0');
      const net = earned - spent;
      history.push({ day, net });
      return net;
    }
    function checkInflation() {
      if (history.length < windowDays) return { triggered: false, reason: '样本不足', days: history.length };
      const tail = history.slice(-windowDays);
      const allOver = tail.every(h => h.net > threshold);
      return {
        triggered: allOver,
        reason: allOver ? `连续 ${windowDays} 日净增 > ${threshold}` : '正常',
        netAvg: round(tail.reduce((s, h) => s + h.net, 0) / windowDays),
        days: tail.length,
      };
    }
    return { record, checkInflation, _history: history };
  }

  // ── 9. 代币周清零（§1，限时活动币防通胀）────────────
  // ISO 周键：周一为一周起点，跨年安全，如 "2026-W28"
  function isoWeekKey(ts) {
    if (!Number.isFinite(ts)) throw new TypeError('ts 须为有限时间戳');
    const d = new Date(ts);
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (date.getUTCDay() + 6) % 7; // 周一=0，周日=6
    date.setUTCDate(date.getUTCDate() - dayNum + 3); // 移到本周周四
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const fDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - fDayNum + 3);
    const week = 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000));
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  // 返回 'first'(无记录基准) | 'same'(同周不处理) | 'reset'(跨周需清零)
  function tokenResetState(lastResetKey, now) {
    if (lastResetKey == null || lastResetKey === '') return 'first';
    const cur = isoWeekKey(now);
    if (lastResetKey === cur) return 'same';
    return 'reset';
  }

  // ── 10. 耐久与金币沉淀（§6，防通胀 sink）────────────────
  // 设计意图：金币若只有来源没有消耗侧，会废纸化、破坏「赚→花→更强」正循环。
  // 耐久系统让装备随战斗磨损 → 必须花金币修理（主 sink）；复活/传送提供额外 recurring sink。
  // 所有数值为 [PLACEHOLDER]，需经 playtest 调参（单机环境 SERVER_AVG_LEVEL 固定，通胀压力低，先取保守值）。
  const DURABILITY_MAX = 100;     // 装备满耐久
  const DURABILITY_LOW = 30;      // 低于此触发「磨损」惩罚（贡献降至 0.6）
  const REPAIR_PER_POINT = 2;     // 每点耐久修复费（金）[PLACEHOLDER]
  const DURA_LOSS_TAKEN = 1;      // 每次受击，全身装备磨损量 [PLACEHOLDER]
  const DURA_LOSS_DEAL = 0.5;     // 每次攻击，武器磨损量 [PLACEHOLDER]
  const TELE_BASE = 25;           // 传送基础费（金）[PLACEHOLDER]
  const TELE_PER_MAP = 15;        // 传送费随目标地图递增 [PLACEHOLDER]
  const REVIVE_BASE = 80;         // 复活基础费 [PLACEHOLDER]
  const REVIVE_PER_LV = 20;       // 复活费随等级递增 [PLACEHOLDER]

  // 耐久 → 属性贡献系数：损坏(0)→该件失效；磨损(<LOW)→六成；正常→满额
  // 旧装备若未定义 dura（历史存档），视为满贡献（兼容）。
  function duraScale(dura) {
    if (dura == null) return 1;
    if (dura <= 0) return 0;
    if (dura < DURABILITY_LOW) return 0.6;
    return 1;
  }

  // 修理费：缺失耐久点 × 单价 × (1 - 折扣)。discount∈[0,1]（如修理折扣天赋）。
  function repairCost(eq, opts) {
    opts = opts || {};
    const max = (eq && eq.duraMax != null) ? eq.duraMax : DURABILITY_MAX;
    const cur = (eq && eq.dura != null) ? eq.dura : max;
    const per = (opts.perPoint != null) ? opts.perPoint : REPAIR_PER_POINT;
    const discount = (opts.discount != null) ? clamp(opts.discount, 0, 1) : 0;
    return Math.max(0, Math.round((max - cur) * per * (1 - discount)));
  }

  // 传送费：base + perMap × 目标地图索引（向后/向前均按目标索引计费）
  function teleportCost(fromIdx, toIdx, opts) {
    opts = opts || {};
    const base = (opts.base != null) ? opts.base : TELE_BASE;
    const perMap = (opts.perMap != null) ? opts.perMap : TELE_PER_MAP;
    const to = (toIdx == null) ? (fromIdx == null ? 0 : fromIdx + 1) : toIdx;
    return Math.max(0, Math.round(base + perMap * to));
  }

  // 复活费：随玩家等级递增
  function reviveCost(level, opts) {
    opts = opts || {};
    const base = (opts.base != null) ? opts.base : REVIVE_BASE;
    const perLv = (opts.perLv != null) ? opts.perLv : REVIVE_PER_LV;
    const lv = (level == null || level < 1) ? 1 : level;
    return Math.max(0, Math.round(base + perLv * lv));
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  return {
    C, LUCKY_WEIGHTS, TIER_ORDER, DIFFICULTY,
    clamp, levelFactor, mapFactor, monsterGold,
    questGold, enhCost, enhCumulative, reforgeCost,
    priceMult, ahFee, luckyBoxRoll, NetGoldMonitor,
    isoWeekKey, tokenResetState,
    DURABILITY_MAX, DURABILITY_LOW, REPAIR_PER_POINT,
    DURA_LOSS_TAKEN, DURA_LOSS_DEAL, TELE_BASE, TELE_PER_MAP,
    REVIVE_BASE, REVIVE_PER_LV,
    duraScale, repairCost, teleportCost, reviveCost,
  };
});
