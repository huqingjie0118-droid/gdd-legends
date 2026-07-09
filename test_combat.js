/*
 * test_combat.js —— combat.js 自动化测试（正常 / 边界 / 异常）
 * 运行：node test_combat.js
 */
const C = require('./combat.js');

let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('assert false'); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' → ' + e.message); console.log('  ✗ ' + name + ' → ' + e.message); }
}
function eq(a, b) { return a === b || (Math.abs(a - b) < 1e-9); }
function ok(b) { return b === true; }
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

console.log('==== combat.js 测试 ====');

// ── 1. 连招计数与衰减 ──
console.log('[1] 连招计数 / 衰减窗口');
t('首次命中 combo=1', () => { const f = C.makeFighter(); return eq(C.registerCombo(f, 1000), 1); });
t('窗口内连续命中累加', () => { const f = C.makeFighter(); C.registerCombo(f, 1000); C.registerCombo(f, 2000); return eq(f.combo, 2); });
t('超过窗口先清零再 +1', () => {
  const f = C.makeFighter(); f.comboWindow = 2500;
  C.registerCombo(f, 1000); C.registerCombo(f, 2000); C.registerCombo(f, 3000);
  C.registerCombo(f, 3000 + 2500 + 1); // 相对 lastHit(3000) 超时 → 清零后 +1
  return eq(f.combo, 1);
});
t('expireCombo 窗口过期归零', () => {
  const f = C.makeFighter(); C.registerCombo(f, 1000); C.registerCombo(f, 2000);
  const cleared = C.expireCombo(f, 2000 + 2500 + 1);
  return ok(cleared) && eq(f.combo, 0);
});
t('expireCombo 窗口内不归零', () => {
  const f = C.makeFighter(); C.registerCombo(f, 1000);
  return ok(!C.expireCombo(f, 1000 + 100)) && eq(f.combo, 1);
});
t('lastHit 初值(-1e9)不触发清零', () => {
  const f = C.makeFighter({ comboWindow: 2500 });
  C.registerCombo(f, 5000);
  return eq(f.combo, 1);
});

// ── 2. 连击阶梯增益 ──
console.log('[2] 连击阶梯增益');
t('combo=4 无增益', () => { const b = C.comboDamageBonus(4, false); return approx(b.dmgMult, 1.0) && eq(b.critBonus, 0); });
t('combo=5 → +8% 伤害', () => { const b = C.comboDamageBonus(5, false); return approx(b.dmgMult, 1.08); });
t('combo=10 → +15%', () => { const b = C.comboDamageBonus(10, false); return approx(b.dmgMult, 1.15); });
t('combo=20 → +25% + 暴击+10%', () => {
  const b = C.comboDamageBonus(20, false);
  return approx(b.dmgMult, 1.25) && approx(b.critBonus, 0.10);
});
t('combo=30 → +35% (取最高档)', () => { const b = C.comboDamageBonus(30, false); return approx(b.dmgMult, 1.35); });
t('Boss 连击增益衰减 ×0.4', () => {
  const b = C.comboDamageBonus(10, true);
  return approx(b.dmgMult, 1 + 0.15 * 0.4);
});
t('comboCritBonus 在 ≥20 给 +0.10', () => { return eq(C.comboCritBonus(20), 0.10) && eq(C.comboCritBonus(19), 0); });

// ── 3. 终结技 ──
console.log('[3] 终结技');
t('combo<30 不可终结', () => { return ok(!C.finisherAvailable(29)); });
t('combo>=30 可终结', () => { return ok(C.finisherAvailable(30)); });
t('终结倍率 = 1 + count×0.15', () => { return approx(C.finisherMultiplier(30), 1 + 30 * 0.15); });
t('终结倍率封顶 6.0', () => { return approx(C.finisherMultiplier(100), 6.0); });
t('终结倍率下限 1.0', () => { return approx(C.finisherMultiplier(0), 1.0); });

// ── 4. 弱点 / 抗性 ──
console.log('[4] 弱点 / 抗性');
t('无抗性 → ×1.0', () => { return approx(C.weaknessMultiplier({}, 'fire'), 1.0); });
t('弱点(resist=-0.3) → ×1.3', () => { return approx(C.weaknessMultiplier({ fire: -0.3 }, 'fire'), 1.3); });
t('抗性(resist=0.2) → ×0.8', () => { return approx(C.weaknessMultiplier({ fire: 0.2 }, 'fire'), 0.8); });
t('弱点倍率有上限 3.0', () => { return approx(C.weaknessMultiplier({ ice: -5 }, 'ice'), 3.0); });
t('抗性倍率有下限 0.3', () => { return approx(C.weaknessMultiplier({ phys: 5 }, 'phys'), 0.3); });
t('未知伤害类型按 0 处理', () => { return approx(C.weaknessMultiplier({}, 'unknown'), 1.0); });

// ── 5. 元素反应：六组合 + 抗性缩放 + 同元素 ──
console.log('[5] 元素反应');
const pairs = [
  ['fire', 'ice', 'melt'], ['fire', 'spirit', 'overload'], ['fire', 'phys', 'shatter'],
  ['ice', 'phys', 'frostfield'], ['ice', 'spirit', 'superconduct'], ['spirit', 'spirit', 'charge'],
];
pairs.forEach(([a, b, name]) => {
  t(`反应 ${a}+${b} → ${name}`, () => {
    const r = C.computeReaction(a, b, {});
    return r && r.name === name;
  });
});
t('同元素不反应', () => { return C.computeReaction('fire', 'fire', {}) === null; });
t('融化 dmgMult 基础 0.60', () => { return approx(C.computeReaction('fire', 'ice', {}).dmgMult, 0.60); });
t('冰抗怪上 融化 被缩放减少', () => {
  const full = C.computeReaction('fire', 'ice', {}).dmgMult;
  const scaled = C.computeReaction('fire', 'ice', { ice: 0.4 }).dmgMult;
  return approx(scaled, full * (1 - 0.5 * 0.4)) && scaled < full;
});
t('反应缩放下限 0.3', () => {
  const r = C.computeReaction('fire', 'ice', { fire: 1, ice: 1 }).dmgMult;
  return approx(r, 0.60 * 0.3);
});
t('processElementHit 同元素只刷新附着', () => {
  const f = C.makeFighter(); const r = C.processElementHit(f, 'fire', 1000);
  return r.reaction === null && f.aura === 'fire';
});
t('processElementHit 异元素触发反应并刷新', () => {
  const f = C.makeFighter();
  C.processElementHit(f, 'ice', 1000);
  const r = C.processElementHit(f, 'fire', 1500); // 冰+火=融化
  return r.reaction && r.reaction.name === 'melt' && f.aura === 'fire';
});
t('超导施加降防状态', () => {
  const f = C.makeFighter();
  C.processElementHit(f, 'ice', 1000);
  const r = C.processElementHit(f, 'spirit', 1500);
  return r.reaction.name === 'superconduct' && f.defDownAmt === 0.4 && f.defDownUntil > 1500;
});
t('冻土施加减速状态', () => {
  const f = C.makeFighter();
  C.processElementHit(f, 'phys', 1000);
  const r = C.processElementHit(f, 'ice', 1500);
  return r.reaction.name === 'frostfield' && f.slowAmt === 0.5 && f.slowUntil > 1500 && f.pendingDot === 1;
});
t('裂甲施加破甲(burn)标记', () => {
  const f = C.makeFighter();
  C.processElementHit(f, 'fire', 1000);
  const r = C.processElementHit(f, 'phys', 1500);
  return r.reaction.name === 'shatter' && f.pendingBurn === 1 && f.defDownAmt >= 0.3;
});
t('非法元素抛 RangeError', () => { try { C.processElementHit(C.makeFighter(), 'water', 1000); return false; } catch (e) { return e instanceof RangeError; } });

// ── 6. 韧性 / 破防 ──
console.log('[6] 韧性 / 破防');
t('addPoise 普通累加', () => { const f = C.makeFighter({ maxPoise: 40 }); C.addPoise(f, 10, false); return eq(f.poise, 10); });
t('addPoise 重型 ×2', () => { const f = C.makeFighter({ maxPoise: 40 }); C.addPoise(f, 10, true); return eq(f.poise, 20); });
t('addPoise 不超上限', () => { const f = C.makeFighter({ maxPoise: 40 }); C.addPoise(f, 100, false); return eq(f.poise, 40); });
t('未达韧性不破防', () => { const f = C.makeFighter({ maxPoise: 40 }); C.addPoise(f, 30, false); return ok(!C.checkBreak(f, 1000)); });
t('达韧性触发破防并设置易伤窗口', () => {
  const f = C.makeFighter({ maxPoise: 40 }); C.addPoise(f, 40, false);
  const broke = C.checkBreak(f, 1000, 2000);
  return ok(broke) && ok(C.isBroken(f, 1500)) && ok(C.isBroken(f, 2999)) && ok(!C.isBroken(f, 3001));
});
t('破防期间易伤 ×2', () => {
  const f = C.makeFighter({ maxPoise: 40 }); C.addPoise(f, 40, false); C.checkBreak(f, 1000, 2000);
  return eq(C.vulnerableMult(f, 1500), 2.0) && eq(C.vulnerableMult(f, 4000), 1.0);
});
t('破防后韧性清零', () => {
  const f = C.makeFighter({ maxPoise: 40 }); C.addPoise(f, 40, false); C.checkBreak(f, 1000);
  return eq(f.poise, 0);
});

// ── 7. 处决 ──
console.log('[7] 处决');
t('非重型不处决', () => {
  const f = C.makeFighter({ hp: 100, maxHp: 100 }); f.breakUntil = 2000;
  return C.executeResult(f, 1000, { isHeavy: false }) === null;
});
t('小怪破防+重型 → 秒杀(dmg=hp)', () => {
  const f = C.makeFighter({ hp: 80, maxHp: 100 });
  const r = C.executeResult(f, 1000, { isHeavy: true });
  return r && r.executed && r.instakill && eq(r.dmg, 80);
});
t('Boss 破防+重型 → 最大生命%', () => {
  const f = C.makeFighter({ isBoss: true, hp: 5000, maxHp: 5000 }); f.breakUntil = 2000;
  const r = C.executeResult(f, 1000, { isHeavy: true });
  return r && r.boss && eq(r.dmg, Math.round(5000 * 0.08));
});
t('BOSS 处决比例可配', () => {
  const f = C.makeFighter({ isBoss: true, hp: 5000, maxHp: 5000 }); f.breakUntil = 2000;
  const r = C.executeResult(f, 1000, { isHeavy: true, execPctBoss: 0.15 });
  return eq(r.dmg, 750);
});
t('未破防但低血线 → 仍可处决', () => {
  const f = C.makeFighter({ hp: 10, maxHp: 100 }); // 10% < 15% 阈值
  const r = C.executeResult(f, 1000, { isHeavy: true });
  return r && r.executed;
});
t('未破防且血线高 → 不处决', () => {
  const f = C.makeFighter({ hp: 90, maxHp: 100 });
  return C.executeResult(f, 1000, { isHeavy: true }) === null;
});
t('低血阈值可配', () => {
  const f = C.makeFighter({ hp: 20, maxHp: 100 }); // 20% > 15% 但 < 25%
  const r1 = C.executeResult(f, 1000, { isHeavy: true, execHpThreshold: 0.25 });
  const r2 = C.executeResult(f, 1000, { isHeavy: true, execHpThreshold: 0.15 });
  return r1 && r1.executed && !r2;
});

// ── 8. 综合伤害结算 ──
console.log('[8] 综合伤害结算 resolveDamage');
t('纯基础伤害（无连击/弱点/易伤）', () => {
  const r = C.resolveDamage(100, { combo: 0, isBoss: false, fighter: C.makeFighter(), now: 1000, dmgType: 'phys' });
  return eq(r.dmg, 100);
});
t('连击 +8% 叠加', () => {
  const r = C.resolveDamage(100, { combo: 5, isBoss: false, fighter: C.makeFighter(), now: 1000, dmgType: 'phys' });
  return eq(r.dmg, 108);
});
t('弱点 ×1.3 叠加', () => {
  const r = C.resolveDamage(100, { combo: 0, isBoss: false, fighter: C.makeFighter(), resist: { phys: -0.3 }, now: 1000, dmgType: 'phys' });
  return eq(r.dmg, 130) && ok(r.weak);
});
t('破防易伤 ×2 叠加', () => {
  const f = C.makeFighter({ maxPoise: 40 }); C.addPoise(f, 40, false); C.checkBreak(f, 1000, 2000);
  const r = C.resolveDamage(100, { combo: 0, isBoss: false, fighter: f, now: 1500, dmgType: 'phys' });
  return eq(r.dmg, 200);
});
t('降防状态 ×(1-defDown) 叠加', () => {
  const f = C.makeFighter(); f.defDownAmt = 0.4; f.defDownUntil = 5000;
  const r = C.resolveDamage(100, { combo: 0, isBoss: false, fighter: f, now: 1000, dmgType: 'phys' });
  return eq(r.dmg, 60);
});
t('复合：连击+弱点+易伤 → 108×1.3×2≈281', () => {
  const f = C.makeFighter({ maxPoise: 40 }); C.addPoise(f, 40, false); C.checkBreak(f, 1000, 2000);
  const r = C.resolveDamage(100, { combo: 5, isBoss: false, fighter: f, resist: { phys: -0.3 }, now: 1500, dmgType: 'phys' });
  return eq(r.dmg, Math.round(100 * 1.08 * 1.3 * 2));
});
t('伤害下限为 1', () => {
  const r = C.resolveDamage(0.001, { combo: 0, isBoss: false, fighter: C.makeFighter(), now: 1000, dmgType: 'phys' });
  return eq(r.dmg, 1);
});

// ── 9. 边界：参数钳制 / 非法输入 ──
console.log('[9] 边界与异常');
t('makeFighter 默认 maxPoise（Boss=100/普通=40）', () => {
  return eq(C.makeFighter({ isBoss: true }).maxPoise, 100) && eq(C.makeFighter({}).maxPoise, 40);
});
t('resist 非对象不崩', () => { return approx(C.weaknessMultiplier(null, 'fire'), 1.0); });
t('comboDamageBonus 负连击 → 无增益', () => { const b = C.comboDamageBonus(-10, false); return approx(b.dmgMult, 1.0); });
t('resolveDamage 缺 fighter → 只算连击+弱点', () => {
  const r = C.resolveDamage(100, { combo: 5, isBoss: false, now: 1000, dmgType: 'phys' });
  return eq(r.dmg, 108);
});

console.log('\n==== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ====');
if (fail > 0) { console.log('失败项：'); fails.forEach(x => console.log('  - ' + x)); process.exit(1); }
else { console.log('全部通过 ✅'); process.exit(0); }
