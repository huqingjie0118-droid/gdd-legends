/*
 * test_npcshop.js — NPC 商店 / 词缀重铸 自动化测试
 * 运行：node test_npcshop.js
 * 覆盖：正常流程 / 边界条件 / 异常处理，输出清晰 PASS/FAIL 汇总。
 */
'use strict';
const NS = require('./npcshop.js');
const assert = require('assert');

let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  \x1b[31m✗\x1b[0m ' + name + '  → ' + e.message); }
}
function section(s) { console.log('\n\x1b[36m▶ ' + s + '\x1b[0m'); }

// 注入式 mock roller：返回 count 个确定词缀，便于断言数量与不可变性
function mockRoller(eq, count, rng) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ type: 'mock' + i, name: '词缀' + i, displayValue: '10' });
  return out;
}
const sampleEq = () => ({
  uid: 'u1', slotKey: 'weapon', slotName: '武器', name: '烈焰剑',
  quality: 'rare', qualityName: '稀有', color: '#0af',
  affixes: [
    { type: 'atk', name: '攻击力+', displayValue: '30' },
    { type: 'critRate', name: '暴击率+', displayValue: '0.05' },
  ],
  baseAtk: 50, baseDef: 10, enhanceLevel: 3, reforgeCount: 0,
});

// ── 1. 重铸费用 ───────────────────────────────────────────
section('1. 重铸费用（指数水泵 + 动态物价）');
t('times=0 → 基础 500', () => assert.strictEqual(NS.reforgeCost(sampleEq()), 500));
t('reforgeCount=0 等价无字段 → 500', () => assert.strictEqual(NS.reforgeCost({}), 500));
t('reforgeCount=1 → 500×1.15=575', () => assert.strictEqual(NS.reforgeCost({ reforgeCount: 1 }), 575));
t('reforgeCount=3 → 500×1.15³=760', () => assert.strictEqual(NS.reforgeCost({ reforgeCount: 3 }), 760));
t('负数 reforgeCount 钳为 0 → 500', () => assert.strictEqual(NS.reforgeCost({ reforgeCount: -2 }), 500));
t('serverAvgLevel=30 → ×1.6 = 800', () => assert.strictEqual(NS.reforgeCost({}, { serverAvgLevel: 30 }), 800));
t('serverAvgLevel=70 → 1+0.03×60=2.8 → 1400', () => assert.strictEqual(NS.reforgeCost({}, { serverAvgLevel: 70 }), 1400));
t('serverAvgLevel=200 → 钳上限 3.0 → 1500', () => assert.strictEqual(NS.reforgeCost({}, { serverAvgLevel: 200 }), 1500));
t('自定义 base/rate 生效', () => assert.strictEqual(NS.reforgeCost({}, { base: 1000, rate: 2, serverAvgLevel: 10 }), 1000));

// ── 2. canReforge ─────────────────────────────────────────
section('2. 能否重铸（前置校验）');
t('无装备 → no-equip', () => assert.strictEqual(NS.canReforge(null, 999).reason, 'no-equip'));
t('无词缀 → no-affix', () => assert.strictEqual(NS.canReforge({ affixes: [] }, 999).reason, 'no-affix'));
t('金币不足 → insufficient-gold（返回所需 cost）', () => {
  const r = NS.canReforge(sampleEq(), 100);
  assert.strictEqual(r.reason, 'insufficient-gold');
  assert.strictEqual(r.cost, 500);
});
t('金币足够 → ok 且 cost=500', () => {
  const r = NS.canReforge(sampleEq(), 500);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cost, 500);
});

// ── 3. applyReforge 正常流程 ──────────────────────────────
section('3. 执行重铸（纯函数闭环）');
t('返回 ok 且词缀数量与原件一致(2)', () => {
  const r = NS.applyReforge(sampleEq(), 500, { rollAffixes: mockRoller });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.eq.affixes.length, 2);
});
t('reforgeCount 0→1', () => {
  const r = NS.applyReforge(sampleEq(), 500, { rollAffixes: mockRoller });
  assert.strictEqual(r.reforgeCount, 1);
});
t('保留 baseAtk/baseDef/enhanceLevel/quality/name/slotKey', () => {
  const r = NS.applyReforge(sampleEq(), 500, { rollAffixes: mockRoller });
  const e = r.eq;
  assert.strictEqual(e.baseAtk, 50);
  assert.strictEqual(e.baseDef, 10);
  assert.strictEqual(e.enhanceLevel, 3);
  assert.strictEqual(e.quality, 'rare');
  assert.strictEqual(e.name, '烈焰剑');
  assert.strictEqual(e.slotKey, 'weapon');
});
t('新词缀由 roller 生成（mock0/mock1）', () => {
  const r = NS.applyReforge(sampleEq(), 500, { rollAffixes: mockRoller });
  assert.strictEqual(r.eq.affixes[0].type, 'mock0');
  assert.strictEqual(r.eq.affixes[1].type, 'mock1');
});
t('返回 cost 与 reforgeCost 一致(500)', () => {
  const r = NS.applyReforge(sampleEq(), 500, { rollAffixes: mockRoller });
  assert.strictEqual(r.cost, 500);
});
t('动态物价：serverAvgLevel=30 时 cost=800', () => {
  const r = NS.applyReforge(sampleEq(), 1000, { rollAffixes: mockRoller, serverAvgLevel: 30 });
  assert.strictEqual(r.cost, 800);
});

// ── 4. applyReforge 异常 / 边界 ───────────────────────────
section('4. 异常与边界');
t('金币不足 → ok:false insufficient-gold', () => {
  const r = NS.applyReforge(sampleEq(), 499, { rollAffixes: mockRoller });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'insufficient-gold');
});
t('无词缀装备 → ok:false no-affix', () => {
  const r = NS.applyReforge({ affixes: [], baseAtk: 1 }, 999, { rollAffixes: mockRoller });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no-affix');
});
t('未注入 rollAffixes → 抛错', () => {
  assert.throws(() => NS.applyReforge(sampleEq(), 500), Error);
});
t('纯函数：不修改入参 baseAtk/reforgeCount/affixes', () => {
  const eq = sampleEq();
  const before = JSON.stringify(eq);
  NS.applyReforge(eq, 500, { rollAffixes: mockRoller });
  assert.strictEqual(JSON.stringify(eq), before);
});
t('多次重铸：第2次 reforgeCount=2 且费用递增(575)', () => {
  let eq = sampleEq();
  let r1 = NS.applyReforge(eq, 500, { rollAffixes: mockRoller });
  assert.strictEqual(r1.reforgeCount, 1);
  // 第2次用 r1 的产物（金币给够 575）
  let r2 = NS.applyReforge(r1.eq, 575, { rollAffixes: mockRoller });
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.reforgeCount, 2);
  // 第三次费用应为 500×1.15²=661
  assert.strictEqual(NS.reforgeCost(r2.eq), 661);
});

// ── 5. 服务目录 ───────────────────────────────────────────
section('5. NPC 服务目录');
t('SERVICES 含 3 项且 id 正确', () => {
  assert.strictEqual(NS.SERVICES.length, 3);
  assert.deepStrictEqual(NS.SERVICES.map(s => s.id), ['reforge', 'enhance', 'sell']);
});

// ── 汇总 ──────────────────────────────────────────────────
console.log('\n' + (fail === 0
  ? '\x1b[32m✅ 全部通过：' + pass + ' 项\x1b[0m'
  : '\x1b[31m❌ 失败 ' + fail + ' / 共 ' + (pass + fail) + ' 项\x1b[0m'));
if (fail) {
  console.log('\x1b[31m失败明细：\x1b[0m');
  fails.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
