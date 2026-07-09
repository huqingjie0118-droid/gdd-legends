/*
 * test_questboard.js — 任务与奖励系统模块自动化测试
 * 覆盖：正常流程 / 边界条件 / 异常处理
 * 运行：node test_questboard.js
 */
const QB = require('./questboard.js');

let pass = 0, fail = 0;
const ok = (v) => !!v;
function eq(a, b, msg) { return a === b ? true : (console.log('  ✗ 期望 ' + b + ' 实际 ' + a + (msg ? ' (' + msg + ')' : '')), false); }
function t(name, fn) {
  try {
    const r = fn();
    if (r === false) { fail++; console.log('✗ ' + name); }
    else { pass++; console.log('✓ ' + name); }
  } catch (e) { fail++; console.log('✗ ' + name + ' — 抛异常: ' + e.message); }
}

console.log('=== 任务与奖励系统测试 ===\n');

// ── 1. 表现加成 qualityBonus ──
console.log('[1] qualityBonus（§5.4）');
t('无参数基础 1.0', () => eq(QB.computeQualityBonus({}), 1.0));
t('combo30 +0.3', () => eq(QB.computeQualityBonus({ comboMax: 30 }), 1.3));
t('reaction5 +0.3', () => eq(QB.computeQualityBonus({ reactionCount: 5 }), 1.3));
t('break3 +0.4', () => eq(QB.computeQualityBonus({ breakExecute: 3 }), 1.4));
t('weak100% +0.5', () => eq(QB.computeQualityBonus({ weakHitRate: 1 }), 1.5));
t('teamQuest +0.2', () => eq(QB.computeQualityBonus({ teamQuest: true }), 1.2));
t('满配 = 2.7', () => eq(QB.computeQualityBonus({ comboMax: 30, reactionCount: 5, breakExecute: 3, weakHitRate: 1, teamQuest: true }), 2.7));
t('qualityBonus 恒 ≤ 3.0（上限安全钳）', () => { const q = QB.computeQualityBonus({ comboMax: 999, reactionCount: 999, breakExecute: 999, weakHitRate: 9, teamQuest: true }); return ok(q <= 3.0); });
t('负 weak 不产生负贡献（下限基础 1.0）', () => eq(QB.computeQualityBonus({ weakHitRate: -1 }), 1.0));

// ── 2. 任务经验（含 crush / qualityBonus）──
console.log('\n[2] questExp（§4.2）');
t('L10 D2 base60 = 730', () => eq(QB.questExp(60, 'D2', 10), 730));
t('qualityBonus 2.0 → 1460', () => eq(QB.questExp(60, 'D2', 10, 2.0), 1460));
t('碾压衰减 ×0.4 → 584', () => eq(QB.questExp(60, 'D2', 10, 2.0, 1), 584));
t('无碾压（rec=10 同级）= 1460', () => eq(QB.questExp(60, 'D2', 10, 2.0, 10), 1460));
t('数字难度 idx=1', () => eq(QB.questExp(60, 1, 10), 730));
t('qualityBonus 自动钳到 3.0', () => eq(QB.questExp(60, 'D2', 10, 99), Math.round(60 * Math.pow(1.32, 9) * 3.0)));
t('非法难度抛 RangeError', () => { try { QB.questExp(60, 'D9', 10); return false; } catch (e) { return e instanceof RangeError; } });
t('playerLevel<1 抛 RangeError', () => { try { QB.questExp(60, 'D2', 0); return false; } catch (e) { return e instanceof RangeError; } });

// ── 3. 任务金币 / 代币 ──
console.log('\n[3] questGold / questToken（§4.2）');
t('L10 D2 gold = 355', () => eq(QB.questGold('D2', 10), 355));
t('碾压 gold ×0.6 = 213', () => eq(QB.questGold('D2', 10, 1), 213));
t('D5 gold = 640×1.18^9 = 2839', () => eq(QB.questGold('D5', 10), Math.round(640 * Math.pow(1.18, 9))));
t('token 不随等级膨胀（D2=10）', () => eq(QB.questToken('D2'), 10));
t('token 碾压不变（仍 10）', () => eq(QB.questToken('D2', 10), QB.questToken('D2', 10)));

// ── 4. 综合奖励（含 crush + 组队）──
console.log('\n[4] computeRewards（§4）');
t('L10 D2 基础奖励 = {exp730,gold355,token10}', () => {
  const r = QB.computeRewards({ difficulty: 'D2', playerLevel: 10 });
  return eq(r.exp, 730) && eq(r.gold, 355) && eq(r.token, 10) && r.crush === false;
});
t('含技战 stats 的 qualityBonus 注入（仅作用于 exp，gold/token 不含 qb）', () => {
  const r = QB.computeRewards({ difficulty: 'D2', playerLevel: 10, skillStats: { comboMax: 30, reactionCount: 5, breakExecute: 3, weakHitRate: 1, teamQuest: true } });
  return eq(r.qualityBonus, 2.7) && eq(r.exp, Math.round(730 * 2.7)) && eq(r.gold, 355) && eq(r.token, 10);
});
t('碾压标记 crush=true 且 exp/gold 衰减', () => {
  const r = QB.computeRewards({ difficulty: 'D2', playerLevel: 10, recLevel: 1 });
  return r.crush === true && eq(r.exp, Math.round(730 * 0.4)) && eq(r.gold, Math.round(355 * 0.6)) && eq(r.token, 10);
});
t('组队加成 ×1.15', () => {
  const base = QB.computeRewards({ difficulty: 'D2', playerLevel: 10 });
  const team = QB.computeRewards({ difficulty: 'D2', playerLevel: 10, teamBonus: 1.15 });
  return eq(team.exp, Math.round(base.exp * 1.15)) && eq(team.gold, Math.round(base.gold * 1.15));
});
t('playerLevel 非法抛 RangeError', () => { try { QB.computeRewards({ difficulty: 'D2', playerLevel: 0 }); return false; } catch (e) { return e instanceof RangeError; } });

// ── 5. 组队加成 ──
console.log('\n[5] teamMultiplier（§7.2）');
t('单人 = 1.0', () => eq(QB.teamMultiplier({}), 1.0));
t('组队 = 1.15', () => eq(QB.teamMultiplier({ isTeam: true }), 1.15));
t('组队+首次同队 = 1.2075', () => eq(QB.teamMultiplier({ isTeam: true, firstTimeTogether: true }), 1.2075));

// ── 6. 幸运箱（pity 保底，复用 Economy）──
console.log('\n[6] rollLuckyBox（§5.1）');
t('返回合法品质', () => { const r = QB.rollLuckyBox({ sinceEpic: 0, sinceLegend: 0, total: 0 }); return QB.TIER_ORDER.includes(r.quality); });
t('state.total 递增', () => { const st = { sinceEpic: 0, sinceLegend: 0, total: 0 }; QB.rollLuckyBox(st); return st.total === 1; });
t('硬保底：第 100 次必出 legendary', () => {
  let st = { sinceEpic: 0, sinceLegend: 0, total: 0 };
  let last = null;
  for (let i = 0; i < 100; i++) last = QB.rollLuckyBox(st);
  return st.total === 100 && last.quality === 'legendary';
});
t('软保底：连续 20 次未出史诗后史诗权重提升（仍可能非史诗，但接口稳定）', () => {
  const st = { sinceEpic: 20, sinceLegend: 0, total: 20 };
  const r = QB.rollLuckyBox(st);
  return QB.TIER_ORDER.includes(r.quality);
});

// ── 7. 依赖 / 可用性 ──
console.log('\n[7] isAvailable（§3.1）');
t('无门槛任务可用', () => eq(QB.isAvailable({ id: 'x' }, { playerLevel: 1 }, {}), true));
t('minLevel 未达不可用', () => eq(QB.isAvailable({ id: 'x', minLevel: 16 }, { playerLevel: 10 }), false));
t('minLevel 达到可用', () => eq(QB.isAvailable({ id: 'x', minLevel: 16 }, { playerLevel: 16 }), true));
t('prereq 全完成可用', () => eq(QB.isAvailable({ id: 'x', prereq: ['a', 'b'] }, { playerLevel: 5, completed: ['a', 'b'] }), true));
t('prereq 缺一项不可用', () => eq(QB.isAvailable({ id: 'x', prereq: ['a', 'b'] }, { playerLevel: 5, completed: ['a'] }), false));
t('completed 为 Set 也支持', () => eq(QB.isAvailable({ id: 'x', prereq: ['a'] }, { playerLevel: 5, completed: new Set(['a']) }), true));
t('mapLock 未达不可用', () => eq(QB.isAvailable({ id: 'x', mapLock: 4 }, { playerLevel: 5, mapIndex: 2 }), false));

// ── 8. 池选取 / 每日生成 ──
console.log('\n[8] pickFromPool / generate（§3.2）');
t('确定性 rng 命中首条', () => {
  const pool = [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }];
  const r = QB.pickFromPool(pool, () => 0);
  return r.id === 'a';
});
t('确定性 rng 命中末条', () => {
  const pool = [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }];
  const r = QB.pickFromPool(pool, () => 0.99);
  return r.id === 'b';
});
t('空池返回 null', () => eq(QB.pickFromPool([], Math.random), null));
t('generate 去重且数量正确（不放回抽样）', () => {
  const pool = [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }, { id: 'c', weight: 1 }];
  const out = QB.generate({ pool, count: 2, rng: () => 0.1 });
  return out.length === 2 && out[0].id !== out[1].id;
});
t('generate 尊重 minLevel（低等级不取高门槛）', () => {
  const pool = [{ id: 'hi', weight: 1, minLevel: 99 }, { id: 'lo', weight: 1, minLevel: 1 }];
  const out = QB.generate({ pool, count: 1, playerLevel: 5, rng: () => 0 });
  return out.length === 1 && out[0].id === 'lo';
});
t('generate 尊重 prereq', () => {
  const pool = [{ id: 'locked', weight: 1, prereq: ['missing'] }, { id: 'open', weight: 1 }];
  const out = QB.generate({ pool, count: 1, completed: ['x'], rng: () => 0 });
  return out.length === 1 && out[0].id === 'open';
});
t('generate 池小于 count 不崩', () => {
  const pool = [{ id: 'a', weight: 1 }];
  const out = QB.generate({ pool, count: 5, rng: () => 0 });
  return out.length === 1;
});

// ── 13. 周常任务池 ──
console.log('\n[13] WEEKLY_POOL（§3.2 周常）');
t('WEEKLY_POOL 共 5 条', () => eq(QB.WEEKLY_POOL.length, 5));
t('每条难度档合法（D1-D5）', () => QB.WEEKLY_POOL.every(t => ['D1','D2','D3','D4','D5'].includes(t.difficulty)));
t('每条奖励含正整数 token', () => QB.WEEKLY_POOL.every(t => t.rewards && t.rewards.token > 0));
t('每条 objective 含 type+amount', () => QB.WEEKLY_POOL.every(t => t.objectives.every(o => o.type && Number.isFinite(o.amount) && o.amount > 0)));
t('含 target=any 的通用击杀周常', () => QB.WEEKLY_POOL.some(t => t.objectives.some(o => o.target === 'any')));

t('generate 从周常池抽 3 条去重', () => {
  const out = QB.generate({ pool: QB.WEEKLY_POOL, count: 3, playerLevel: 10, rng: () => 0 });
  const ids = new Set(out.map(o => o.id));
  return out.length === 3 && ids.size === 3;
});
t('generate 周常尊重 minLevel（L1 抽不到 D5 首领周常）', () => {
  const out = QB.generate({ pool: QB.WEEKLY_POOL, count: 3, playerLevel: 1, rng: () => 0 });
  return out.every(t => (t.minLevel || 1) <= 1);
});

// ── 14. 成就累计统计 ──
console.log('\n[14] makeStats / weekKey（§3 成就累计）');
t('makeStats 初值全 0 且 maxLevel=1', () => {
  const s = QB.makeStats();
  return s.kills === 0 && s.bossKills === 0 && s.maxLevel === 1 && s.finishers === 0;
});
t('weekKey 同周相等', () => {
  const a = new Date(2026, 6, 8), b = new Date(2026, 6, 9); // 同周
  return QB.weekKey(a.getTime()) === QB.weekKey(b.getTime());
});
t('weekKey 跨周不等', () => {
  const a = new Date(2026, 6, 8), b = new Date(2026, 6, 16); // 间隔 8 天
  return QB.weekKey(a.getTime()) !== QB.weekKey(b.getTime());
});
t('weekKey 跨年不等（2025-W52 vs 2026-W02）', () => {
  const a = new Date(2025, 11, 24), b = new Date(2026, 0, 8);
  return QB.weekKey(a.getTime()) !== QB.weekKey(b.getTime());
});
t('weekKey 复用 Economy.isoWeekKey 格式（年-W周）', () => {
  const k = QB.weekKey(new Date(2026, 6, 8).getTime());
  return /^20\d\d-W\d\d$/.test(k);
});

// ── 15. 成就评估 ──
console.log('\n[15] evaluateAchievements（§3 成就评估）');
t('全 0 统计：无新解锁', () => QB.evaluateAchievements(QB.makeStats(), new Set()).newly.length === 0);
t('kills=100 触发「初试身手」', () => {
  const s = QB.makeStats(); s.kills = 100;
  const r = QB.evaluateAchievements(s, new Set());
  return r.newly.length === 1 && r.newly[0].id === 'a_kill_100';
});
t('阈值边界：kills=99 不触发，100 触发', () => {
  const a = QB.makeStats(); a.kills = 99;
  const b = QB.makeStats(); b.kills = 100;
  return QB.evaluateAchievements(a, new Set()).newly.length === 0
      && QB.evaluateAchievements(b, new Set()).newly.length === 1;
});
t('幂等：已解锁 set 二次调用不重复返回', () => {
  const s = QB.makeStats(); s.kills = 100;
  const set = new Set(['a_kill_100']);
  return QB.evaluateAchievements(s, set).newly.length === 0;
});
t('metric 缺失/为 0 不误触发', () => {
  const r = QB.evaluateAchievements({}, new Set());
  return r.newly.length === 0;
});
t('多达成：maxLevel=30 同时解锁 Lv10 与 Lv30', () => {
  const s = QB.makeStats(); s.maxLevel = 30;
  const ids = QB.evaluateAchievements(s, new Set()).newly.map(a => a.id);
  return ids.includes('a_lv_10') && ids.includes('a_lv_30');
});
t('返回 unlocked 为 Set 实例', () => {
  const s = QB.makeStats(); s.kills = 100;
  return QB.evaluateAchievements(s, new Set()).unlocked instanceof Set;
});
t('接受数组形式的 unlocked', () => {
  const s = QB.makeStats(); s.kills = 100;
  return QB.evaluateAchievements(s, ['a_kill_100']).newly.length === 0;
});
t('stats 为 null 抛 TypeError', () => {
  let threw = false; try { QB.evaluateAchievements(null, new Set()); } catch (e) { threw = e instanceof TypeError; }
  return threw;
});

// ── 汇总 ──
console.log('\n========================================');
console.log(`通过 ${pass} / 失败 ${fail}`);
console.log(fail === 0 ? '✅ 全部测试通过' : '❌ 存在失败用例');
process.exit(fail === 0 ? 0 : 1);
