/*
 * affix_synergy.js —— 词缀联动系统（纯逻辑 / 双模式）
 * 对应设计文档：《战斗系统深化设计.md》§13 词缀联动
 *
 * 三系联动：
 *   暴击猛攻（critRate + critDmg）→ 暴击触发减CD / 双倍打击
 *   狂怒连击（affix-atk + lifesteal）→ 逐层叠加攻击力 / 满层回血
 *   死神降临（armorPen + execute）→ 处决阈值提升 / 低血增伤
 *
 * 风格：纯函数 + 可序列化状态，不持有游戏引用。
 */
(function () {
  'use strict';

  // ── 联动定义 ──
  // require: 词缀统计值阈值（hasExecute 为布尔检查）
  // bonuses: 返回给 calcPlayerStats 的附加属性
  const AFFIX_SYNERGIES = [
    {
      id: 'crit_onslaught',
      name: '暴击猛攻',
      icon: '⚡',
      desc: '暴击率与暴击伤害联动，暴击引发额外效果',
      family: ['critRate', 'critDmg'],
      tiers: [
        {
          tier: 1,
          label: '暴风眼',
          require: { critRate: 0.15, critDmg: 0.50 },
          bonuses: { syn_critRateAdd: 0.03, syn_critReduceCD: 0.05 },
          desc: '暴击率+3%，暴击减少技能CD 5%',
        },
        {
          tier: 2,
          label: '毁灭风暴',
          require: { critRate: 0.25, critDmg: 1.00 },
          bonuses: { syn_critDmgAdd: 0.25, syn_critDoubleStrike: 0.20 },
          desc: '暴击伤害+25%，暴击有20%概率双倍打击',
        },
      ],
    },
    {
      id: 'fury_blows',
      name: '狂怒连击',
      icon: '💥',
      desc: '攻击力与吸血联动，持续作战越战越强',
      family: ['atk', 'lifesteal'],
      tiers: [
        {
          tier: 1,
          label: '嗜血',
          require: { affixAtk: 50, lifesteal: 0.03 },
          bonuses: { syn_atkStackMax: 5, syn_atkStackPerHit: 0.03, syn_atkStackDur: 3000 },
          desc: '每次普攻叠加3%攻击力（最多5层，持续3秒）',
        },
        {
          tier: 2,
          label: '不灭战意',
          require: { affixAtk: 100, lifesteal: 0.08 },
          bonuses: { syn_atkStackMax: 10, syn_atkStackHeal: 0.01 },
          desc: '叠加上限提高至10层，满层时普攻回复1%最大生命',
        },
      ],
    },
    {
      id: 'grim_exec',
      name: '死神降临',
      icon: '💀',
      desc: '破甲与处决联动，低血量毁灭打击',
      family: ['armorPen', 'execute'],
      tiers: [
        {
          tier: 1,
          label: '破甲专家',
          require: { armorPen: 0.15 },
          bonuses: { syn_execThresholdAdd: 0.10 },
          desc: '处决阈值从20%提升至30%',
        },
        {
          tier: 2,
          label: '死神镰刀',
          require: { armorPen: 0.25, hasExecute: true },
          bonuses: { syn_lowHpDmgMult: 0.50 },
          desc: '30%血量以下敌人受到伤害+50%',
        },
      ],
    },
  ];

  // ── 工具 ──
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // 统计装备中词缀的累计值 + 特殊标记
  // 返回: { critRate, critDmg, affixAtk, lifesteal, armorPen, hasExecute }
  // 注意：displayValue 可能是 "12"（整数）、"0.05"（小数）、或 "15%"（百分比后缀）
  function statAffixes(equipment) {
    const result = { critRate: 0, critDmg: 0, affixAtk: 0, lifesteal: 0, armorPen: 0, hasExecute: false,
      burnDmg: 0, freezeSlow: 0, chainLight: 0, stunChance: 0 };
    for (const eq of (equipment || [])) {
      if (!eq || !eq.affixes) continue;
      for (const af of eq.affixes) {
        let raw = parseFloat(af.displayValue) || 0;
        if (typeof af.displayValue === 'string' && af.displayValue.indexOf('%') !== -1) raw /= 100;
        switch (af.type) {
          case 'critRate':  result.critRate  += raw; break;
          case 'critDmg':   result.critDmg   += raw; break;
          case 'atk':       result.affixAtk  += raw; break;
          case 'lifesteal': result.lifesteal += raw; break;
          case 'armorPen':  result.armorPen  += raw; break;
          case 'execute':   result.hasExecute = true; break;
          case 'burnDmg':   result.burnDmg   += raw; break;
          case 'freezeSlow': result.freezeSlow += raw; break;
          case 'chainLight': result.chainLight = Math.max(result.chainLight, raw); break;
          case 'stunChance': result.stunChance += raw; break;
        }
      }
    }
    return result;
  }

  // ── 核心纯函数 ──
  // 计算当前装备激活的词缀联动
  // 入参：equipment(数组) + playerStats(已计算的stats对象，含 critRate/critDmg/lifesteal/armorPen 等最终值)
  // 返回：{ active: [{synId, tierId, tier, label, bonuses}], merged: { 所有活跃加成合并 } }
  function calcAffixSynergies(equipment, playerStats) {
    const affixCounts = statAffixes(equipment);
    const active = [];
    const merged = {};
    // 防崩溃
    playerStats = playerStats || {};
    // 同步来自 playerStats 的最终值（因为 calcPlayerStats 有技能树加成和钳制）
    const thresholdStats = {
      critRate:   playerStats.critRate   || 0,
      critDmg:    playerStats.critDmg    || 0,
      lifesteal:  playerStats.lifesteal  || 0,
      armorPen:   playerStats.armorPen   || 0,
      affixAtk:   affixCounts.affixAtk,
      hasExecute: affixCounts.hasExecute,
    };

    for (const syn of AFFIX_SYNERGIES) {
      for (const tier of syn.tiers) {
        let met = true;
        for (const [key, val] of Object.entries(tier.require)) {
          if (key === 'hasExecute') {
            if (!thresholdStats.hasExecute) { met = false; break; }
          } else if ((thresholdStats[key] || 0) < val) {
            met = false; break;
          }
        }
        if (met) {
          active.push({
            synId: syn.id,
            synName: syn.name,
            synIcon: syn.icon,
            tierId: syn.id + '_t' + tier.tier,
            tier: tier.tier,
            label: tier.label,
            desc: tier.desc,
            bonuses: tier.bonuses,
          });
          Object.assign(merged, tier.bonuses);
        }
      }
    }

    return { active, merged };
  }

  // ── On-Hit Procs（§14：按装备词缀触发的战斗特效）──
  function calcOnHitProcs(equipment) {
    const counts = statAffixes(equipment);
    const procs = [];
    if (counts.burnDmg > 0 && Math.random() < 0.25) procs.push({ type:'burn', label:'🔥 灼烧!', value:counts.burnDmg });
    if (counts.freezeSlow > 0 && Math.random() < 0.20) procs.push({ type:'slow', label:'❄ 冰冻!', value:counts.freezeSlow });
    if (counts.chainLight > 0 && Math.random() < 0.15) procs.push({ type:'chain', label:'⚡ 连锁闪电!', value: counts.chainLight });
    if (counts.stunChance > 0 && Math.random() < counts.stunChance) procs.push({ type:'stun', label:'💫 眩晕!', value:1.0 });
    return procs;
  }

  // ── 导出 ──
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AFFIX_SYNERGIES, statAffixes, calcAffixSynergies, calcOnHitProcs };
  }
  if (typeof window !== 'undefined') {
    window.AffixSynergy = { AFFIX_SYNERGIES, statAffixes, calcAffixSynergies, calcOnHitProcs };
  }
})();
