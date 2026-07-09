/*
 * combat.js —— 战斗深化系统（纯逻辑 / 双模式）
 * 对应设计文档：《战斗系统深化设计.md》
 * 风格：所有时间相关函数接收显式 now(ms)，不依赖全局时钟，便于单测。
 *       Fighter 为普通对象（plain object），不持有游戏引用，集成时由游戏把 .cb 挂到实体上。
 *
 * 设计信条：深度 = 更多有意义的抉择 + 抉择有清晰反馈。
 */
(function () {
  'use strict';

  // ── 常量（[PLACEHOLDER] 表示需实测调参）──
  const COMBO_WINDOW = 2500;     // ms，连击衰减窗口
  const BOSS_COMBO_ATTEN = 0.4; // Boss 连击增益衰减
  const FINISHER_K = 0.15;      // [PLACEHOLDER] 终结技倍率系数
  const FINISHER_CAP = 6.0;     // 终结技倍率上限
  const REACTION_WINDOW = 3000; // ms，元素附着窗口
  const EXEC_PCT_BOSS = 0.08;   // [PLACEHOLDER] 处决对 Boss 造成最大生命 %
  const EXEC_HP_THRESHOLD = 0.15; // 低血线处决阈值
  const VULN_MULT = 2.0;        // 破防易伤增伤

  // 连击阶梯（累积取最高档）
  const COMBO_TIERS = [
    { min: 5,  dmg: 0.08, crit: 0.00, note: '起手奖励' },
    { min: 10, dmg: 0.15, crit: 0.00, note: '回少量资源' },
    { min: 20, dmg: 0.25, crit: 0.10, note: '高风险高回报' },
    { min: 30, dmg: 0.35, crit: 0.00, note: '解锁终结技' },
  ];

  // 元素反应表（key 由 reactKey 生成，按 phys<fire<ice<spirit 排序）
  const REACTIONS = {
    'fire|ice':      { name: 'melt',        label: '融化!',   dmgMult: 0.60, color: '#ff8a3c' },
    'fire|spirit':   { name: 'overload',    label: '过载!',   dmgMult: 0.40, knockback: true, aoe: true, color: '#ffd24a' },
    'phys|fire':     { name: 'shatter',     label: '裂甲!',   dmgMult: 0.25, armorBreak: true, burn: true, color: '#ffaf4a' },
    'phys|ice':      { name: 'frostfield',  label: '冻土!',   dmgMult: 0.20, slow: 0.5, slowDur: 4000, dot: true, color: '#9fe6ff' },
    'ice|spirit':    { name: 'superconduct',label: '超导!',   dmgMult: 0.20, defDown: 0.40, defDownDur: 6000, color: '#b9a0ff' },
    'spirit|spirit': { name: 'charge',      label: '蓄能!',   dmgMult: 0.00, chargeDur: 3000, color: '#cef' },
  };

  const ELEMENTS = ['phys', 'fire', 'ice', 'spirit'];
  const _ORDER = { phys: 0, fire: 1, ice: 2, spirit: 3 };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function reactKey(a, b) {
    const sa = _ORDER[a] <= _ORDER[b] ? a : b;
    const sb = _ORDER[a] <= _ORDER[b] ? b : a;
    return sa + '|' + sb;
  }

  // ── Fighter 工厂 ──
  function makeFighter(opts) {
    opts = opts || {};
    const maxHp = opts.maxHp || 100;
    return {
      isBoss: !!opts.isBoss,
      hp: opts.hp != null ? opts.hp : maxHp,
      maxHp: maxHp,
      resist: Object.assign({ phys: 0, fire: 0, ice: 0, spirit: 0 }, opts.resist || {}),
      maxPoise: opts.maxPoise || (opts.isBoss ? 100 : 40),
      poise: 0,
      breakUntil: 0,
      vulnerableUntil: 0,
      aura: null,
      auraUntil: 0,
      // 连击（玩家持有）
      combo: 0,
      lastHit: -1e9,
      comboWindow: opts.comboWindow || COMBO_WINDOW,
      // 状态
      defDownAmt: 0,
      defDownUntil: 0,
      slowAmt: 0,
      slowUntil: 0,
      stunUntil: 0,
      chargeUntil: 0,
      // 供游戏层施加的 DoT 标记（本模块只记录意图，伤害由游戏结算）
      pendingBurn: 0,
      pendingDot: 0,
      // 状态连锁 dot 层（_dots[type] = [{expires}]）
      _dots: null,
    };
  }

  // ── 连招 ──
  // 注册一次命中：超过窗口先清零再 +1
  function registerCombo(f, now) {
    if (!f) return 0;
    if (f.lastHit > 0 && now - f.lastHit > f.comboWindow) f.combo = 0;
    f.combo += 1;
    f.lastHit = now;
    return f.combo;
  }
  // 每帧调用：窗口过期则清零，返回是否刚清零
  function expireCombo(f, now) {
    if (!f) return false;
    if (f.combo > 0 && now - f.lastHit > f.comboWindow) { f.combo = 0; return true; }
    return false;
  }
  function comboDamageBonus(count, isBoss) {
    let dmg = 0, crit = 0;
    for (let i = 0; i < COMBO_TIERS.length; i++) {
      if (count >= COMBO_TIERS[i].min) { dmg = COMBO_TIERS[i].dmg; crit = Math.max(crit, COMBO_TIERS[i].crit); }
    }
    if (isBoss) dmg *= BOSS_COMBO_ATTEN;
    return { dmgMult: 1 + dmg, critBonus: crit };
  }
  function comboCritBonus(count) {
    let crit = 0;
    for (let i = 0; i < COMBO_TIERS.length; i++) if (count >= COMBO_TIERS[i].min) crit = Math.max(crit, COMBO_TIERS[i].crit);
    return crit;
  }
  function finisherAvailable(count) { return count >= 30; }
  function finisherMultiplier(count) {
    return clamp(1 + count * FINISHER_K, 1, FINISHER_CAP);
  }

  // ── 弱点 / 抗性 ──
  // resist 负值=弱点(>1)，正值=抗性(<1)；钳到 [0.3, 3.0]
  function weaknessMultiplier(resist, dmgType) {
    const r = (resist && typeof resist[dmgType] === 'number') ? resist[dmgType] : 0;
    return clamp(1 - r, 0.3, 3.0);
  }

  // ── 元素反应 ──
  // 计算反应（不写状态），会按双方抗性缩放（反单一最优）
  function computeReaction(aura, incoming, resist) {
    const key = reactKey(aura, incoming);
    const base = REACTIONS[key];
    if (!base) return null;
    const r = resist || {};
    const scale = clamp(1 - 0.5 * (Math.max(0, r[aura] || 0) + Math.max(0, r[incoming] || 0)), 0.3, 1.0);
    return Object.assign({}, base, { dmgMult: base.dmgMult * scale });
  }
  // 处理一次带元素的命中：若有异元素附着→触发反应并施加状态，然后刷新为新附着
  function processElementHit(f, incoming, now, dur, resist) {
    if (!ELEMENTS.includes(incoming)) throw new RangeError('invalid element: ' + incoming);
    dur = dur || REACTION_WINDOW;
    if (f.aura && f.auraUntil > now && f.aura !== incoming) {
      const reaction = computeReaction(f.aura, incoming, resist);
      const prev = f.aura;
      f.aura = null; f.auraUntil = 0;
      if (reaction) {
        if (reaction.defDown) { f.defDownAmt = reaction.defDown; f.defDownUntil = now + (reaction.defDownDur || 6000); }
        if (reaction.slow) { f.slowAmt = reaction.slow; f.slowUntil = now + (reaction.slowDur || 4000); }
        if (reaction.armorBreak) { f.defDownAmt = Math.max(f.defDownAmt, 0.3); f.defDownUntil = now + 5000; }
        if (reaction.burn) f.pendingBurn = 1;
        if (reaction.dot) f.pendingDot = 1;
      }
      f.aura = incoming; f.auraUntil = now + dur;
      return { reaction: reaction, prevAura: prev };
    }
    f.aura = incoming; f.auraUntil = now + dur;
    return { reaction: null };
  }

  // ── 韧性 / 破防 ──
  function addPoise(f, amount, isHeavy) {
    f.poise = Math.min(f.maxPoise, f.poise + amount * (isHeavy ? 2 : 1));
  }
  function checkBreak(f, now, stunDur) {
    stunDur = stunDur || 2000;
    if (f.poise >= f.maxPoise) {
      f.poise = 0;
      f.breakUntil = now + stunDur;
      f.vulnerableUntil = now + stunDur;
      return true;
    }
    return false;
  }
  function isBroken(f, now) { return now < f.breakUntil; }
  function vulnerableMult(f, now) { return isBroken(f, now) ? VULN_MULT : 1.0; }

  // ── 打断（Interrupt）：Boss 读条时受击双倍失衡，率先破防 = 打断 ──
  // 返回 { interrupted, bonusDmg }
  // casting: 是否在读条中；poise: 当前失衡值；maxPoise: 失衡上限
  // hitPoise: 这次攻击造成的失衡量（取整）；ifBroken: checkBreak 结果
  function interruptResult(poise, maxPoise, hitPoise, isCasting) {
    if (!isCasting) return { interrupted: false, bonusPct: 0 };
    const nextPoise = Math.min(maxPoise, poise + hitPoise * 2); // 读条期间双倍失衡
    const broken = nextPoise >= maxPoise;
    return {
      interrupted: broken,
      bonusPct: broken ? 0.15 : 0, // 打断成功→后续伤害+15%
      nextPoise,
    };
  }

  // ── 状态连锁 dot→引爆（§5 状态连锁）────────────────────
  // 设计意图：让"堆叠dot→引爆爆发"成为战斗中的次要战术决策，
  // 给持续伤害流玩家一个 clear payoff moment，而非纯线性伤害。
  const DOT_TYPES = ['burn', 'poison', 'bleed', 'frostbite'];
  const DOT_EXPLOSION_THRESHOLD = 5;    // 叠满 5 层可引爆
  const DOT_EXPLOSION_BASE_MULT = 0.30; // 引爆伤害 = 层数 × 基础倍率 × 目标最大生命
  const DOT_EXPLOSION_SCALE = 0.08;     // 每层额外伤害倍率
  const DOT_STACK_DURATION = 6000;      // ms，每层独立过期时间
  const DOT_TICK_INTERVAL = 1000;       // ms，每 tick 间隔
  const DOT_TICK_DMG = 0.02;            // 每 tick 伤害 = 层数 × 目标最大生命 × 此值

  // 获取 dot 层数（安全访问）
  function getDotStacks(f, type) {
    if (!f || !f._dots) return 0;
    const d = f._dots[type];
    if (!d) return 0;
    // 清理过期层
    const now = Date.now();
    const alive = d.filter(s => s.expires > now);
    f._dots[type] = alive;
    return alive.length;
  }

  // 应用一层 dot（返回当前总层数）
  function applyDot(f, type, now) {
    if (!f || !DOT_TYPES.includes(type)) return 0;
    if (!f._dots) f._dots = {};
    if (!f._dots[type]) f._dots[type] = [];
    f._dots[type].push({ expires: now + DOT_STACK_DURATION });
    // 清理过期
    const alive = f._dots[type].filter(s => s.expires > now);
    f._dots[type] = alive;
    return alive.length;
  }

  // 应用多层 dot（快捷批量）
  function applyDotStacks(f, type, stacks, now) {
    let total = 0;
    for (let i = 0; i < stacks; i++) total = applyDot(f, type, now);
    return total;
  }

  // 计算 dot tick 伤害（按目标最大生命百分比，调用者每秒调一次）
  function tickDotDamage(f, type, maxHp) {
    const stacks = getDotStacks(f, type);
    if (stacks === 0) return 0;
    return Math.max(1, Math.round(maxHp * DOT_TICK_DMG * stacks));
  }

  // 引爆：若 dot 层数 ≥ 阈值，消耗全部层数并返回爆炸伤害
  // 返回 { exploded: bool, dmg: number, stacks: number }
  function triggerDotExplosion(f, type, maxHp) {
    const stacks = getDotStacks(f, type);
    if (stacks < DOT_EXPLOSION_THRESHOLD) return { exploded: false, dmg: 0, stacks };
    // 消耗所有层
    if (f._dots) f._dots[type] = [];
    const mult = DOT_EXPLOSION_BASE_MULT + stacks * DOT_EXPLOSION_SCALE;
    const dmg = Math.max(1, Math.round(maxHp * mult));
    return { exploded: true, dmg, stacks };
  }

  // 全类型引爆（AOE 场景）
  function triggerAllExplosions(f, maxHp) {
    const results = {};
    for (const t of DOT_TYPES) {
      results[t] = triggerDotExplosion(f, t, maxHp);
    }
    const totalDmg = Object.values(results).reduce((s, r) => s + (r.exploded ? r.dmg : 0), 0);
    return { results, totalDmg };
  }

  // ── 资源分化（§6 怒气/法力/充能）─────────────────────────
  // 设计意图：让三职业有截然不同的资源循环节奏
  // 战士=怒气(战斗获取/脱战衰减) 法师=法力(自然恢复) 道士=充能(时间积累)
  const RESOURCE_DEFS = {
    warrior: { type: 'rage',     max: 100, decayPerSec: 5,  hitGain: 4,   dmgTakenGain: 3,  passiveRegen: 0 },
    mage:    { type: 'mana',     max: 150, decayPerSec: 0,  hitGain: 1,   dmgTakenGain: 0,  passiveRegen: 8 },
    taoist:  { type: 'focus',    max: 80,  decayPerSec: 2,  hitGain: 2,   dmgTakenGain: 1,  passiveRegen: 4 },
  };

  function makeResource(prof) {
    const def = RESOURCE_DEFS[prof] || RESOURCE_DEFS.mage;
    return {
      type: def.type,
      current: def.max,
      max: def.max,
      decayPerSec: def.decayPerSec,
      hitGain: def.hitGain,
      dmgTakenGain: def.dmgTakenGain,
      passiveRegen: def.passiveRegen,
    };
  }

  // 获取当前资源百分比 (0~1)
  function resourcePct(res) {
    if (!res || !res.max) return 1;
    return Math.min(1, Math.max(0, res.current / res.max));
  }

  // 消耗资源：返回是否够扣
  function spendResource(res, cost) {
    if (!res || !cost) return true;
    if (res.current < cost) return false;
    res.current -= cost;
    return true;
  }

  // 每帧(tick)更新资源
  // 返回修改后的 resource 对象（或新创建）
  function tickResource(res, prof, inCombat, dtSec) {
    if (!res) res = makeResource(prof);
    const def = RESOURCE_DEFS[prof] || RESOURCE_DEFS.mage;
    if (!inCombat) {
      if (def.type === 'rage') {
        res.current = Math.max(0, res.current - def.decayPerSec * dtSec);
      } else {
        res.current = Math.min(res.max, res.current + def.passiveRegen * dtSec);
      }
    } else {
      if (def.type !== 'rage') {
        res.current = Math.min(res.max, res.current + def.passiveRegen * dtSec);
      }
    }
    return res;
  }

  // 攻击命中时返还资源
  function onHitResourceGain(res, prof) {
    if (!res) return res;
    const def = RESOURCE_DEFS[prof] || RESOURCE_DEFS.mage;
    res.current = Math.min(res.max, res.current + def.hitGain);
    return res;
  }

  // 受击时返还资源（仅战士怒气受益）
  function onHurtResourceGain(res, prof) {
    if (!res) return res;
    const def = RESOURCE_DEFS[prof] || RESOURCE_DEFS.mage;
    res.current = Math.min(res.max, res.current + def.dmgTakenGain);
    return res;
  }

  // ── 处决 ──
  // opts: { isHeavy, dmgType, execPctBoss, execHpThreshold }
  function executeResult(f, now, opts) {
    opts = opts || {};
    if (!opts.isHeavy) return null;
    const broken = isBroken(f, now);
    const lowHp = (f.hp / f.maxHp) <= (opts.execHpThreshold || EXEC_HP_THRESHOLD);
    if (broken || lowHp) {
      if (f.isBoss) return { executed: true, boss: true, dmg: Math.max(1, Math.round(f.maxHp * (opts.execPctBoss || EXEC_PCT_BOSS))) };
      return { executed: true, instakill: true, dmg: f.hp };
    }
    return null;
  }

  // ── 综合伤害结算（供游戏调用）──
  // baseDmg 已含基础攻击/技能倍率/暴击；本函数叠加 连击/弱点/易伤/降防
  function resolveDamage(baseDmg, ctx) {
    ctx = ctx || {};
    const now = ctx.now || 0;
    const f = ctx.fighter;
    let dmg = baseDmg;
    const cb = comboDamageBonus(ctx.combo || 0, !!ctx.isBoss);
    dmg *= cb.dmgMult;
    const wk = weaknessMultiplier(ctx.resist, ctx.dmgType || 'phys');
    dmg *= wk;
    if (f && isBroken(f, now)) dmg *= VULN_MULT;
    if (f && now < f.defDownUntil) dmg *= (1 - f.defDownAmt);
    return { dmg: Math.max(1, Math.round(dmg)), weak: wk > 1.001, critBonus: cb.critBonus };
  }

  const Combat = {
    COMBO_WINDOW, BOSS_COMBO_ATTEN, FINISHER_K, FINISHER_CAP, REACTION_WINDOW,
    EXEC_PCT_BOSS, EXEC_HP_THRESHOLD, VULN_MULT,
    DOT_TYPES, DOT_EXPLOSION_THRESHOLD, DOT_EXPLOSION_BASE_MULT, DOT_EXPLOSION_SCALE,
    DOT_STACK_DURATION, DOT_TICK_INTERVAL, DOT_TICK_DMG,
    COMBO_TIERS, REACTIONS, ELEMENTS,
    makeFighter, registerCombo, expireCombo, comboDamageBonus, comboCritBonus,
    finisherAvailable, finisherMultiplier,
    weaknessMultiplier, computeReaction, processElementHit,
    addPoise, checkBreak, isBroken, vulnerableMult, executeResult, resolveDamage,
    interruptResult,
    getDotStacks, applyDot, applyDotStacks, tickDotDamage,
    triggerDotExplosion, triggerAllExplosions,
    RESOURCE_DEFS, makeResource, resourcePct, spendResource,
    tickResource, onHitResourceGain, onHurtResourceGain,
    reactKey, clamp,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Combat;
  if (typeof window !== 'undefined') window.Combat = Combat;
})();
