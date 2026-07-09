/*
 * test_attributes.js — 属性分配系统 自动化测试
 * 运行：node test_attributes.js
 * 覆盖：正常流程 / 边界条件 / 异常处理
 */
'use strict';
const A = require('./attributes.js');
const assert = require('assert');

let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  \x1b[31m✗\x1b[0m ' + name + '  → ' + e.message); }
}
function section(s) { console.log('\n\x1b[36m▶ ' + s + '\x1b[0m'); }

// ── 1. makeAttribs ───────────────────────────────────────────
section('1. makeAttribs 工厂');
t('makeAttribs 返回默认对象（全0）', () => {
  const a = A.makeAttribs();
  assert.deepStrictEqual(a, { str: 0, int: 0, agi: 0, vit: 0, spi: 0, points: 0 });
});
t('makeAttribs 每次返回独立副本', () => {
  const a1 = A.makeAttribs();
  const a2 = A.makeAttribs();
  a1.str = 10;
  assert.strictEqual(a2.str, 0);
});

// ── 2. calcAttribBonuses ─────────────────────────────────────
section('2. calcAttribBonuses 属性加成计算');
t('null attribs → 全 0', () => {
  const b = A.calcAttribBonuses(null, 'warrior');
  assert.deepStrictEqual(b, { atk: 0, matk: 0, def: 0, mdef: 0, maxHp: 0, maxMp: 0, critRate: 0 });
});
t('STR=10 → atk=20', () => {
  const b = A.calcAttribBonuses({ str: 10, int: 0, agi: 0, vit: 0, spi: 0, points: 0 });
  assert.strictEqual(b.atk, 20);
  assert.strictEqual(b.matk, 0);
});
t('INT=10 → matk=20', () => {
  const b = A.calcAttribBonuses({ str: 0, int: 10, agi: 0, vit: 0, spi: 0, points: 0 });
  assert.strictEqual(b.matk, 20);
});
t('AGI=10 → critRate=0.10 (10%)', () => {
  const b = A.calcAttribBonuses({ str: 0, int: 0, agi: 10, vit: 0, spi: 0, points: 0 });
  assert.strictEqual(b.critRate, 0.10);
});
t('VIT=10 → maxHp=100, def=10', () => {
  const b = A.calcAttribBonuses({ str: 0, int: 0, agi: 0, vit: 10, spi: 0, points: 0 });
  assert.strictEqual(b.maxHp, 100);
  assert.strictEqual(b.def, 10);
});
t('SPI=10 → maxMp=100, mdef=10', () => {
  const b = A.calcAttribBonuses({ str: 0, int: 0, agi: 0, vit: 0, spi: 10, points: 0 });
  assert.strictEqual(b.maxMp, 100);
  assert.strictEqual(b.mdef, 10);
});
t('全属性 5 点 → 各加成正确', () => {
  const b = A.calcAttribBonuses({ str: 5, int: 5, agi: 5, vit: 5, spi: 5, points: 0 });
  assert.strictEqual(b.atk, 10);
  assert.strictEqual(b.matk, 10);
  assert.strictEqual(b.critRate, 0.05);
  assert.strictEqual(b.def, 5);
  assert.strictEqual(b.mdef, 5);
  assert.strictEqual(b.maxHp, 50);
  assert.strictEqual(b.maxMp, 50);
});

// ── 3. canAllocate ───────────────────────────────────────────
section('3. canAllocate 分配判定');
t('有剩余点数 → true', () => {
  const a = A.makeAttribs(); a.points = 5;
  assert.strictEqual(A.canAllocate(a, 'str'), true);
});
t('points=0 → false', () => {
  const a = A.makeAttribs(); a.points = 0;
  assert.strictEqual(A.canAllocate(a, 'str'), false);
});
t('属性已达上限 50 → false', () => {
  const a = A.makeAttribs(); a.points = 5; a.str = 50;
  assert.strictEqual(A.canAllocate(a, 'str'), false);
});
t('无效属性键 → false', () => {
  const a = A.makeAttribs(); a.points = 5;
  assert.strictEqual(A.canAllocate(a, 'luck'), false);
});
t('null attribs → false', () => {
  assert.strictEqual(A.canAllocate(null, 'str'), false);
});
t('属性键为 undefined → false', () => {
  const a = A.makeAttribs(); a.points = 5;
  assert.strictEqual(A.canAllocate(a, undefined), false);
});

// ── 4. allocate ──────────────────────────────────────────────
section('4. allocate 分配操作');
t('成功分配 1 点 → str+1, points-1', () => {
  const a = A.makeAttribs(); a.points = 5;
  const ok = A.allocate(a, 'str');
  assert.strictEqual(ok, true);
  assert.strictEqual(a.str, 1);
  assert.strictEqual(a.points, 4);
});
t('points=0 时分配失败 → false, 不变化', () => {
  const a = A.makeAttribs(); a.points = 0;
  assert.strictEqual(A.allocate(a, 'int'), false);
  assert.strictEqual(a.int, 0);
});
t('已满属性分配失败 → false', () => {
  const a = A.makeAttribs(); a.points = 5; a.agi = 50;
  assert.strictEqual(A.allocate(a, 'agi'), false);
  assert.strictEqual(a.agi, 50);
  assert.strictEqual(a.points, 5);
});
t('连续分配 5 点 points 用尽', () => {
  const a = A.makeAttribs(); a.points = 5;
  assert.strictEqual(A.allocate(a, 'vit'), true);
  assert.strictEqual(A.allocate(a, 'vit'), true);
  assert.strictEqual(A.allocate(a, 'vit'), true);
  assert.strictEqual(A.allocate(a, 'vit'), true);
  assert.strictEqual(A.allocate(a, 'vit'), true);
  assert.strictEqual(A.allocate(a, 'vit'), false); // 第 6 次失败
  assert.strictEqual(a.vit, 5);
  assert.strictEqual(a.points, 0);
});
t('分配不同属性互不影响', () => {
  const a = A.makeAttribs(); a.points = 5;
  A.allocate(a, 'str');
  A.allocate(a, 'int');
  A.allocate(a, 'agi');
  A.allocate(a, 'vit');
  A.allocate(a, 'spi');
  assert.strictEqual(a.str, 1);
  assert.strictEqual(a.int, 1);
  assert.strictEqual(a.agi, 1);
  assert.strictEqual(a.vit, 1);
  assert.strictEqual(a.spi, 1);
  assert.strictEqual(a.points, 0);
});

// ── 5. resetAttribs ──────────────────────────────────────────
section('5. resetAttribs 属性重置');
t('重置返回已分配点数（全 10 → 返回 50）', () => {
  const a = A.makeAttribs(); a.points = 0;
  a.str = 10; a.int = 10; a.agi = 10; a.vit = 10; a.spi = 10;
  const refund = A.resetAttribs(a);
  assert.strictEqual(refund, 50);
  assert.strictEqual(a.str, 0);
  assert.strictEqual(a.int, 0);
  assert.strictEqual(a.agi, 0);
  assert.strictEqual(a.vit, 0);
  assert.strictEqual(a.spi, 0);
  assert.strictEqual(a.points, 50);
});
t('重置时保留未使用的 points', () => {
  const a = A.makeAttribs(); a.points = 3;
  a.str = 2; a.int = 0; a.agi = 0; a.vit = 0; a.spi = 0;
  const refund = A.resetAttribs(a);
  assert.strictEqual(refund, 2);
  assert.strictEqual(a.points, 5); // 3 + 2
});
t('无分配重置返回 0', () => {
  const a = A.makeAttribs(); a.points = 5;
  const refund = A.resetAttribs(a);
  assert.strictEqual(refund, 0);
  assert.strictEqual(a.points, 5);
});
t('null 对象重置返回 0', () => {
  assert.strictEqual(A.resetAttribs(null), 0);
});

// ── 6. resetCost ─────────────────────────────────────────────
section('6. resetCost 重置费用');
t('resetCount=0 → 1000', () => {
  assert.strictEqual(A.resetCost(0), 1000);
});
t('resetCount=1 → 1500', () => {
  assert.strictEqual(A.resetCost(1), 1500);
});
t('resetCount=2 → 2250', () => {
  assert.strictEqual(A.resetCost(2), 2250);
});
t('resetCount=5 → 7594 (向下取整校验)', () => {
  assert.strictEqual(A.resetCost(5), 7594);
});
t('resetCount=10 → 57665', () => {
  assert.strictEqual(A.resetCost(10), 57665);
});
t('resetCount 负数 → 抛 RangeError', () => {
  assert.throws(() => A.resetCost(-1), RangeError);
});
t('resetCount 非数字 → 抛 TypeError', () => {
  assert.throws(() => A.resetCost('x'), TypeError);
});

// ── 7. 集成场景 ──────────────────────────────────────────────
section('7. 集成场景');
t('分配→重置→再分配 完整流程', () => {
  const a = A.makeAttribs();
  a.points = 10; // 2 级点数
  // 分配阶段
  A.allocate(a, 'str');
  A.allocate(a, 'str');
  A.allocate(a, 'vit');
  A.allocate(a, 'vit');
  A.allocate(a, 'int');
  assert.strictEqual(a.str, 2);
  assert.strictEqual(a.vit, 2);
  assert.strictEqual(a.int, 1);
  assert.strictEqual(a.points, 5);
  // 重置
  const refund = A.resetAttribs(a);
  assert.strictEqual(refund, 5);
  assert.strictEqual(a.points, 10);
  // 重新分配
  A.allocate(a, 'spi');
  A.allocate(a, 'spi');
  assert.strictEqual(a.spi, 2);
  assert.strictEqual(a.points, 8);
});
t('属性上限 50 硬限制，第 51 点无法分配', () => {
  const a = A.makeAttribs(); a.points = 100; a.str = 50;
  assert.strictEqual(A.canAllocate(a, 'str'), false);
  assert.strictEqual(A.allocate(a, 'str'), false);
});
t('重置费用随次数指数增长', () => {
  const costs = [0, 1, 2, 3].map(A.resetCost);
  assert.strictEqual(costs[0], 1000);
  assert.strictEqual(costs[1], 1500);
  assert.strictEqual(costs[2], 2250);
  assert.strictEqual(costs[3], 3375);
  // 验证指数增长：每步比率 ≈ 1.5
  assert.ok(costs[1] / costs[0] >= 1.49);
  assert.ok(costs[2] / costs[1] >= 1.49);
});

// ── 汇总 ─────────────────────────────────────────────────
console.log('\n' + (fail === 0
  ? '\x1b[32m══ PASS: 全部 ' + pass + ' 项通过 ✅ ══\x1b[0m'
  : '\x1b[31m══ FAIL: ' + fail + ' 项失败 / ' + pass + ' 项通过 ❌ ══\x1b[0m'));
if (fail > 0) { fails.forEach(f => console.log('   - ' + f)); process.exitCode = 1; }
