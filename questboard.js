/*
 * questboard.js — 任务与奖励机制系统模块
 * 设计依据：《任务与奖励机制系统设计.md》(GDD v1) §2~§10
 * 双模式：浏览器 <script> 挂载 window.QuestBoard；Node 下 module.exports（供测试）。
 * 依赖：Economy（economy.js）—— questGold / luckyBoxRoll / 常量 / 幸运箱 pity。
 *        若 Economy 不可用，自动回退到本地同公式实现，保证模块自洽可测。
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.QuestBoard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // 复用 Economy（优先 window，其次 require）
  const Economy = (typeof module !== 'undefined' && module.exports)
    ? (() => { try { return require('./economy.js'); } catch (e) { return null; } })()
    : (root && root.Economy ? root.Economy : null);

  // ── 常量（对齐任务文档 §9 数值范围总表）────────────────────────
  const C = {
    BASE_EXP:   [30, 60, 120, 240, 480],   // D1..D5 @L1
    BASE_GOLD:  [40, 80, 160, 320, 640],   // 仅 Economy 缺失时回退用
    BASE_TOKEN: [5, 10, 20, 40, 80],       // 不随等级膨胀
    DIFF:       [0.6, 1.0, 1.6, 2.6, 4.0], // D1..D5 乘子
    EXP_GROWTH: 1.32,
    GOLD_GROWTH: 1.18,
    TEAM_BONUS: 1.15,
    FIRST_TEAM_BONUS: 1.05,
    CRUSH_DIFF: 5,        // 等级差 >= 5 触发碾压衰减
    CRUSH_EXP: 0.4,
    CRUSH_GOLD: 0.6,
    QB_MIN: 0.5,
    QB_MAX: 3.0,
  };
  const DIFFICULTY = ['D1', 'D2', 'D3', 'D4', 'D5'];
  const TIER_ORDER = (Economy && Economy.TIER_ORDER) || ['common', 'good', 'rare', 'epic', 'legendary', 'mythic'];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = Math.round;

  function diffIndex(difficulty) {
    const idx = typeof difficulty === 'number' ? difficulty : DIFFICULTY.indexOf(difficulty);
    if (idx < 0 || idx > 4) throw new RangeError('difficulty 须为 D1..D5（0..4 或字符串）');
    return idx;
  }

  // ── 1. 表现加成 qualityBonus（§5.4）────────────────────────
  function computeQualityBonus(s) {
    s = s || {};
    const q = 1.0
      + 0.3 * clamp((s.comboMax || 0) / 30, 0, 1)
      + 0.3 * clamp((s.reactionCount || 0) / 5, 0, 1)
      + 0.4 * clamp((s.breakExecute || 0) / 3, 0, 1)
      + 0.5 * clamp(s.weakHitRate || 0, 0, 1)
      + (s.teamQuest ? 0.2 : 0);
    return clamp(q, C.QB_MIN, C.QB_MAX);
  }

  // ── 2. 任务经验（§4.2，挂 BAL 升级曲线）──────────────────
  function questExp(base, difficulty, playerLevel, qualityBonus, recLevel) {
    const idx = diffIndex(difficulty);
    if (!Number.isFinite(playerLevel) || playerLevel < 1) throw new RangeError('playerLevel 须 >= 1');
    const qb = qualityBonus == null ? 1.0 : clamp(qualityBonus, C.QB_MIN, C.QB_MAX);
    let exp = (base == null ? C.BASE_EXP[idx] : base) * Math.pow(C.EXP_GROWTH, playerLevel - 1) * qb;
    if (recLevel != null && playerLevel - recLevel >= C.CRUSH_DIFF) exp *= C.CRUSH_EXP; // 碾压衰减
    return round(exp);
  }

  // ── 3. 任务金币（§4.2，复用 Economy.questGold + 碾压）──────
  function questGold(difficulty, playerLevel, recLevel) {
    const idx = diffIndex(difficulty);
    if (!Number.isFinite(playerLevel) || playerLevel < 1) throw new RangeError('playerLevel 须 >= 1');
    let g;
    if (Economy) {
      g = Economy.questGold(null, difficulty, playerLevel); // 已含 1.18^(L-1)
    } else {
      g = round(C.BASE_GOLD[idx] * Math.pow(C.GOLD_GROWTH, playerLevel - 1));
    }
    if (recLevel != null && playerLevel - recLevel >= C.CRUSH_DIFF) g = round(g * C.CRUSH_GOLD);
    return g;
  }

  // ── 4. 任务代币（§4.2，不随等级膨胀，碾压不影响）─────────
  function questToken(difficulty, base) {
    const idx = diffIndex(difficulty);
    return base == null ? C.BASE_TOKEN[idx] : base;
  }

  // ── 5. 组队加成（§7.2）──────────────────────────────────
  function teamMultiplier(opts) {
    opts = opts || {};
    let m = 1.0;
    if (opts.isTeam) m *= C.TEAM_BONUS;
    if (opts.firstTimeTogether) m *= C.FIRST_TEAM_BONUS;
    return m; // 1.15×1.05=1.2075，落在文档 [1.0,1.3] 区间
  }

  // ── 6. 综合奖励计算（§4，含 crush + 组队）────────────────
  function computeRewards(opts) {
    opts = opts || {};
    if (opts.playerLevel != null && (!Number.isFinite(opts.playerLevel) || opts.playerLevel < 1))
      throw new RangeError('playerLevel 须 >= 1');
    const qb = computeQualityBonus(opts.skillStats || {});
    const tb = opts.teamBonus == null ? 1.0 : opts.teamBonus;
    const exp = questExp(opts.baseExp, opts.difficulty, opts.playerLevel, qb, opts.recLevel);
    const gold = questGold(opts.difficulty, opts.playerLevel, opts.recLevel);
    const token = questToken(opts.difficulty, opts.baseToken);
    const crush = (opts.recLevel != null) && (opts.playerLevel - opts.recLevel >= C.CRUSH_DIFF);
    return {
      exp: round(exp * tb),
      gold: round(gold * tb),
      token: round(token * tb),
      crush,
      qualityBonus: qb,
      teamBonus: tb,
    };
  }

  // ── 7. 幸运箱（§5.1，pity 保底，复用 Economy）────────────
  function rollLuckyBox(state) {
    if (!Economy) throw new Error('Economy 模块缺失，幸运箱不可用');
    return Economy.luckyBoxRoll(state);
  }

  // ── 8. 依赖 / 可用性判定（§3.1）─────────────────────────
  function isAvailable(task, ctx) {
    ctx = ctx || {};
    const completed = ctx.completed instanceof Set ? ctx.completed : new Set(ctx.completed || []);
    if (task.minLevel && (ctx.playerLevel || 0) < task.minLevel) return false;
    if (task.mapLock != null && (ctx.mapIndex != null) && ctx.mapIndex < task.mapLock) return false;
    if (task.prereq) {
      for (const p of task.prereq) if (!completed.has(p)) return false;
    }
    return true;
  }

  // ── 9. 池选取（加权随机，可注入 rng 便于测试）────────────
  function pickFromPool(pool, rng) {
    rng = rng || Math.random;
    if (!pool || !pool.length) return null;
    const total = pool.reduce((s, t) => s + (t.weight == null ? 1 : t.weight), 0);
    let r = rng() * total;
    for (const t of pool) { r -= (t.weight == null ? 1 : t.weight); if (r <= 0) return t; }
    return pool[pool.length - 1];
  }

  // ── 10. 生成每日 / 周常任务（§3.2，可选池 + 去重 + 门槛）──
  // 先过滤可用候选，再做「不放回加权抽样」，避免恒定 rng 反复抽到被排除项。
  function generate(opts) {
    const pool = opts.pool || [];
    const count = opts.count == null ? 3 : opts.count;
    const rng = opts.rng || Math.random;
    const completed = opts.completed instanceof Set ? opts.completed : new Set(opts.completed || []);
    const exclude = new Set(opts.exclude || []);

    const candidates = pool.filter((t) =>
      !exclude.has(t.id) &&
      !(t.minLevel && (opts.playerLevel || 0) < t.minLevel) &&
      !(t.mapLock != null && opts.mapIndex != null && opts.mapIndex < t.mapLock) &&
      !(t.prereq && !t.prereq.every((p) => completed.has(p)))
    );

    const taken = [];
    while (taken.length < count && candidates.length) {
      const total = candidates.reduce((s, t) => s + (t.weight == null ? 1 : t.weight), 0);
      let r = rng() * total;
      let idx = 0;
      for (let i = 0; i < candidates.length; i++) {
        r -= (candidates[i].weight == null ? 1 : candidates[i].weight);
        if (r <= 0) { idx = i; break; }
      }
      taken.push(candidates[idx]);
      candidates.splice(idx, 1);
    }
    return taken;
  }

  // ── 11. 周常任务池（§3.2，每周一重置，大代币奖励）────────
  // 周常是「活动代币」的主来源（代币每周清零、周常补回，形成周循环）。
  // objective.target 支持 'any'（任意击杀）、'elite'、'boss'、具体怪物 id。
  const WEEKLY_POOL = [
    { id: 'w_hunt',  difficulty: 'D3', weight: 100, minLevel: 1,
      objectives: [{ type: 'kill', target: 'any', amount: 80, desc: '本周击杀 80 只怪物' }],
      rewards: { exp: 600, gold: 1200, token: 60, stone: 15, material: 5 } },
    { id: 'w_wolf',  difficulty: 'D3', weight: 80, minLevel: 3,
      objectives: [{ type: 'kill', target: 'wolf', amount: 50, desc: '狩猎 50 只野狼' }],
      rewards: { exp: 600, gold: 1200, token: 60, stone: 10, material: 3 } },
    { id: 'w_skel',  difficulty: 'D3', weight: 75, minLevel: 5,
      objectives: [{ type: 'kill', target: 'skeleton', amount: 40, desc: '肃清 40 具骷髅' }],
      rewards: { exp: 600, gold: 1200, token: 60, stone: 12, material: 4 } },
    { id: 'w_elite', difficulty: 'D4', weight: 70, minLevel: 6,
      objectives: [{ type: 'kill', target: 'elite', amount: 10, desc: '讨伐 10 只精英' }],
      rewards: { exp: 1200, gold: 2400, token: 120, stone: 30, material: 10 } },
    { id: 'w_boss',  difficulty: 'D5', weight: 40, minLevel: 10,
      objectives: [{ type: 'kill', target: 'boss', amount: 3, desc: '击败 3 个首领' }],
      rewards: { exp: 2400, gold: 4800, token: 240, stone: 60, material: 20 } },
  ];

  // ── 12. 成就系统（§3，永久解锁，基于累计统计）──────────
  // metric 对应 makeStats() 的累计键；threshold 为达成阈值；reward 发放 achPoints（成就点）+ 附带金币/代币/石料。
  // stone: 强化石（用于装备强化材料消耗）；material: 锻造材料（用于洗练/重铸替代金币）
  const ACHIEVEMENTS = [
    { id: 'a_kill_100',  name: '初试身手', desc: '累计击杀 100 只怪物',      metric: 'kills',      threshold: 100,  reward: { achPoints: 10, gold: 300, bindGold: 50, stone: 5 } },
    { id: 'a_kill_1000', name: '百战之士', desc: '累计击杀 1000 只怪物',     metric: 'kills',      threshold: 1000, reward: { achPoints: 30, gold: 1500, bindGold: 200, jade: 5, stone: 30, material: 10 } },
    { id: 'a_boss_1',    name: '屠龙者',   desc: '击败 1 个首领',            metric: 'bossKills',  threshold: 1,    reward: { achPoints: 20, gold: 800, token: 20, bindGold: 50, stone: 8 } },
    { id: 'a_boss_10',   name: '首领克星', desc: '击败 10 个首领',           metric: 'bossKills',  threshold: 10,   reward: { achPoints: 50, gold: 3000, token: 80, bindGold: 300, jade: 8, stone: 50, material: 20 } },
    { id: 'a_elite_50',  name: '精英猎手', desc: '讨伐 50 只精英',           metric: 'eliteKills', threshold: 50,   reward: { achPoints: 40, gold: 2000, token: 40, bindGold: 150, jade: 3, stone: 25, material: 8 } },
    { id: 'a_lv_10',     name: '崭露头角', desc: '达到等级 10',              metric: 'maxLevel',   threshold: 10,   reward: { achPoints: 10, gold: 500, bindGold: 50, stone: 10 } },
    { id: 'a_lv_30',     name: '一方豪杰', desc: '达到等级 30',              metric: 'maxLevel',   threshold: 30,   reward: { achPoints: 30, gold: 2000, token: 50, bindGold: 200, jade: 5, stone: 40, material: 15 } },
    { id: 'a_enh_15',    name: '千锤百炼', desc: '将任意装备强化至 +15',      metric: 'maxEnhance', threshold: 15,   reward: { achPoints: 40, gold: 2500, token: 60, bindGold: 200, jade: 5, stone: 100, material: 30 } },
    { id: 'a_set_2',     name: '初成体系', desc: '集齐任意套装 2 件',        metric: 'setMax2',    threshold: 1,    reward: { achPoints: 20, gold: 1000, token: 20, bindGold: 80, material: 5 } },
    { id: 'a_set_4',     name: '套装大成', desc: '集齐任意套装 4 件',        metric: 'setMax4',    threshold: 1,    reward: { achPoints: 60, gold: 3500, token: 100, bindGold: 300, jade: 10, stone: 60, material: 25 } },
    { id: 'a_react_50',  name: '元素亲和', desc: '触发 50 次元素反应',        metric: 'reactions',  threshold: 50,   reward: { achPoints: 30, gold: 1500, token: 30, bindGold: 100, jade: 2, stone: 15 } },
    { id: 'a_break_30',  name: '破防大师', desc: '造成 30 次破防',            metric: 'breaks',     threshold: 30,   reward: { achPoints: 30, gold: 1500, token: 30, bindGold: 100, jade: 2, material: 10 } },
    { id: 'a_finish_10', name: '终结者',   desc: '释放 10 次终结技',          metric: 'finishers',  threshold: 10,   reward: { achPoints: 30, gold: 1500, token: 30, bindGold: 100, jade: 2, stone: 20 } },
  ];

  // 累计统计对象（成就评估的输入），所有字段非负整数
  function makeStats() {
    return {
      kills: 0, eliteKills: 0, bossKills: 0,
      maxLevel: 1, maxEnhance: 0,
      setMax2: 0, setMax4: 0,
      reactions: 0, breaks: 0, finishers: 0,
    };
  }

  // 周键：优先复用 Economy.isoWeekKey（ISO 周一为起点，跨年安全）；否则本地回退实现
  function weekKey(ts) {
    if (Economy && Economy.isoWeekKey) return Economy.isoWeekKey(ts);
    const d = new Date(ts == null ? Date.now() : ts);
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return d.getFullYear() + '-W' + String(week).padStart(2, '0');
  }

  // 评估成就：依据 stats 阈值返回新解锁列表，并就地把已解锁写入 unlocked 集合（幂等，调用两次不会重复返回）
  function evaluateAchievements(stats, unlocked) {
    if (!stats || typeof stats !== 'object') throw new TypeError('stats 必填（累计统计对象）');
    const set = unlocked instanceof Set ? unlocked : new Set(unlocked || []);
    const newly = [];
    for (const a of ACHIEVEMENTS) {
      if (set.has(a.id)) continue;
      const v = stats[a.metric] || 0;
      if (v >= a.threshold) { newly.push(a); set.add(a.id); }
    }
    return { newly, unlocked: set };
  }

  // 从奖励对象中提取所有资源类型及数量（含 stone/material）
  // 返回：{ gold, token, stone, material, bindGold, jade, achPoints, exp }
  function extractResourceValues(reward) {
    if (!reward) return {};
    const keys = ['gold', 'token', 'stone', 'material', 'bindGold', 'jade', 'achPoints', 'exp'];
    const out = {};
    for (const k of keys) {
      if (Number.isFinite(reward[k]) && reward[k] > 0) out[k] = reward[k];
    }
    return out;
  }

  // 奖励对象中是否含 stone/material
  function hasCraftingRewards(reward) {
    return !!reward && ((Number.isFinite(reward.stone) && reward.stone > 0) || (Number.isFinite(reward.material) && reward.material > 0));
  }

  return {
    C, DIFFICULTY, TIER_ORDER, clamp,
    computeQualityBonus, questExp, questGold, questToken,
    teamMultiplier, computeRewards, rollLuckyBox,
    isAvailable, pickFromPool, generate,
    WEEKLY_POOL, ACHIEVEMENTS, makeStats, weekKey, evaluateAchievements,
    extractResourceValues, hasCraftingRewards,
  };
});
