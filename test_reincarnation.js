/*
 * test_reincarnation.js — 转生系统 自动化测试
 * 运行：node test_reincarnation.js
 * 覆盖：正常流程 / 边界条件 / 异常处理
 */
'use strict';
const R = require('./reincarnation.js');
const assert = require('assert');

let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  \x1b[31m✗\x1b[0m ' + name + '  → ' + e.message); }
}
function section(s) { console.log('\n\x1b[36m▶ ' + s + '\x1b[0m'); }

// ── 1. 常量 ─────────────────────────────────────────────────
section('1. 常量验证');
t('REINCARNATION_REQ_LEVEL = 50', () => {
  assert.strictEqual(R.REINCARNATION_REQ_LEVEL, 50);
});
t('MAX_REINCARNATION = 9', () => {
  assert.strictEqual(R.MAX_REINCARNATION, 9);
});
t('REQ_KILLS = 1000', () => {
  assert.strictEqual(R.REQ_KILLS, 1000);
});

// ── 2. makeReincarnation ─────────────────────────────────────
section('2. makeReincarnation 工厂');
t('返回默认转生状态对象', () => {
  const s = R.makeReincarnation();
  assert.deepStrictEqual(s, { reincLevel: 0, totalKills: 0, totalGoldEarned: 0 });
});
t('每次返回独立副本', () => {
  const s1 = R.makeReincarnation();
  const s2 = R.makeReincarnation();
  s1.reincLevel = 1;
  assert.strictEqual(s2.reincLevel, 0);
});

// ── 3. canReincarnate ─────────────────────────────────────---
section('3. canReincarnate 转生条件判定');
t('全部条件满足 → true', () => {
  assert.strictEqual(R.canReincarnate(50, 0, { totalKills: 1000 }), true);
});
t('等级 < 50 → false', () => {
  assert.strictEqual(R.canReincarnate(49, 0, { totalKills: 1000 }), false);
});
t('刚好 50 级 → true', () => {
  assert.strictEqual(R.canReincarnate(50, 0, { totalKills: 1000 }), true);
});
t('转生已达上限 9 → false', () => {
  assert.strictEqual(R.canReincarnate(50, 9, { totalKills: 1000 }), false);
});
t('击杀不足 1000 → false', () => {
  assert.strictEqual(R.canReincarnate(50, 0, { totalKills: 999 }), false);
});
t('刚好 1000 击杀 → true', () => {
  assert.strictEqual(R.canReincarnate(50, 0, { totalKills: 1000 }), true);
});
t('null stats → false', () => {
  assert.strictEqual(R.canReincarnate(50, 0, null), false);
});
t('undefined level → false', () => {
  assert.strictEqual(R.canReincarnate(undefined, 0, { totalKills: 1000 }), false);
});

// ── 4. reincarnationBonuses ─────────────────────────────────
section('4. reincarnationBonuses 转生加成');
t('转生 0 级 → 全 0', () => {
  const b = R.reincarnationBonuses(0);
  assert.strictEqual(b.atkMult, 0);
  assert.strictEqual(b.matkMult, 0);
  assert.strictEqual(b.maxHpMult, 0);
  assert.strictEqual(b.critRateBonus, 0);
  assert.strictEqual(b.goldPerLevel, 0);
});
t('转生 1 级 → +5% atk/matk, +5% hp, +2% crit, +50 gold', () => {
  const b = R.reincarnationBonuses(1);
  assert.strictEqual(b.atkMult, 0.05);
  assert.strictEqual(b.matkMult, 0.05);
  assert.strictEqual(b.maxHpMult, 0.05);
  assert.strictEqual(b.critRateBonus, 0.02);
  assert.strictEqual(b.goldPerLevel, 50);
});
t('转生 5 级 → +25% atk/matk, +25% hp, +10% crit, +250 gold', () => {
  const b = R.reincarnationBonuses(5);
  assert.strictEqual(b.atkMult, 0.25);
  assert.strictEqual(b.matkMult, 0.25);
  assert.strictEqual(b.maxHpMult, 0.25);
  assert.strictEqual(b.critRateBonus, 0.10);
  assert.strictEqual(b.goldPerLevel, 250);
});
t('转生 9 级（上限）→ +45% atk/matk, +45% hp, +18% crit, +450 gold', () => {
  const b = R.reincarnationBonuses(9);
  assert.strictEqual(b.atkMult, 0.45);
  assert.strictEqual(b.matkMult, 0.45);
  assert.strictEqual(b.maxHpMult, 0.45);
  assert.strictEqual(b.critRateBonus, 0.18);
  assert.strictEqual(b.goldPerLevel, 450);
});
t('负数转生等级 → 全 0', () => {
  const b = R.reincarnationBonuses(-1);
  assert.strictEqual(b.atkMult, 0);
});
t('超过上限转生等级 → 全 0', () => {
  const b = R.reincarnationBonuses(10);
  assert.strictEqual(b.atkMult, 0);
});
t('非有限数字 → 全 0', () => {
  const b = R.reincarnationBonuses('x');
  assert.strictEqual(b.atkMult, 0);
});

// ── 5. performReincarnation ─────────────────────────────────
section('5. performReincarnation 执行转生');
t('执行转生 → reincLevel+1, level=1, 返回加成', () => {
  const state = { level: 50, reincLevel: 0 };
  const result = R.performReincarnation(state);
  assert.strictEqual(result.reincLevel, 1);
  assert.strictEqual(state.reincLevel, 1);
  assert.strictEqual(state.level, 1);
  assert.strictEqual(result.bonuses.atkMult, 0.05);
});
t('多次转生累加', () => {
  const state = { level: 50, reincLevel: 0 };
  R.performReincarnation(state);
  R.performReincarnation(state);
  R.performReincarnation(state);
  assert.strictEqual(state.reincLevel, 3);
  assert.strictEqual(state.level, 1);
});
t('第 9 转后 reincLevel=9', () => {
  const state = { level: 50, reincLevel: 0 };
  for (let i = 0; i < 9; i++) R.performReincarnation(state);
  assert.strictEqual(state.reincLevel, 9);
  const b = R.reincarnationBonuses(state.reincLevel);
  assert.strictEqual(b.atkMult, 0.45);
});
t('null state → 返回 null', () => {
  assert.strictEqual(R.performReincarnation(null), null);
});
t('state 无 level 字段也能工作', () => {
  const state = { reincLevel: 0 };
  const result = R.performReincarnation(state);
  assert.strictEqual(result.reincLevel, 1);
  assert.strictEqual(state.level, 1);
});

// ── 6. formatReincarnation ──────────────────────────────────
section('6. formatReincarnation 转生称号');
t('level 0 → 空字符串', () => {
  assert.strictEqual(R.formatReincarnation(0), '');
});
t('level 1 → 一转', () => {
  assert.strictEqual(R.formatReincarnation(1), '一转');
});
t('level 2 → 二转', () => {
  assert.strictEqual(R.formatReincarnation(2), '二转');
});
t('level 5 → 五转', () => {
  assert.strictEqual(R.formatReincarnation(5), '五转');
});
t('level 9 → 九转', () => {
  assert.strictEqual(R.formatReincarnation(9), '九转');
});
t('负数 → 空字符串', () => {
  assert.strictEqual(R.formatReincarnation(-1), '');
});
t('超过上限 → 空字符串', () => {
  assert.strictEqual(R.formatReincarnation(10), '');
});
t('非数字 → 空字符串', () => {
  assert.strictEqual(R.formatReincarnation('x'), '');
});

// ── 7. 集成场景 ──────────────────────────────────────────────
section('7. 集成场景');
t('完整转生流程：条件检查→执行→加成验证', () => {
  const state = { level: 50, reincLevel: 0, totalKills: 1000 };
  // 检查能否转生
  assert.strictEqual(R.canReincarnate(state.level, state.reincLevel, state), true);
  // 执行转生
  const r = R.performReincarnation(state);
  assert.strictEqual(r.reincLevel, 1);
  assert.strictEqual(state.level, 1);
  // 升级回 50
  state.level = 50;
  state.totalKills = 2000;
  // 可再次转生
  assert.strictEqual(R.canReincarnate(state.level, state.reincLevel, state), true);
  const r2 = R.performReincarnation(state);
  assert.strictEqual(r2.reincLevel, 2);
  assert.strictEqual(r2.bonuses.atkMult, 0.10);
});
t('称号与加成一致：九转应有 +45% 加成', () => {
  assert.strictEqual(R.formatReincarnation(9), '九转');
  const b = R.reincarnationBonuses(9);
  assert.strictEqual(b.atkMult, 0.45);
  assert.strictEqual(b.critRateBonus, 0.18);
});

// ── 汇总 ─────────────────────────────────────────────────
console.log('\n' + (fail === 0
  ? '\x1b[32m══ PASS: 全部 ' + pass + ' 项通过 ✅ ══\x1b[0m'
  : '\x1b[31m══ FAIL: ' + fail + ' 项失败 / ' + pass + ' 项通过 ❌ ══\x1b[0m'));
if (fail > 0) { fails.forEach(f => console.log('   - ' + f)); process.exitCode = 1; }
