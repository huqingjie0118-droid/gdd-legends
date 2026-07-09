/**
 * test_sets.js — 套装联动纯函数测试
 * 运行：node test_sets.js
 */
const Sets = require('./sets.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.log('  ✗ ' + name + ' → ' + e.message); }
}
function eq(a, b, m) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((m || 'eq') + ` 期望 ${JSON.stringify(b)} 实际 ${JSON.stringify(a)}`);
}
function ok(c, m) { if (!c) throw new Error(m || 'ok 失败'); }
function approx(a, b, e, m) {
  if (Math.abs(a - b) > (e || 1e-9)) throw new Error((m || 'approx') + ` 期望≈${b} 实际 ${a}`);
}

// ── 1. SETS 数据完整性 ───────────────────────────────
t('SETS 含 6 个套装', () => { eq(Object.keys(Sets.SETS).length, 6, '套装数'); });
t('每套含 2pc 与 4pc 两档（swift 含两个 2pc）', () => {
  for (const id in Sets.SETS) {
    const bs = Sets.SETS[id].bonuses;
    ok(bs.some(b => b.need === 2), id + ' 缺 2pc');
    ok(bs.some(b => b.need === 4), id + ' 缺 4pc');
  }
});
t('每条 bonus 有合法 kind + desc', () => {
  const kinds = ['elemMult', 'statMult', 'statAdd', 'proc'];
  for (const id in Sets.SETS)
    for (const b of Sets.SETS[id].bonuses) {
      ok(kinds.includes(b.kind), id + ' 非法 kind:' + b.kind);
      ok(typeof b.desc === 'string' && b.desc.length > 0, id + ' 缺 desc');
    }
});
t('elemMult 仅含合法元素键', () => {
  for (const id in Sets.SETS)
    for (const b of Sets.SETS[id].bonuses)
      if (b.kind === 'elemMult')
        ok(Sets.ELEMENTS.includes(b.element), id + ' 非法元素:' + b.element);
});

// ── 2. equippedSets 计数 ─────────────────────────────
function eq_(set, slot) { return { uid: 'u' + Math.random(), slotKey: slot, set }; }
t('空装备 → 所有套装计数为 0', () => {
  const c = Sets.equippedSets({});
  for (const id in Sets.SETS) eq(c[id], 0);
});
t('单件 → 对应套装计数 1，他套 0', () => {
  const c = Sets.equippedSets([eq_('flame', 'weapon')]);
  eq(c.flame, 1);
  eq(c.frost, 0); eq(c.thunder, 0); eq(c.earth, 0); eq(c.blood, 0); eq(c.swift, 0);
});
t('2 件同套 → 计数 2', () => {
  const c = Sets.equippedSets([eq_('frost', 'weapon'), eq_('frost', 'helmet')]);
  eq(c.frost, 2);
});
t('跨套装独立计数', () => {
  const c = Sets.equippedSets([
    eq_('flame', 'weapon'), eq_('flame', 'helmet'), eq_('flame', 'armor'), eq_('flame', 'belt'),
    eq_('earth', 'boots'), eq_('earth', 'ring1'),
  ]);
  eq(c.flame, 4); eq(c.earth, 2); eq(c.blood, 0);
});
t('无 set 字段的装备不计数', () => {
  const c = Sets.equippedSets([{ uid: 'x', slotKey: 'weapon' }]);
  for (const id in Sets.SETS) eq(c[id], 0);
});
t('数组入参与对象入参等价', () => {
  const arr = [eq_('blood', 'ring1'), eq_('blood', 'ring2')];
  const obj = { ring1: arr[0], ring2: arr[1] };
  eq(Sets.equippedSets(arr).blood, Sets.equippedSets(obj).blood);
});

// ── 3. activeSetBonuses 聚合 ─────────────────────────
t('无套装 → elemMult 全 1 / procs 空', () => {
  const b = Sets.activeSetBonuses({});
  eq(b.elemMult, { fire: 1, ice: 1, spirit: 1, earth: 1 });
  eq(Object.keys(b.procs).length, 0);
});
t('烈焰 2pc → 火伤 ×1.18', () => {
  const b = Sets.activeSetBonuses([eq_('flame', 'weapon'), eq_('flame', 'helmet')]);
  approx(b.elemMult.fire, 1.18, 1e-9);
  eq(b.elemMult.ice, 1); eq(b.elemMult.spirit, 1);
});
t('烈焰 4pc → 火伤 ×1.18 + burn proc=3', () => {
  const b = Sets.activeSetBonuses([
    eq_('flame', 'weapon'), eq_('flame', 'helmet'), eq_('flame', 'armor'), eq_('flame', 'belt'),
  ]);
  approx(b.elemMult.fire, 1.18, 1e-9);
  eq(b.procs.burn, 3);
});
t('磐石 2pc → statPct.def ×1.20', () => {
  const b = Sets.activeSetBonuses([eq_('earth', 'boots'), eq_('earth', 'ring1')]);
  approx(b.statPct.def, 1.20, 1e-9);
});
t('嗜血 2pc → statAdd.lifesteal +0.12', () => {
  const b = Sets.activeSetBonuses([eq_('blood', 'ring1'), eq_('blood', 'ring2')]);
  approx(b.statAdd.lifesteal, 0.12, 1e-9);
});
t('疾风 2pc → moveSpeed ×1.15 且 atkSpeed ×1.10', () => {
  const b = Sets.activeSetBonuses([eq_('swift', 'boots'), eq_('swift', 'belt')]);
  approx(b.statPct.moveSpeed, 1.15, 1e-9);
  approx(b.statPct.atkSpeed, 1.10, 1e-9);
});
t('疾风 4pc → 额外 dash proc=0.6', () => {
  const b = Sets.activeSetBonuses([
    eq_('swift', 'boots'), eq_('swift', 'belt'), eq_('swift', 'weapon'), eq_('swift', 'helmet'),
  ]);
  approx(b.statPct.moveSpeed, 1.15, 1e-9);
  approx(b.statPct.atkSpeed, 1.10, 1e-9);
  approx(b.procs.dash, 0.6, 1e-9);
});
t('雷霆 4pc → chain proc=0.5 且 spirt ×1.18', () => {
  const b = Sets.activeSetBonuses([
    eq_('thunder', 'weapon'), eq_('thunder', 'helmet'), eq_('thunder', 'armor'), eq_('thunder', 'belt'),
  ]);
  approx(b.elemMult.spirt, 1.18, 1e-9);
  approx(b.procs.chain, 0.5, 1e-9);
});
t('不同套装元素乘子独立叠加（不串台）', () => {
  const b = Sets.activeSetBonuses([
    eq_('flame', 'weapon'), eq_('flame', 'helmet'),
    eq_('thunder', 'ring1'), eq_('thunder', 'ring2'),
  ]);
  approx(b.elemMult.fire, 1.18, 1e-9);
  approx(b.elemMult.spirt, 1.18, 1e-9);
  eq(b.elemMult.ice, 1); eq(b.elemMult.earth, 1);
});
t('仅 3 件 → 不触发 4pc（burn 不出现）', () => {
  const b = Sets.activeSetBonuses([eq_('flame', 'weapon'), eq_('flame', 'helmet'), eq_('flame', 'armor')]);
  approx(b.elemMult.fire, 1.18, 1e-9);
  ok(!('burn' in b.procs), '3 件不应有 burn proc');
});

// ── 4. setCollection 图鉴 ───────────────────────────
t('setCollection 返回 6 项且带 have/bonuses', () => {
  const col = Sets.setCollection([eq_('flame', 'weapon'), eq_('flame', 'helmet'), eq_('flame', 'armor'), eq_('flame', 'belt')]);
  eq(col.length, 6);
  const flame = col.find(c => c.id === 'flame');
  eq(flame.have, 4);
  ok(flame.bonuses.every(b => typeof b.active === 'boolean'), 'bonus.active 应为布尔');
  ok(flame.bonuses.filter(b => b.active).length === 2, '4 件应激活 2 档');
});

// ── 5. rollSetForEquip 装备分配 ─────────────────────
t('rng=()=>1 → 永不分配套装（返回 null）', () => {
  for (let i = 0; i < 20; i++) ok(Sets.rollSetForEquip(0.42, () => 1) === null, '应返回 null');
});
t('rng=()=>0 → 必定分配且为合法套装 id', () => {
  for (let i = 0; i < 20; i++) {
    const s = Sets.rollSetForEquip(0.42, () => 0);
    ok(s && Sets.SETS[s], '应返回合法套装 id，实际:' + s);
  }
});
t('默认 prob=0.42：rng<0.42 命中', () => {
  ok(Sets.rollSetForEquip(0.42, () => 0.4) !== null, '0.4<0.42 应分配');
  ok(Sets.rollSetForEquip(0.42, () => 0.5) === null, '0.5>0.42 不应分配');
});

// ── 汇总 ─────────────────────────────────────────────
console.log(`套装联动 sets.js 测试：通过 ${pass} / ${pass + fail}` + (fail ? '  ❌' : '  ✅'));
if (fail) process.exit(1);
