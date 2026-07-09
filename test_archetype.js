/*
 * test_archetype.js —— archetype.js 自动化测试
 */
const A = require('./archetype.js');

let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('assert false'); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' → ' + e.message); console.log('  ✗ ' + name + ' → ' + e.message); }
}
function eq(a, b) { return a === b; }
function ok(v) { return v === true; }

console.log('==== archetype.js 测试 ====');

// ── 1. 定义 ──
console.log('[1] 流派定义');
t('ARCHETYPE_DEFS 3职业', () => eq(Object.keys(A.ARCHETYPE_DEFS).length, 3));
t('战士3流派', () => eq(A.ARCHETYPE_DEFS.warrior.length, 3));
t('法师3流派', () => eq(A.ARCHETYPE_DEFS.mage.length, 3));
t('道士3流派', () => eq(A.ARCHETYPE_DEFS.taoist.length, 3));
t('每个流派5个技能', () => A.ARCHETYPE_DEFS.warrior.every(a => a.skillTree.length === 5));

// ── 2. 状态 ──
console.log('[2] 状态管理');
t('makeArchetypeState 默认', () => {
  const s = A.makeArchetypeState();
  return ok(s.selected === null && Object.keys(s.unlockedSkills).length === 0 && s.skillPoints === 0);
});
t('getArchetypes 返回列表', () => eq(A.getArchetypes('warrior').length, 3));
t('getArchetypes 非法职业空数组', () => eq(A.getArchetypes('unknown').length, 0));
t('getArchetype 按id查找', () => {
  const a = A.getArchetype('warrior', 'berserker');
  return ok(a && a.name === '狂战士');
});
t('getArchetype 不存在→null', () => ok(A.getArchetype('warrior', 'nonexistent') === null));

// ── 3. 觉醒条件 ──
console.log('[3] 觉醒条件');
t('canAwaken 等级不足', () => !A.canAwaken('warrior', 'berserker', 20, A.makeArchetypeState()));
t('canAwaken 等级达标', () => A.canAwaken('warrior', 'berserker', 30, A.makeArchetypeState()));
t('canAwaken 已有其他流派→false', () => {
  const s = A.makeArchetypeState(); s.selected = 'guardian';
  return !A.canAwaken('warrior', 'berserker', 30, s);
});
t('canAwaken 相同流派→true', () => {
  const s = A.makeArchetypeState(); s.selected = 'berserker';
  return A.canAwaken('warrior', 'berserker', 30, s);
});

// ── 4. 觉醒 ──
console.log('[4] 觉醒');
t('awaken 成功', () => {
  const s = A.makeArchetypeState();
  const r = A.awaken('warrior', 'berserker', 30, s);
  return ok(r.ok && s.selected === 'berserker' && s.skillPoints >= 3);
});
t('awaken 条件不足', () => {
  const s = A.makeArchetypeState();
  const r = A.awaken('warrior', 'berserker', 20, s);
  return !r.ok;
});
t('awaken 返回加成', () => {
  const s = A.makeArchetypeState();
  const r = A.awaken('warrior', 'berserker', 30, s);
  return ok(r.bonuses && r.bonuses.atkPct > 0);
});

// ── 5. 技能学习 ──
console.log('[5] 技能学习');
t('canLearnSkill 未觉醒→false', () => {
  const s = A.makeArchetypeState();
  return !A.canLearnSkill('warrior', 'berserker', 'b_s1', s);
});
t('canLearnSkill 觉醒后可学', () => {
  const s = A.makeArchetypeState(); A.awaken('warrior', 'berserker', 30, s);
  return A.canLearnSkill('warrior', 'berserker', 'b_s1', s);
});
t('learnSkill 消耗点数', () => {
  const s = A.makeArchetypeState(); A.awaken('warrior', 'berserker', 30, s);
  const before = s.skillPoints;
  A.learnSkill('warrior', 'berserker', 'b_s1', s);
  return ok(s.skillPoints < before && s.unlockedSkills.b_s1);
});
t('不能重复学同一技能', () => {
  const s = A.makeArchetypeState(); A.awaken('warrior', 'berserker', 30, s);
  A.learnSkill('warrior', 'berserker', 'b_s1', s);
  return !A.canLearnSkill('warrior', 'berserker', 'b_s1', s);
});
t('Tier2需要前置', () => {
  const s = A.makeArchetypeState(); A.awaken('warrior', 'berserker', 30, s);
  return !A.canLearnSkill('warrior', 'berserker', 'b_s2', s);
});
t('学完前置可学Tier2', () => {
  const s = A.makeArchetypeState(); A.awaken('warrior', 'berserker', 30, s);
  A.learnSkill('warrior', 'berserker', 'b_s1', s);
  return A.canLearnSkill('warrior', 'berserker', 'b_s2', s);
});

// ── 6. 加成计算 ──
console.log('[6] 加成计算');
t('未觉醒→空加成', () => {
  const b = A.getActiveBonuses('warrior', A.makeArchetypeState());
  return eq(Object.keys(b).length, 0);
});
t('觉醒后含基础加成', () => {
  const s = A.makeArchetypeState(); A.awaken('warrior', 'berserker', 30, s);
  const b = A.getActiveBonuses('warrior', s);
  return ok(b.atkPct > 0);
});
t('学技能后含技能加成', () => {
  const s = A.makeArchetypeState(); A.awaken('warrior', 'berserker', 30, s);
  A.learnSkill('warrior', 'berserker', 'b_s1', s);
  const b = A.getActiveBonuses('warrior', s);
  return ok(b.lowHpAtk > 0);
});

// ── 7. 终极技 ──
console.log('[7] 终极技');
t('未学终极技→null', () => {
  const s = A.makeArchetypeState(); A.awaken('warrior', 'berserker', 30, s);
  return ok(A.getUltimateSkill('warrior', s) === null);
});
t('学完终极技→有数据', () => {
  const s = A.makeArchetypeState(); A.awaken('warrior', 'berserker', 30, s);
  s.skillPoints = 50; // 加满点数
  for (let i = 1; i <= 5; i++) A.learnSkill('warrior', 'berserker', 'b_s' + i, s);
  const ult = A.getUltimateSkill('warrior', s);
  return ok(ult && ult.name === '觉醒·战神之怒' && ult.effects.length >= 3);
});

// ── 8. 进度 ──
console.log('[8] 进度');
t('archetypeProgress 未觉醒→0', () => eq(A.archetypeProgress('warrior', A.makeArchetypeState()), 0));
t('archetypeProgress 学1个→20%', () => {
  const s = A.makeArchetypeState(); A.awaken('warrior', 'berserker', 30, s);
  A.learnSkill('warrior', 'berserker', 'b_s1', s);
  return eq(A.archetypeProgress('warrior', s), 20);
});
t('archetypeProgress 全学→100%', () => {
  const s = A.makeArchetypeState(); A.awaken('warrior', 'berserker', 30, s);
  s.skillPoints = 50;
  for (let i = 1; i <= 5; i++) A.learnSkill('warrior', 'berserker', 'b_s' + i, s);
  return eq(A.archetypeProgress('warrior', s), 100);
});

console.log('\n==== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ====');
if (fail > 0) { console.log('失败项：'); fails.forEach(x => console.log('  - ' + x)); process.exit(1); }
else { console.log('全部通过 ✅'); process.exit(0); }
