/*
 * test_gameEconomy.js — 经济桥接层自动化测试
 * 运行：node test_gameEconomy.js
 * 覆盖：正常流程 / 边界条件（等级·地图上限、碾压衰减、强化 +15 上限）/ 异常（非法等级、金币不足）
 * 并验证「接入 Economy 后，L1/地图0 的基线金币与改造前一致」（不破坏既有平衡）。
 */
const GE = require('./gameEconomy.js');
const Econ = require('./economy.js');

let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' -> ' + e.message); console.log('  ✗ ' + name + ' -> ' + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ` 期望 ${b}，实际 ${a}`); }
function ok(c, msg) { if (!c) throw new Error(msg || '期望为真'); }
function approx(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error((msg || '') + ` 期望≈${b}±${tol}，实际 ${a}`); }

console.log('\n=== gameEconomy 测试 ===\n');

// ── 1. 怪物金币：基线不变（L1 / 地图0 / 非精英 / 非Boss）──
console.log('[1] 怪物金币基线（与改造前 def.gold×7 一致）');
t('史莱姆 L1 地图0 非精英 = 21 (3×7)', () => eq(GE.monsterGold(3, { level: 1, mapIndex: 0, isElite: false, playerLevel: 1 }), 21));
t('哥布林 L1 地图0 非精英 = 49 (7×7)', () => eq(GE.monsterGold(7, { level: 1, mapIndex: 0, playerLevel: 1 }), 49));
t('史莱姆 精英 ×2 = 42 (3×7×2)', () => eq(GE.monsterGold(3, { level: 1, mapIndex: 0, isElite: true, playerLevel: 1 }), 42));
t('Boss(巨龙 gold400) L1 地图0 = 2800 (400×7)，无额外 Boss 乘子', () => eq(GE.monsterGold(400, { level: 1, mapIndex: 0, isBoss: true, playerLevel: 1 }), 2800));

// ── 2. 怪物金币：等级缩放 + 上限 ──
// 注：测等级缩放时显式令 contentLevel = playerLevel，排除碾压衰减干扰
console.log('[2] 等级缩放（levelFactor 1±0.045×(L-1)，上限 2.2）');
t('L10 普通怪金币 > L1（contentLevel=playerLevel 排除碾压）', () => ok(GE.monsterGold(3, { level: 10, mapIndex: 0, playerLevel: 10, contentLevel: 10 }) > 21));
t('L50 金币不超过 L1 的 2.2 倍（levelFactor 封顶）', () => {
  const capped = GE.monsterGold(3, { level: 50, mapIndex: 0, playerLevel: 50, contentLevel: 50 });
  ok(capped <= Math.round(21 * 2.2) + 1, 'capped=' + capped);
});
t('等级系数精确 = 1+0.045×(L-1)', () => {
  const g = GE.monsterGold(3, { level: 11, mapIndex: 0, playerLevel: 11, contentLevel: 11 });
  // 21 × (1+0.045×10)=21×1.45=30.45 → round 30
  eq(g, 30);
});

// ── 3. 怪物金币：地图缩放 ──
console.log('[3] 地图缩放（mapFactor 1+0.05×mapIndex）');
t('地图4 比 地图0 金币高（同等级）', () => {
  const a = GE.monsterGold(3, { level: 1, mapIndex: 0, playerLevel: 1 });
  const b = GE.monsterGold(3, { level: 1, mapIndex: 4, playerLevel: 1 });
  eq(b, Math.round(21 * (1 + 0.05 * 4))); // 21×1.2=25.2 → 25
});

// ── 4. 怪物金币：碾压衰减（玩家等级远超内容等级 → ×0.6）──
// 完整公式：round(base × levelFactor(playerLevel) × mapFactor × 0.6)
console.log('[4] 碾压衰减（playerLevel - contentLevel ≥ 5 → ×0.6）');
t('L30 打 地图0(content≈1) 金币 = 21×levelFactor(30)×0.6', () => {
  // levelFactor(30)=clamp(1+0.045×29,..,2.2)=2.2 → 21×2.2×0.6=27.72 → 28
  const g = GE.monsterGold(3, { level: 30, mapIndex: 0, playerLevel: 30 });
  eq(g, 28);
});
t('等级差 < 5 不触发衰减（L5 vs content1：差4，仅等级缩放）', () => {
  // levelFactor(5)=1+0.045×4=1.18 → 21×1.18=24.78 → 25
  const g = GE.monsterGold(3, { level: 5, mapIndex: 0, playerLevel: 5 });
  eq(g, 25);
});
t('显式 contentLevel 跨地图碾压', () => {
  // 21 × levelFactor(30)=2.2 × mapFactor(4)=1.2 × 0.6 = 33.26 → 33
  const g = GE.monsterGold(3, { level: 30, mapIndex: 4, contentLevel: 1, playerLevel: 30 });
  eq(g, 33);
});

// ── 5. 宝箱金币：等级缩放，基线不变 ──
console.log('[5] 宝箱金币（基线 30~149 ×7，随等级缩放）');
t('L1 宝箱 基数30 = 210 (30×7)', () => eq(GE.chestGold(30, { level: 1 }), 210));
t('L1 宝箱 基数149 = 1043 (149×7)', () => eq(GE.chestGold(149, { level: 1 }), 1043));
t('L20 宝箱 > L1 同基数', () => ok(GE.chestGold(30, { level: 20 }) > 210));

// ── 6. 强化费用：委托 Economy ──
console.log('[6] 强化费用（委托 Economy.enhCost）');
t('enhCost(0) = 200', () => eq(GE.enhCost(0), 200));
t('enhCost(10) = Economy.enhCost(10)', () => eq(GE.enhCost(10), Econ.enhCost(10)));
t('enhCumulative(15) = Economy.enhCumulative(15)', () => eq(GE.enhCumulative(15), Econ.enhCumulative(15)));
t('强化费用随等级指数增长', () => ok(GE.enhCost(15) > GE.enhCost(10) && GE.enhCost(10) > GE.enhCost(5)));

// ── 7. canEnhance 状态判定 ──
console.log('[7] canEnhance 判定（上限 / 金币）');
const eq0 = { uid: 'x', baseAtk: 100, baseDef: 50, enhanceLevel: 0 };
t('+0 且金币充足 → ok', () => { const r = GE.canEnhance(eq0, 1000); ok(r.ok && r.cost === 200); });
t('+0 但金币不足 → insufficient-gold', () => { const r = GE.canEnhance(eq0, 100); ok(!r.ok && r.reason === 'insufficient-gold'); });
const eqMax = { uid: 'y', baseAtk: 999, baseDef: 999, enhanceLevel: 15 };
t('已达 +15 → max-level', () => { const r = GE.canEnhance(eqMax, 1e9); ok(!r.ok && r.reason === 'max-level'); });
t('无装备对象 → no-equip', () => ok(!GE.canEnhance(null, 1000).ok));

// ── 8. applyEnhance 纯逻辑 + 属性增益 ──
console.log('[8] applyEnhance（纯函数 / +8% 攻防 / 不污染入参）');
t('成功强化：返回副本，enhanceLevel +1，baseAtk×1.08', () => {
  const src = { uid: 'z', baseAtk: 100, baseDef: 50, enhanceLevel: 0 };
  const res = GE.applyEnhance(src, 1000);
  ok(res.ok && res.level === 1);
  eq(res.eq.baseAtk, 108); // 100×1.08
  eq(res.eq.baseDef, 54);  // 50×1.08
  // 入参未被修改
  eq(src.baseAtk, 100); eq(src.enhanceLevel, 0);
});
t('多次强化：+2 后 baseAtk ≈ 100×1.08²', () => {
  let cur = { uid: 'z', baseAtk: 100, baseDef: 50, enhanceLevel: 0 };
  cur = GE.applyEnhance(cur, 1e9).eq;
  cur = GE.applyEnhance(cur, 1e9).eq;
  eq(cur.enhanceLevel, 2);
  eq(cur.baseAtk, Math.round(108 * 1.08)); // 117
});
t('金币不足 → 不强化，返回 reason', () => {
  const src = { uid: 'z', baseAtk: 100, baseDef: 50, enhanceLevel: 0 };
  const res = GE.applyEnhance(src, 50);
  ok(!res.ok && res.reason === 'insufficient-gold' && src.enhanceLevel === 0);
});
t('已达上限 → 拒绝', () => {
  const src = { uid: 'm', baseAtk: 100, baseDef: 50, enhanceLevel: 15 };
  const res = GE.applyEnhance(src, 1e9);
  ok(!res.ok && res.reason === 'max-level');
});

// ── 9. 地图内容等级表 ──
console.log('[9] 地图内容等级表');
t('MAP_CONTENT_LEVEL 长度 6，与六幕对应', () => eq(GE.MAP_CONTENT_LEVEL.length, 6));
t('ENH_CAP = 15', () => eq(GE.ENH_CAP, 15));
t('ENH_PER_LEVEL = 0.08', () => eq(GE.ENH_PER_LEVEL, 0.08));

// ── 10. 异常 / 边界 ──
console.log('[10] 异常与边界');
t('monsterGold 非法 level（非数字）抛 TypeError', () => {
  let threw = false;
  try { GE.monsterGold(3, { level: 'x', mapIndex: 0, playerLevel: 1 }); } catch (e) { threw = e instanceof TypeError; }
  ok(threw);
});
t('monsterGold 负 defGold 仍返回数值（不崩）', () => {
  const g = GE.monsterGold(-3, { level: 1, mapIndex: 0, playerLevel: 1 });
  ok(Number.isFinite(g));
});
t('chestGold 负数基数被钳到最小 1', () => eq(GE.chestGold(-50, { level: 1 }), 1));

// ── 汇总 ──
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
else console.log('全部通过 ✅');
