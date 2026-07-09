/*
 * test_affix_synergy.js —— 词缀联动系统测试
 *
 * 运行：node test_affix_synergy.js
 */
const AS = require('./affix_synergy.js');

let pass = 0, fail = 0;
function t(name, fn) { try { if (fn()) pass++; else { fail++; console.log('✗ ' + name); } } catch(e) { fail++; console.log('✗ ' + name + ': ' + e.message); } }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg || `expected ${b} but got ${a}`); }

// ── §1 数据完整性 ──
t('AFFIX_SYNERGIES 3 联动', () => AS.AFFIX_SYNERGIES.length === 3);
t('每联动有 2 层', () => AS.AFFIX_SYNERGIES.every(s => s.tiers.length === 2));
t('id/name/icon/desc/family 完整', () => AS.AFFIX_SYNERGIES.every(s => s.id && s.name && s.icon && s.desc && Array.isArray(s.family)));

// ── §2 statAffixes 基础 ──
const empty = AS.statAffixes([]);
t('空装备零值', () => Object.values(empty).every(v => !v));
t('空白返回 >=5 字段', () => Object.keys(empty).length >= 5);

// 单装备多词缀（游戏内实际格式：数组词缀为小数，单值词缀为百分比）
const eq1 = {
  name: 'test',
  affixes: [
    { type: 'critRate', displayValue: '0.02' },
    { type: 'critDmg', displayValue: '15%' },
    { type: 'atk', displayValue: '25' },
    { type: 'lifesteal', displayValue: '0.05' },
  ],
};
const r1 = AS.statAffixes([eq1]);
t('critRate 0.02 解析', () => Math.abs(r1.critRate - 0.02) < 0.001);
t('critDmg 0.15 (15%→0.15)', () => Math.abs(r1.critDmg - 0.15) < 0.001);
t('affixAtk 25', () => r1.affixAtk === 25);
t('lifesteal 0.05', () => Math.abs(r1.lifesteal - 0.05) < 0.001);
t('无 execute', () => !r1.hasExecute);

const eq2 = {
  name: 'exec',
  affixes: [
    { type: 'armorPen', displayValue: '0.10' },
    { type: 'execute', displayValue: '2.0' },
  ],
};
const r2 = AS.statAffixes([eq2]);
t('armorPen 0.10 解析', () => Math.abs(r2.armorPen - 0.10) < 0.001);
t('hasExecute 真', () => r2.hasExecute);

// 混合两装备
const r3 = AS.statAffixes([eq1, eq2]);
t('混合累加 critRate 0.02', () => Math.abs(r3.critRate - 0.02) < 0.001);
t('混合累加 armorPen 0.10', () => Math.abs(r3.armorPen - 0.10) < 0.001);

// 装备无 affixes 字段
t('无 affixes 不崩', () => {
  const r = AS.statAffixes([{}, { name: 'nope' }]);
  return r.critRate === 0 && r.affixAtk === 0;
});

// ── §3 calcAffixSynergies 阈值触发 ──
// 零装备
const z = AS.calcAffixSynergies([], {});
t('空装备无联动', () => z.active.length === 0);
t('空装备 merged 空', () => Object.keys(z.merged).length === 0);

// 装备 + stats 满足暴击 Tier 1
const cEq = [{
  affixes: [
    { type: 'critRate', displayValue: '0.12' },
    { type: 'critDmg', displayValue: '25%' },
  ],
}];
const cS = { critRate: 0.17, critDmg: 0.65 }; // 含基础+技能树加成
const c1 = AS.calcAffixSynergies(cEq, cS);
t('暴击 T1 激活', () => {
  const a = c1.active.find(a => a.synId === 'crit_onslaught' && a.tier === 1);
  return a && a.label === '暴风眼';
});
t('暴击 T1 merged 含 syn_critRateAdd', () => c1.merged.syn_critRateAdd === 0.03);
t('暴击 T1 merged 含 syn_critReduceCD', () => c1.merged.syn_critReduceCD === 0.05);
t('暴击 T2 未激活（critDmg<1）', () => !c1.active.find(a => a.synId === 'crit_onslaught' && a.tier === 2));

// 暴击 Tier 2
const cEq2 = [{
  affixes: [
    { type: 'critRate', displayValue: '0.18' },
    { type: 'critDmg', displayValue: '60%' },
  ],
}];
const cS2 = { critRate: 0.26, critDmg: 1.05 };
const c2 = AS.calcAffixSynergies(cEq2, cS2);
t('暴击 T2 激活', () => {
  const a = c2.active.find(a => a.synId === 'crit_onslaught' && a.tier === 2);
  return a && a.label === '毁灭风暴';
});
t('暴击 T2 含 syn_critDmgAdd 0.25', () => c2.merged.syn_critDmgAdd === 0.25);
t('暴击 T2 含 syn_critDoubleStrike 0.20', () => c2.merged.syn_critDoubleStrike === 0.20);
t('暴击 T1 也继承', () => c2.active.length === 2);

// 狂怒 Tier 1
const fEq = [{
  affixes: [
    { type: 'atk', displayValue: '40' },
    { type: 'lifesteal', displayValue: '0.03' },
  ],
}];
const fS = { lifesteal: 0.05 };
const f1 = AS.calcAffixSynergies(fEq, fS);
t('狂怒 T1 affixAtk>=50 不够', () => !f1.active.find(a => a.synId === 'fury_blows'));

const fEq2 = [{
  affixes: [
    { type: 'atk', displayValue: '52' },
    { type: 'lifesteal', displayValue: '0.04' },
  ],
}];
const fS2 = { lifesteal: 0.06 };
const f2 = AS.calcAffixSynergies(fEq2, fS2);
t('狂怒 T1 激活', () => {
  const a = f2.active.find(a => a.synId === 'fury_blows' && a.tier === 1);
  return a && a.label === '嗜血';
});
t('狂怒 T1 含 syn_atkStackMax 5', () => f2.merged.syn_atkStackMax === 5);

// 狂怒 Tier 2（需要更大的装备）
const fEq3 = [{
  affixes: [
    { type: 'atk', displayValue: '105' },
    { type: 'lifesteal', displayValue: '0.10' },
  ],
}];
const fS3 = { lifesteal: 0.12 };
const f3 = AS.calcAffixSynergies(fEq3, fS3);
t('狂怒 T2 激活', () => {
  const a = f3.active.find(a => a.synId === 'fury_blows' && a.tier === 2);
  return a && a.label === '不灭战意';
});
t('狂怒 T2 syn_atkStackMax 10', () => f3.merged.syn_atkStackMax === 10);
t('狂怒 T2 含 syn_atkStackHeal 0.01', () => f3.merged.syn_atkStackHeal === 0.01);

// 死神 Tier 1
const gEq = [{
  affixes: [
    { type: 'armorPen', displayValue: '0.15' },
  ],
}];
const gS = { armorPen: 0.18 };
const g1 = AS.calcAffixSynergies(gEq, gS);
t('死神 T1 激活', () => {
  const a = g1.active.find(a => a.synId === 'grim_exec' && a.tier === 1);
  return a && a.label === '破甲专家';
});
t('死神 T1 syn_execThresholdAdd 0.10', () => g1.merged.syn_execThresholdAdd === 0.10);

// 死神 Tier 2
const gEq2 = [{
  affixes: [
    { type: 'armorPen', displayValue: '0.20' },
    { type: 'execute', displayValue: '2.0' },
  ],
}];
const gS2 = { armorPen: 0.27 };
const g2 = AS.calcAffixSynergies(gEq2, gS2);
t('死神 T2 激活', () => {
  const a = g2.active.find(a => a.synId === 'grim_exec' && a.tier === 2);
  return a && a.label === '死神镰刀';
});
t('死神 T2 syn_lowHpDmgMult 0.50', () => g2.merged.syn_lowHpDmgMult === 0.50);
t('死神 两项全激活', () => g2.active.length === 2);

// 混合联动激活
const mEq = [
  { affixes: [
    { type: 'critRate', displayValue: '0.18' },
    { type: 'critDmg', displayValue: '30%' },
    { type: 'armorPen', displayValue: '0.20' },
  ]},
  { affixes: [
    { type: 'lifesteal', displayValue: '0.05' },
    { type: 'atk', displayValue: '60' },
  ]},
];
// 模拟经过 calcPlayerStats 后含基础值的最终 stats
// critRate: 基础 0.05 + 装备 0.18 = 0.23 (需≥0.25 for T2)
// critDmg: 基础 1.50 + 装备 0.30 = 1.80 (需≥1.00 for T2)
// 所以设 0.25 和 1.80 即可触发 T2
const mS = { critRate: 0.28, critDmg: 1.10, lifesteal: 0.08, armorPen: 0.28 };
const m = AS.calcAffixSynergies(mEq, mS);
t('混合暴击 T1+T2 均激活', () => {
  const t1 = m.active.find(a => a.synId === 'crit_onslaught' && a.tier === 1);
  const t2 = m.active.find(a => a.synId === 'crit_onslaught' && a.tier === 2);
  return t1 && t2;
});
t('混合狂怒 T1 激活（affixAtk=60, lifesteal=8%>3%）', () => {
  return !!m.active.find(a => a.synId === 'fury_blows' && a.tier === 1);
});
t('混合狂怒 T2 未激活（affixAtk=60<100）', () => {
  return !m.active.find(a => a.synId === 'fury_blows' && a.tier === 2);
});
t('混合死神 T1 激活（T2 缺 execute 词缀）', () => {
  const t1 = m.active.find(a => a.synId === 'grim_exec' && a.tier === 1);
  const t2 = m.active.find(a => a.synId === 'grim_exec' && a.tier === 2);
  return t1 && !t2;
});
t('混合 merged 含 crit/fury/grim 加成', () => {
  return m.merged.syn_critRateAdd != null && m.merged.syn_critDmgAdd != null
    && m.merged.syn_atkStackMax != null && m.merged.syn_execThresholdAdd != null;
});
// 暴 T1+T2 + 狂 T1 + 死 T1 = 4
t('active 总数 4', () => m.active.length === 4);

// ── §4 边缘条件 ──
// stats 为 null
try {
  AS.calcAffixSynergies([], null);
  t('stats null 不抛', () => true);
} catch (e) {
  t('stats null 不抛', () => false);
}

// 装备为 null
try {
  const r = AS.calcAffixSynergies(null, {});
  t('equipment null 不抛', () => Array.isArray(r.active) && r.active.length === 0);
} catch (e) {
  t('equipment null 不抛', () => false);
}

// affixAtk 刚好临界 50
const bEq = [{ affixes: [{ type: 'atk', displayValue: '50' }, { type: 'lifesteal', displayValue: '0.05' }] }];
const bS = { lifesteal: 0.08 };
const b = AS.calcAffixSynergies(bEq, bS);
t('临界 affixAtk=50 激活狂怒 T1', () => !!b.active.find(a => a.synId === 'fury_blows'));

// 装备只有基础属性，无词缀
const plainEq = [{ name: 'sword', baseAtk: 10, affixes: [] }];
const p = AS.calcAffixSynergies(plainEq, { critRate: 0.05, critDmg: 1.5 });
t('无词缀装备不触发', () => p.active.length === 0);

// ── 汇总 ──
console.log('========================================');
console.log(`词缀联动测试：通过 ${pass} / 失败 ${fail}`);
console.log('========================================');