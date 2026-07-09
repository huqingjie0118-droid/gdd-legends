/*
 * test_economy.js — 游戏经济系统 自动化测试
 * 运行：node test_economy.js
 * 覆盖：正常流程 / 边界条件 / 异常处理，输出清晰 PASS/FAIL 汇总。
 */
'use strict';
const E = require('./economy.js');
const assert = require('assert');

let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  \x1b[31m✗\x1b[0m ' + name + '  → ' + e.message); }
}
function section(s) { console.log('\n\x1b[36m▶ ' + s + '\x1b[0m'); }

// ── 1. levelFactor / mapFactor ───────────────────────────────
section('1. 等级/地图缩放因子（边界 clamp）');
t('levelFactor(1)=1', () => assert.strictEqual(E.levelFactor(1), 1));
t('levelFactor(-5) 触发下限 0.75', () => assert.strictEqual(E.levelFactor(-5), 0.75));
t('levelFactor(30) 触发上限 2.2', () => assert.strictEqual(E.levelFactor(30), 2.2));
t('mapFactor(0)=1', () => assert.strictEqual(E.mapFactor(0), 1));
t('mapFactor(5)=1.25', () => assert.strictEqual(E.mapFactor(5), 1.25));
t('mapFactor(-1) 抛错', () => assert.throws(() => E.mapFactor(-1), RangeError));

// ── 2. 怪物金币 ───────────────────────────────────────────
section('2. 怪物金币获取（§2.1）');
t('普通怪 L1 map0 = 56', () => assert.strictEqual(E.monsterGold({}), 56));
t('L10 随等级缩放 = 79', () => assert.strictEqual(E.monsterGold({ level: 10 }), 79));
t('精英 ×2 = 157', () => assert.strictEqual(E.monsterGold({ level: 10, isElite: true }), 157));
t('碾压衰减(L差9) ×0.6 = 34', () => assert.strictEqual(
  E.monsterGold({ level: 1, contentLevel: 1, playerLevel: 10 }), 34));
t('非有限 level 抛 TypeError', () => assert.throws(() => E.monsterGold({ level: 'x' }), TypeError));

// ── 3. 任务金币（§2.2）──────────────────────────────────
section('3. 任务金币（挂 BAL 曲线）');
t('D2 L1 = 80', () => assert.strictEqual(E.questGold(80, 1, 1), 80));
t('D2 L10 = 355（与文档示例一致）', () => assert.strictEqual(E.questGold(80, 1, 10), 355));
t('D5 L10 = 2839', () => assert.strictEqual(E.questGold(640, 4, 10), 2839));
t('difficulty 字符串 D3 可用', () => assert.strictEqual(E.questGold(160, 'D3', 1), 160));
t('L<1 抛 RangeError', () => assert.throws(() => E.questGold(80, 1, 0), RangeError));
t('非法 difficulty 抛 RangeError', () => assert.throws(() => E.questGold(80, 9, 1), RangeError));

// ── 4. 强化费用（§3.1 水泵）────────────────────────────
section('4. 装备强化费用（指数曲线）');
t('+1 = 250', () => assert.strictEqual(E.enhCost(1), 250));
t('+5 = 610', () => assert.strictEqual(E.enhCost(5), 610));
t('+10 = 1863（已核验）', () => assert.strictEqual(E.enhCost(10), 1863));
t('+15 = 5684（已核验）', () => assert.strictEqual(E.enhCost(15), 5684));
t('n=0 → +0 档 = 200', () => assert.strictEqual(E.enhCost(0), 200));
t('n<0 钳到 0 = 200', () => assert.strictEqual(E.enhCost(-3), 200));
t('n>15 钳到 15 = 5684', () => assert.strictEqual(E.enhCost(99), 5684));
t('装备等级缩放 +10@Lv20 = 4470', () => assert.strictEqual(E.enhCost(10, { equipLevel: 20 }), 4470));
t('累计 +15 ≈ 27421（自洽校验）', () => {
  let ref = 0; for (let i = 1; i <= 15; i++) ref += E.enhCost(i);
  assert.strictEqual(E.enhCumulative(15), ref);
  assert.ok(ref > 27000 && ref < 28000, '应在 ~2.7 万区间, 实得 ' + ref);
});

// ── 5. 重铸费用 ──────────────────────────────────────────
section('5. 词缀重铸费用');
t('第 0 次 = 500', () => assert.strictEqual(E.reforgeCost(0), 500));
t('第 1 次 = 575', () => assert.strictEqual(E.reforgeCost(1), 575));
t('第 5 次 = 1006', () => assert.strictEqual(E.reforgeCost(5), 1006));
t('负数钳到 0 = 500', () => assert.strictEqual(E.reforgeCost(-2), 500));

// ── 6. 动态物价 / 拍卖行 ───────────────────────────────
section('6. 动态物价缩放（§5.2）与拍卖行手续费');
t('服均 L10 → 1.0', () => assert.strictEqual(E.priceMult(10), 1.0));
t('服均 L5 下限钳 1.0', () => assert.strictEqual(E.priceMult(5), 1.0));
t('服均 L100 上限钳 3.0', () => assert.strictEqual(E.priceMult(100), 3.0));
t('服均 L50 = 2.2', () => assert.strictEqual(E.priceMult(50), 2.2));
t('拍卖行 1000 金抽 5% = 50', () => assert.strictEqual(E.ahFee(1000), 50));
t('拍卖行 0 = 0', () => assert.strictEqual(E.ahFee(0), 0));
t('拍卖行负数抛错', () => assert.throws(() => E.ahFee(-5), RangeError));

// ── 7. 幸运箱 pity（§5.1）──────────────────────────────
section('7. 幸运箱 roll 与保底');
t('硬保底：第 100 次必出 legendary', () => {
  let st = null; let last = null;
  for (let i = 1; i <= 100; i++) { const r = E.luckyBoxRoll(st); st = r.state; last = r; }
  assert.strictEqual(last.quality, 'legendary');
  assert.strictEqual(st.total, 100);
});
t('roll 返回合法品质', () => {
  const r = E.luckyBoxRoll();
  assert.ok(E.TIER_ORDER.includes(r.quality));
  assert.strictEqual(r.state.total, 1);
});
t('权重选择正确（random≈0→common）', () => {
  const orig = Math.random; Math.random = () => 0;
  const r = E.luckyBoxRoll(); Math.random = orig;
  assert.strictEqual(r.quality, 'common');
});
t('权重选择正确（random≈0.999→mythic）', () => {
  const orig = Math.random; Math.random = () => 0.999;
  const r = E.luckyBoxRoll(); Math.random = orig;
  assert.strictEqual(r.quality, 'mythic');
});

// ── 8. 净金币监测（§5.1 防通胀）──────────────────────
section('8. 净金币监测告警');
t('连续 7 日净增超阈值 → 触发', () => {
  const m = E.NetGoldMonitor({ threshold: 5000 });
  for (let d = 1; d <= 7; d++) m.record(d, 9000, 1000); // net 8000
  const r = m.checkInflation();
  assert.strictEqual(r.triggered, true);
});
t('样本不足 7 日 → 不触发', () => {
  const m = E.NetGoldMonitor();
  for (let d = 1; d <= 3; d++) m.record(d, 9000, 1000);
  const r = m.checkInflation();
  assert.strictEqual(r.triggered, false);
  assert.strictEqual(r.reason, '样本不足');
});
t('存在低于阈值日 → 不触发', () => {
  const m = E.NetGoldMonitor({ threshold: 5000 });
  for (let d = 1; d <= 7; d++) m.record(d, d === 4 ? 1000 : 9000, 1000);
  assert.strictEqual(m.checkInflation().triggered, false);
});
t('负值 earned 抛 RangeError', () => {
  const m = E.NetGoldMonitor();
  assert.throws(() => m.record(1, -1, 0), RangeError);
});

// ── 9. 代币周清零（§1，防通胀）──────────────────────
section('9. 代币周清零（ISO 周键 + 三态判定）');
// 固定时间戳（UTC）：周一 2026-01-05 → 2026-W02；周日 2026-01-11 → 2026-W02（同周）；周一 2026-01-12 → 2026-W03
const MON_A = Date.UTC(2026, 0, 5), SUN_B = Date.UTC(2026, 0, 11), MON_C = Date.UTC(2026, 0, 12);
const PREV_Y = Date.UTC(2025, 11, 28), THU_NEWY = Date.UTC(2026, 0, 1);
t('isoWeekKey 同周(周一A vs 周日B) 相等', () => assert.strictEqual(E.isoWeekKey(MON_A), E.isoWeekKey(SUN_B)));
t('isoWeekKey 跨周(A vs C) 不等', () => assert.notStrictEqual(E.isoWeekKey(MON_A), E.isoWeekKey(MON_C)));
t('isoWeekKey 跨年(PREV_Y 周日 vs 新年周四) 不等', () => assert.notStrictEqual(E.isoWeekKey(PREV_Y), E.isoWeekKey(THU_NEWY)));
t('isoWeekKey 格式形如 2026-W02', () => assert.strictEqual(E.isoWeekKey(MON_A), '2026-W02'));
t('isoWeekKey 非有限 ts 抛 TypeError', () => assert.throws(() => E.isoWeekKey('x'), TypeError));
t('tokenResetState 首次(无记录) = first', () => assert.strictEqual(E.tokenResetState(null, MON_A), 'first'));
t('tokenResetState 同周 = same', () => assert.strictEqual(E.tokenResetState(E.isoWeekKey(MON_A), SUN_B), 'same'));
t('tokenResetState 跨周 = reset', () => assert.strictEqual(E.tokenResetState(E.isoWeekKey(MON_A), MON_C), 'reset'));
t('tokenResetState 跨年 = reset', () => assert.strictEqual(E.tokenResetState(E.isoWeekKey(PREV_Y), THU_NEWY), 'reset'));
t('tokenResetState 空串视为 first', () => assert.strictEqual(E.tokenResetState('', MON_A), 'first'));

// ── 11. 耐久与金币沉淀（§6 sink）──────────────────────────
section('11. 耐久与金币沉淀（修理/传送/复活/磨损）');
// duraScale 边界
t('duraScale(null) = 1（旧装备兼容）', () => assert.strictEqual(E.duraScale(null), 1));
t('duraScale(undefined) = 1', () => assert.strictEqual(E.duraScale(undefined), 1));
t('duraScale(100) = 1（满耐久）', () => assert.strictEqual(E.duraScale(100), 1));
t('duraScale(50) = 1（正常）', () => assert.strictEqual(E.duraScale(50), 1));
t('duraScale(DURABILITY_LOW-1=29) = 0.6（磨损）', () => assert.strictEqual(E.duraScale(E.DURABILITY_LOW - 1), 0.6));
t('duraScale(0) = 0（损坏失效）', () => assert.strictEqual(E.duraScale(0), 0));
// repairCost
t('repairCost 满耐久 = 0', () => assert.strictEqual(E.repairCost({ dura: 100, duraMax: 100 }), 0));
t('repairCost 损坏(0) = 200（100×2）', () => assert.strictEqual(E.repairCost({ dura: 0, duraMax: 100 }), 200));
t('repairCost 半损(50) = 100', () => assert.strictEqual(E.repairCost({ dura: 50, duraMax: 100 }), 100));
t('repairCost 折扣30% 半损 = 70', () => assert.strictEqual(E.repairCost({ dura: 50, duraMax: 100 }, { discount: 0.3 }), 70));
t('repairCost 旧装备无dura字段 = 0（视为满）', () => assert.strictEqual(E.repairCost({}), 0));
t('repairCost 自定义单价 5 全损 = 500', () => assert.strictEqual(E.repairCost({ dura: 0, duraMax: 100 }, { perPoint: 5 }), 500));
// teleportCost
t('teleportCost(0,1) = 40（25+15）', () => assert.strictEqual(E.teleportCost(0, 1), 40));
t('teleportCost(0,4) = 85（25+15×4）', () => assert.strictEqual(E.teleportCost(0, 4), 85));
t('teleportCost 自定义 base30/perMap10 至3 = 60', () => assert.strictEqual(E.teleportCost(0, 3, { base: 30, perMap: 10 }), 60));
// reviveCost
t('reviveCost(1) = 100（80+20）', () => assert.strictEqual(E.reviveCost(1), 100));
t('reviveCost(10) = 280（80+20×10）', () => assert.strictEqual(E.reviveCost(10), 280));
t('reviveCost(0) 兜底 = 100', () => assert.strictEqual(E.reviveCost(0), 100));
t('reviveCost 自定义 base50/perLv10 至5 = 100', () => assert.strictEqual(E.reviveCost(5, { base: 50, perLv: 10 }), 100));

// ── 汇总 ─────────────────────────────────────────────────
console.log('\n' + (fail === 0
  ? '\x1b[32m══ PASS: 全部 ' + pass + ' 项通过 ✅ ══\x1b[0m'
  : '\x1b[31m══ FAIL: ' + fail + ' 项失败 / ' + pass + ' 项通过 ❌ ══\x1b[0m'));
if (fail > 0) { fails.forEach(f => console.log('   - ' + f)); process.exitCode = 1; }
